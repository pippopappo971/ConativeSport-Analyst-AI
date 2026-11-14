import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Video,
  Square,
  Zap,
  RefreshCw,
  Loader2,
  AlertCircle,
  Radio,
  Sparkles,
  Clock,
  SwitchCamera,
  CheckCircle2,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import {
  SportCategory,
  SessionContext,
  PrivacyMode,
  PoseBiomechanicsFrame,
  LiveEvaluationResult,
} from '../types';
import { analyzeLiveFrames } from '../services/geminiService';
import { processFrameWithPrivacy } from '../services/privacyPoseService';

interface LiveCameraPanelProps {
  sport: string;
  sportCategory: SportCategory;
  sessionContext: SessionContext;
  privacyMode: PrivacyMode;
  focusSpecificAthlete: boolean;
  targetAthleteDescription: string;
  opponentDescription: string;
  teamName: string;
  notes: string;
  onClipRecorded: (file: File) => void;
}

const STAGE_STYLES: Record<number, { badge: string; bg: string; border: string; text: string }> = {
  1: { badge: 'bg-red-600 text-white', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900' },
  2: { badge: 'bg-amber-500 text-white', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900' },
  3: { badge: 'bg-blue-600 text-white', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900' },
  4: { badge: 'bg-indigo-600 text-white', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-900' },
  5: { badge: 'bg-emerald-600 text-white', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900' },
};

const LiveCameraPanel: React.FC<LiveCameraPanelProps> = ({
  sport,
  sportCategory,
  sessionContext,
  privacyMode,
  focusSpecificAthlete,
  targetAthleteDescription,
  opponentDescription,
  teamName,
  notes,
  onClipRecorded,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);

  const [isEvaluatingLive, setIsEvaluatingLive] = useState<boolean>(false);
  const [isAutoLive, setIsAutoLive] = useState<boolean>(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [latestLiveResult, setLatestLiveResult] = useState<LiveEvaluationResult | null>(null);
  const [liveHistory, setLiveHistory] = useState<LiveEvaluationResult[]>([]);
  const [lastPrivacyPreview, setLastPrivacyPreview] = useState<string | null>(null);
  const [clipSavedBanner, setClipSavedBanner] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    setIsAutoLive(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore stop errors
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // Attach stream whenever videoRef or isCameraActive changes
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch((err) => console.warn('Video play error:', err));
    }
  }, [isCameraActive]);

  // Recording timer
  useEffect(() => {
    if (!isRecording) {
      setRecordingSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const startCamera = async (requestedFacing: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    setLiveError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        "Il browser o il dispositivo corrente non supporta l'accesso alla fotocamera. Puoi comunque caricare un video dalla scheda 'Carica Video Registrato'."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: requestedFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCameraError(
          "Permesso fotocamera negato. Abilita l'accesso alla fotocamera nelle impostazioni del browser per effettuare riprese e valutazioni dal vivo."
        );
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setCameraError(
          'Nessuna fotocamera rilevata su questo dispositivo. Usa una webcam collegata oppure carica un video registrato.'
        );
      } else {
        setCameraError(`Impossibile avviare la fotocamera: ${err?.message || 'Errore sconosciuto'}`);
      }
      setIsCameraActive(false);
    }
  };

  const handleSwitchCamera = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    if (isCameraActive) {
      await startCamera(nextFacing);
    }
  };

  const captureBurstFrames = async (count: number = 3, delayMs: number = 380) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      return { frames: [], biomechanics: [] as PoseBiomechanicsFrame[] };
    }

    const canvas = document.createElement('canvas');
    const maxDim = 512;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 360;
    const scale = Math.min(1, maxDim / Math.max(vw, vh));
    canvas.width = Math.max(320, Math.round(vw * scale));
    canvas.height = Math.max(180, Math.round(vh * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { frames: [], biomechanics: [] as PoseBiomechanicsFrame[] };

    const frames: Array<{ mimeType: string; data: string; timestamp: number }> = [];
    const biomechanics: PoseBiomechanicsFrame[] = [];

    for (let i = 0; i < count; i++) {
      if (!videoRef.current || !streamRef.current) break;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const processed = await processFrameWithPrivacy(canvas, privacyMode, i);
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
      if (i < count - 1) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
    return { frames, biomechanics };
  };

  const runLiveEvaluation = useCallback(async () => {
    if (!isCameraActive || isEvaluatingLive) return;
    setIsEvaluatingLive(true);
    setLiveError(null);

    try {
      const { frames, biomechanics } = await captureBurstFrames(3, 350);
      if (frames.length === 0) {
        throw new Error('Flusso video non ancora pronto per l’acquisizione.');
      }

      if (privacyMode !== PrivacyMode.STANDARD && frames[frames.length - 1]?.data) {
        setLastPrivacyPreview(`data:image/jpeg;base64,${frames[frames.length - 1].data}`);
      } else {
        setLastPrivacyPreview(null);
      }

      const result = await analyzeLiveFrames({
        frames,
        biomechanics,
        privacyMode,
        sport,
        sportCategory,
        sessionContext,
        focusSpecificAthlete,
        targetAthleteDescription: focusSpecificAthlete ? targetAthleteDescription : '',
        opponentDescription: sportCategory === SportCategory.DUAL_OPPOSITION ? opponentDescription : '',
        teamName,
        notes,
      });

      setLatestLiveResult(result);
      setLiveHistory((prev) => [result, ...prev].slice(0, 15));
    } catch (err: any) {
      console.warn('Live evaluation error:', err);
      setLiveError(err?.message || 'Errore durante la valutazione in tempo reale.');
    } finally {
      setIsEvaluatingLive(false);
    }
  }, [
    isCameraActive,
    isEvaluatingLive,
    privacyMode,
    sport,
    sportCategory,
    sessionContext,
    focusSpecificAthlete,
    targetAthleteDescription,
    opponentDescription,
    teamName,
    notes,
  ]);

  // Auto-Live loop every 8 seconds when toggled on
  useEffect(() => {
    if (!isAutoLive || !isCameraActive) return;
    const interval = setInterval(() => {
      runLiveEvaluation();
    }, 8000);
    return () => clearInterval(interval);
  }, [isAutoLive, isCameraActive, runLiveEvaluation]);

  const startRecording = () => {
    if (!streamRef.current || isRecording) return;
    setClipSavedBanner(null);
    recordedChunksRef.current = [];

    const mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    const supportedMime = mimeCandidates.find((m) =>
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
    );

    try {
      const recorder = supportedMime
        ? new MediaRecorder(streamRef.current, { mimeType: supportedMime })
        : new MediaRecorder(streamRef.current);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'video/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const now = new Date();
        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
          now.getDate()
        ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(
          2,
          '0'
        )}${String(now.getSeconds()).padStart(2, '0')}`;
        const file = new File([blob], `Ripresa_${sport.replace(/\s+/g, '_')}_${stamp}.${ext}`, {
          type: mimeType,
        });
        setClipSavedBanner(
          `Clip "${file.name}" acquisita (${(file.size / (1024 * 1024)).toFixed(2)} MB)! Pronta per il Report Completo.`
        );
        onClipRecorded(file);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setIsRecording(true);
    } catch (err: any) {
      setCameraError(`Registrazione non supportata su questo browser: ${err?.message || ''}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const activeStyle = latestLiveResult ? STAGE_STYLES[latestLiveResult.stage] || STAGE_STYLES[1] : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Live Camera Feed + Capture Controls */}
      <div className="lg:col-span-7 space-y-3">
        <div className="relative bg-slate-950 rounded-2xl overflow-hidden aspect-video shadow-2xl border border-slate-800 flex items-center justify-center">
          {isCameraActive ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Top Live Status Overlay */}
              <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2 pointer-events-none">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-[10px] font-black uppercase tracking-wider border border-white/15">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Camera Live • {sessionContext}
                  </span>
                  {privacyMode !== PrivacyMode.STANDARD && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600/90 text-white text-[10px] font-black uppercase tracking-wider shadow-md border border-emerald-300/40">
                      <ShieldCheck size={11} />
                      {privacyMode === PrivacyMode.SKELETON_ONLY ? 'Solo Scheletro' : 'Volti Sfocati'}
                    </span>
                  )}
                  {isRecording && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-md animate-pulse">
                      ● REC {formatTimer(recordingSeconds)}
                    </span>
                  )}
                  {isAutoLive && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider shadow-md">
                      <Radio size={11} className="animate-ping" />
                      Auto-Live 8s
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="pointer-events-auto p-2 rounded-xl bg-black/65 hover:bg-black/90 text-white border border-white/20 transition-colors cursor-pointer"
                  title="Cambia fotocamera (Posteriore / Anteriore)"
                >
                  <SwitchCamera size={16} />
                </button>
              </div>

              {/* Evaluating Spinner Overlay */}
              {isEvaluatingLive && (
                <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-xl bg-blue-600/90 backdrop-blur-sm text-white text-xs font-bold flex items-center gap-2 shadow-lg">
                  <Loader2 size={14} className="animate-spin" />
                  Analisi conativa live in corso...
                </div>
              )}
            </>
          ) : (
            <div className="p-6 text-center space-y-4 max-w-md">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                <Camera size={32} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Modalità Campo: Scuola • Palestra • Gara
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Avvia la fotocamera per ottenere valutazioni conative istantanee in tempo reale mentre osservi la lezione o la gara, oppure registra una clip da analizzare nel dettaglio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => startCamera('environment')}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/30 transition-all cursor-pointer inline-flex items-center gap-2 active:scale-95"
              >
                <Camera size={16} />
                Avvia Fotocamera Live
              </button>
            </div>
          )}
        </div>

        {/* Camera / Live Controls Bar */}
        {isCameraActive && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-3 rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                >
                  <Video size={15} />
                  ● Registra Clip
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                >
                  <Square size={14} fill="currentColor" />
                  Stop & Carica Clip ({formatTimer(recordingSeconds)})
                </button>
              )}

              <button
                type="button"
                onClick={runLiveEvaluation}
                disabled={isEvaluatingLive}
                className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                  isEvaluatingLive
                    ? 'bg-blue-200 text-blue-700 cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                }`}
              >
                {isEvaluatingLive ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                Valuta Live Adesso
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !isAutoLive;
                  setIsAutoLive(next);
                  if (next && !isEvaluatingLive) {
                    runLiveEvaluation();
                  }
                }}
                className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition-all cursor-pointer ${
                  isAutoLive
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <RefreshCw size={14} className={isAutoLive ? 'animate-spin' : ''} />
                {isAutoLive ? 'Auto-Live Attivo (8s)' : 'Auto-Live (ogni 8s)'}
              </button>
            </div>

            <button
              type="button"
              onClick={stopStream}
              className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
            >
              Chiudi Camera
            </button>
          </div>
        )}

        {/* Camera Errors */}
        {cameraError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start justify-between gap-3 text-xs text-red-800">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">{cameraError}</p>
            </div>
            <button
              type="button"
              onClick={() => startCamera(facingMode)}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg font-bold shrink-0 cursor-pointer"
            >
              Riprova
            </button>
          </div>
        )}

        {liveError && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900">
            <AlertCircle size={16} className="text-amber-600 shrink-0" />
            <span>{liveError}</span>
          </div>
        )}

        {clipSavedBanner && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-900 font-semibold">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{clipSavedBanner}</span>
          </div>
        )}
      </div>

      {/* Right: Real-Time HUD & Live Timeline */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                <Radio size={12} /> Valutazione Conativa Istantanea
              </span>
              <h4 className="text-sm font-black text-white mt-0.5">
                HUD Tempo Reale • {sessionContext}
              </h4>
            </div>
            {latestLiveResult && (
              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700">
                ⏱ {latestLiveResult.capturedAt}
              </span>
            )}
          </div>

          {latestLiveResult && activeStyle ? (
            <div className="space-y-4">
              {/* Stage + Dominant Preoccupation */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-black shadow-md ${activeStyle.badge}`}>
                    {latestLiveResult.stage}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                      Tappa Rilevata Live
                    </span>
                    <strong className="text-lg font-black tracking-tight text-white">
                      {latestLiveResult.stageName}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Immediate Coaching/Teaching Cue */}
              <div className="bg-gradient-to-br from-emerald-900/70 to-teal-900/50 p-4 rounded-xl border border-emerald-500/40 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                  <Sparkles size={12} /> Consiglio Immediato per il Campo ({sessionContext})
                </span>
                <p className="text-sm font-bold text-white leading-snug">
                  "{latestLiveResult.immediateCue}"
                </p>
              </div>

              {/* Observation & Preoccupation */}
              <div className="space-y-2 text-xs">
                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <span className="text-[10px] font-black uppercase text-blue-300 block mb-0.5">
                    Osservazione Oggettiva Live
                  </span>
                  <p className="text-slate-200 leading-relaxed">{latestLiveResult.liveObservation}</p>
                </div>

                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <span className="text-[10px] font-black uppercase text-amber-300 block mb-0.5">
                    Preoccupazione Dominante Ora
                  </span>
                  <p className="text-slate-200 leading-relaxed">{latestLiveResult.dominantPreoccupation}</p>
                </div>

                {latestLiveResult.duelLeader && (
                  <div className="bg-indigo-500/15 p-3 rounded-xl border border-indigo-400/30">
                    <span className="text-[10px] font-black uppercase text-indigo-300 block mb-0.5">
                      Dominanza nel Duello 1 vs 1
                    </span>
                    <p className="text-indigo-100 font-semibold">{latestLiveResult.duelLeader}</p>
                  </div>
                )}
              </div>

              {/* Mini Tai / Gi / Shin Bars */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-center text-[11px] font-bold">
                <div className="bg-red-500/15 border border-red-400/30 rounded-xl p-2">
                  <span className="text-red-300 block text-[9px] uppercase">Struttura (Tai)</span>
                  <span className="text-white text-sm font-black">{latestLiveResult.graphData.structural}%</span>
                </div>
                <div className="bg-blue-500/15 border border-blue-400/30 rounded-xl p-2">
                  <span className="text-blue-300 block text-[9px] uppercase">Tecnica (Gi)</span>
                  <span className="text-white text-sm font-black">{latestLiveResult.graphData.technical}%</span>
                </div>
                <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-xl p-2">
                  <span className="text-emerald-300 block text-[9px] uppercase">Funzionalità (Shin)</span>
                  <span className="text-white text-sm font-black">{latestLiveResult.graphData.functional}%</span>
                </div>
              </div>

              {lastPrivacyPreview && (
                <div className="bg-black/40 p-2.5 rounded-xl border border-emerald-500/30 flex items-center gap-3">
                  <img
                    src={lastPrivacyPreview}
                    alt="Anteprima Privacy Inviata"
                    className="w-24 h-14 object-cover rounded-lg border border-emerald-400/40 shrink-0"
                  />
                  <div className="text-[10px] text-emerald-200 leading-snug">
                    <span className="font-black uppercase flex items-center gap-1 text-emerald-400">
                      <ShieldCheck size={12} /> Verifica Flusso Inviato all'AI
                    </span>
                    <p className="text-slate-300 mt-0.5">
                      {privacyMode === PrivacyMode.SKELETON_ONLY
                        ? 'Solo scheletro motorio e angoli trasmessi. Nessuna foto reale è uscita dal dispositivo.'
                        : 'Volti oscurati localmente sul dispositivo prima della trasmissione.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs space-y-2">
              <Zap size={24} className="mx-auto text-slate-500" />
              <p className="font-semibold text-slate-300">Nessuna rilevazione live ancora eseguita</p>
              <p className="leading-relaxed">
                Avvia la fotocamera e premi <strong>"Valuta Live Adesso"</strong> o attiva <strong>"Auto-Live (ogni 8s)"</strong> per ricevere feedback immediato in classe, in palestra o a bordo tatami/campo.
              </p>
            </div>
          )}
        </div>

        {/* Live Timeline History */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Clock size={14} className="text-blue-600" />
              Timeline Rilevazioni Live ({liveHistory.length})
            </span>
            {liveHistory.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setLiveHistory([]);
                  setLatestLiveResult(null);
                }}
                className="text-[10px] font-bold text-slate-400 hover:text-red-600 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={12} /> Pulisci
              </button>
            )}
          </div>

          {liveHistory.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">
              Le valutazioni live compariranno qui in ordine cronologico per monitorare l'evoluzione o la regressione durante la sessione.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {liveHistory.map((item) => {
                const st = STAGE_STYLES[item.stage] || STAGE_STYLES[1];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLatestLiveResult(item)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                      latestLiveResult?.id === item.id
                        ? 'bg-white border-blue-400 shadow-xs'
                        : 'bg-white/70 border-slate-200 hover:bg-white'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${st.badge}`}>
                      {item.stage}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black text-slate-800 truncate">
                          {item.stageName}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {item.capturedAt}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                        {item.immediateCue}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveCameraPanel;
