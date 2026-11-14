import {
  AnalysisResult,
  SportCategory,
  SessionContext,
  LiveEvaluationResult,
  PrivacyMode,
  PoseBiomechanicsFrame,
} from '../types';
import { processFrameWithPrivacy } from './privacyPoseService';
import { getAuthHeaders } from './authService';

export interface VideoMetadata {
  name: string;
  size: number;
  type: string;
  duration?: number;
  width?: number;
  height?: number;
}

// Safely extract crisp keyframes from a video file and apply on-device privacy filtering before leaving the browser
export const extractVideoFrames = async (
  videoFile: File,
  numFrames: number = 6,
  onProgress?: (msg: string) => void,
  privacyMode: PrivacyMode = PrivacyMode.STANDARD
): Promise<{
  frames: Array<{ mimeType: string; data: string; timestamp: number }>;
  biomechanics: PoseBiomechanicsFrame[];
  metadata: VideoMetadata;
}> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(videoFile);
    video.src = url;

    const metadata: VideoMetadata = {
      name: videoFile.name,
      size: videoFile.size,
      type: videoFile.type || 'video/mp4',
    };

    let isDone = false;
    const cleanup = (
      frames: Array<{ mimeType: string; data: string; timestamp: number }>,
      biomechanics: PoseBiomechanicsFrame[]
    ) => {
      if (!isDone) {
        isDone = true;
        try {
          URL.revokeObjectURL(url);
          video.removeAttribute('src');
          video.load();
        } catch {
          // ignore cleanup errors
        }
        resolve({ frames, biomechanics, metadata });
      }
    };

    // Longer safety timeout when local MediaPipe WASM runs on-device
    const safetyTimer = setTimeout(
      () => {
        console.warn('Frame extraction timeout reached, continuing with available frames.');
        cleanup([], []);
      },
      privacyMode === PrivacyMode.STANDARD ? 6000 : 18000
    );

    video.onloadedmetadata = async () => {
      metadata.duration = Math.round(video.duration || 0);
      metadata.width = video.videoWidth || 640;
      metadata.height = video.videoHeight || 360;

      const duration = video.duration || 5;
      const interval = duration / (numFrames + 1);
      const frames: Array<{ mimeType: string; data: string; timestamp: number }> = [];
      const biomechanics: PoseBiomechanicsFrame[] = [];

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Cap resolution for fast transmission and low payload
      const maxDim = 640;
      const scale = Math.min(1, maxDim / Math.max(metadata.width, metadata.height));
      canvas.width = Math.max(320, Math.round(metadata.width * scale));
      canvas.height = Math.max(180, Math.round(metadata.height * scale));

      if (privacyMode !== PrivacyMode.STANDARD && onProgress) {
        onProgress('Inizializzazione motore locale di protezione privacy & estrazione pose...');
      }

      for (let i = 1; i <= numFrames; i++) {
        if (isDone) break;
        const seekTime = i * interval;
        if (onProgress) {
          const modeHint =
            privacyMode === PrivacyMode.SKELETON_ONLY
              ? 'Estrazione scheletro motorio locale'
              : privacyMode === PrivacyMode.BLUR_FACES
              ? 'Sfocatura volti locale'
              : 'Campionamento fotogramma';
          onProgress(`${modeHint} ${i}/${numFrames} (secondo ${Math.round(seekTime)}s)...`);
        }

        try {
          await new Promise<void>((res) => {
            let seekTimer: any;
            const onSeeked = async () => {
              clearTimeout(seekTimer);
              video.removeEventListener('seeked', onSeeked);
              if (ctx && canvas.width > 0 && canvas.height > 0) {
                try {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const processed = await processFrameWithPrivacy(
                    canvas,
                    privacyMode,
                    Math.round(seekTime)
                  );
                  if (processed.data) {
                    frames.push({
                      mimeType: processed.mimeType,
                      data: processed.data,
                      timestamp: processed.timestamp,
                    });
                    if (processed.biomechanics.athletes.length > 0) {
                      biomechanics.push(processed.biomechanics);
                    }
                  }
                } catch (drawErr) {
                  console.warn('Privacy/Canvas process error:', drawErr);
                }
              }
              res();
            };

            seekTimer = setTimeout(() => {
              video.removeEventListener('seeked', onSeeked);
              res();
            }, 2500);

            video.addEventListener('seeked', onSeeked);
            video.currentTime = seekTime;
          });
        } catch {
          // continue with next frame
        }
      }

      clearTimeout(safetyTimer);
      cleanup(frames, biomechanics);
    };

    video.onerror = () => {
      console.warn('Could not decode video directly for canvas frames, proceeding with metadata.');
      clearTimeout(safetyTimer);
      cleanup([], []);
    };
  });
};

export const analyzeVideo = async (
  videoFile: File | null,
  sport: string,
  notes: string,
  extraContextFiles: string,
  targetAthleteDescription: string,
  teamName: string,
  athleteRole: string = '',
  athleteCategory: string = '',
  opponentDescription: string = '',
  sportCategory: SportCategory = SportCategory.DUAL_OPPOSITION,
  focusSpecificAthlete: boolean = false,
  sessionContext: SessionContext = SessionContext.PALESTRA,
  onProgress?: (msg: string) => void,
  onFramesExtracted?: (frames: Array<{ mimeType: string; data: string; timestamp: number }>) => void,
  privacyMode: PrivacyMode = PrivacyMode.STANDARD
): Promise<AnalysisResult> => {
  try {
    let frames: Array<{ mimeType: string; data: string; timestamp: number }> = [];
    let biomechanics: PoseBiomechanicsFrame[] = [];
    let videoMetadata: VideoMetadata | null = null;

    if (videoFile) {
      if (onProgress) {
        onProgress(
          privacyMode === PrivacyMode.SKELETON_ONLY
            ? 'Estrazione scheletri motori sul dispositivo (nessun volto inviato)...'
            : privacyMode === PrivacyMode.BLUR_FACES
            ? 'Campionamento e sfocatura automatica volti sul dispositivo...'
            : 'Estrazione fotogrammi chiave in alta definizione dal video...'
        );
      }
      try {
        const extracted = await extractVideoFrames(videoFile, 6, onProgress, privacyMode);
        frames = extracted.frames;
        biomechanics = extracted.biomechanics;
        videoMetadata = extracted.metadata;
        if (onFramesExtracted && frames.length > 0) {
          onFramesExtracted(frames);
        }
      } catch (err) {
        console.warn('Keyframe extraction warning, continuing:', err);
      }
    }

    if (onProgress) onProgress('Interrogazione del motore di analisi conativa con Gemini...');

    const payload = {
      sport,
      sportCategory,
      sessionContext,
      privacyMode,
      focusSpecificAthlete,
      notes,
      fullContext: extraContextFiles,
      targetAthleteDescription,
      opponentDescription,
      teamName,
      athleteRole,
      athleteCategory,
      frames,
      biomechanics,
      videoMetadata,
    };

    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMsg = `Errore HTTP ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson.error) {
          errorMsg = errorJson.error;
        }
      } catch {
        // fallback to status
      }
      throw new Error(errorMsg);
    }

    const result: AnalysisResult = await response.json();
    return result;
  } catch (error: any) {
    console.error('API call analyzeVideo error:', error);
    throw error;
  }
};

export const analyzeLiveFrames = async (params: {
  frames: Array<{ mimeType: string; data: string; timestamp: number }>;
  biomechanics?: PoseBiomechanicsFrame[];
  privacyMode?: PrivacyMode;
  sport: string;
  sportCategory: SportCategory;
  sessionContext: SessionContext;
  focusSpecificAthlete: boolean;
  targetAthleteDescription: string;
  opponentDescription: string;
  teamName: string;
  notes: string;
}): Promise<LiveEvaluationResult> => {
  const response = await fetch('/api/analyze-live', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errorMsg = `Errore Live HTTP ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.error) {
        errorMsg = errorJson.error;
      }
    } catch {
      // ignore parse fallback
    }
    throw new Error(errorMsg);
  }

  return (await response.json()) as LiveEvaluationResult;
};