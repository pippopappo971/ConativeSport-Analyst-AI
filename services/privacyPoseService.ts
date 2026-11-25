import { FilesetResolver, NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision';
import { AthletePoseMetrics, PoseBiomechanicsFrame, PrivacyMode } from '../types';

let landmarkerInstance: PoseLandmarker | null = null;
let landmarkerPromise: Promise<PoseLandmarker> | null = null;

// Anatomical skeleton connections excluding facial features (only neck/shoulders/torso/arms/legs)
const BODY_CONNECTIONS: Array<[number, number]> = [
  // Torso
  [11, 12], // shoulders
  [23, 24], // hips
  [11, 23], // left side
  [12, 24], // right side
  // Left Arm
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  // Right Arm
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  // Left Leg
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  // Right Leg
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
];

const SKELETON_PALETTE = [
  { bone: '#38BDF8', joint: '#E0F2FE', labelBg: '#0284C7', name: 'Ciano' },
  { bone: '#F59E0B', joint: '#FEF3C7', labelBg: '#D97706', name: 'Ambra' },
  { bone: '#34D399', joint: '#D1FAE5', labelBg: '#059669', name: 'Smeraldo' },
  { bone: '#F472B6', joint: '#FCE7F3', labelBg: '#DB2777', name: 'Rosa' },
  { bone: '#A78BFA', joint: '#EDE9FE', labelBg: '#7C3AED', name: 'Viola' },
  { bone: '#FB7185', joint: '#FFE4E6', labelBg: '#E11D48', name: 'Corallo' },
];

async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    try {
      const instance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numPoses: 6,
        minPoseDetectionConfidence: 0.35,
        minPosePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });
      landmarkerInstance = instance;
      return instance;
    } catch (gpuErr) {
      console.warn('MediaPipe GPU delegate fallback to CPU:', gpuErr);
      const cpuInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/pose_landmarker_lite.task',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numPoses: 6,
        minPoseDetectionConfidence: 0.35,
        minPosePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });
      landmarkerInstance = cpuInstance;
      return cpuInstance;
    }
  })().catch((err) => {
    landmarkerPromise = null;
    throw err;
  });

  return landmarkerPromise;
}

export async function preloadPrivacyEngine(): Promise<void> {
  try {
    await getPoseLandmarker();
  } catch (err) {
    console.warn('Preload privacy pose engine warning:', err);
  }
}

function isVisible(lm?: NormalizedLandmark, threshold = 0.25): lm is NormalizedLandmark {
  return Boolean(lm && (lm.visibility === undefined || lm.visibility >= threshold));
}

function calcAngleDeg(
  a: NormalizedLandmark | undefined,
  b: NormalizedLandmark | undefined,
  c: NormalizedLandmark | undefined,
  aspectRatio: number
): number | undefined {
  if (!isVisible(a) || !isVisible(b) || !isVisible(c)) return undefined;
  const bax = (a.x - b.x) * aspectRatio;
  const bay = a.y - b.y;
  const bcx = (c.x - b.x) * aspectRatio;
  const bcy = c.y - b.y;
  const magBA = Math.hypot(bax, bay);
  const magBC = Math.hypot(bcx, bcy);
  if (magBA < 1e-5 || magBC < 1e-5) return undefined;
  const cos = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy) / (magBA * magBC)));
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

function computeAthleteMetrics(
  landmarks: NormalizedLandmark[],
  label: string,
  width: number,
  height: number
): AthletePoseMetrics {
  const aspectRatio = width / Math.max(1, height);

  const lShoulder = landmarks[11];
  const rShoulder = landmarks[12];
  const lHip = landmarks[23];
  const rHip = landmarks[24];
  const lAnkle = landmarks[27];
  const rAnkle = landmarks[28];

  const midShoulderX = ((lShoulder?.x ?? 0.5) + (rShoulder?.x ?? 0.5)) / 2;
  const midShoulderY = ((lShoulder?.y ?? 0.4) + (rShoulder?.y ?? 0.4)) / 2;
  const midHipX = ((lHip?.x ?? 0.5) + (rHip?.x ?? 0.5)) / 2;
  const midHipY = ((lHip?.y ?? 0.6) + (rHip?.y ?? 0.6)) / 2;

  const dx = (midShoulderX - midHipX) * aspectRatio;
  const dy = midHipY - midShoulderY; // positive when upright
  const torsoLeanDeg = Math.round((Math.atan2(Math.abs(dx), Math.max(0.01, Math.abs(dy))) * 180) / Math.PI);

  const leftKneeAngle = calcAngleDeg(lHip, landmarks[25], lAnkle, aspectRatio);
  const rightKneeAngle = calcAngleDeg(rHip, landmarks[26], rAnkle, aspectRatio);
  const leftElbowAngle = calcAngleDeg(lShoulder, landmarks[13], landmarks[15], aspectRatio);
  const rightElbowAngle = calcAngleDeg(rShoulder, landmarks[14], landmarks[16], aspectRatio);

  const torsoHeight = Math.max(0.05, Math.hypot(dx, dy));
  const ankleDist =
    isVisible(lAnkle) && isVisible(rAnkle)
      ? Math.hypot((lAnkle.x - rAnkle.x) * aspectRatio, lAnkle.y - rAnkle.y)
      : 0;
  const stanceWidthRatio = Number((ankleDist / torsoHeight).toFixed(2));

  const tags: string[] = [];
  const avgKnee =
    leftKneeAngle !== undefined && rightKneeAngle !== undefined
      ? (leftKneeAngle + rightKneeAngle) / 2
      : leftKneeAngle ?? rightKneeAngle;

  if (avgKnee !== undefined) {
    if (avgKnee < 135) tags.push('baricentro basso / piegamento attivo');
    else if (avgKnee > 165) tags.push('gambe quasi distese / postura alta');
    else tags.push('piegamento moderato');
  }
  if (torsoLeanDeg > 25) tags.push(`busto molto inclinato (${torsoLeanDeg}°)`);
  else if (torsoLeanDeg <= 10) tags.push('asse busto verticale');

  if (stanceWidthRatio >= 0.75) tags.push('base di appoggio ampia');
  else if (stanceWidthRatio > 0 && stanceWidthRatio < 0.35) tags.push('piedi stretti');

  return {
    label,
    centerX: Number(midHipX.toFixed(2)),
    torsoLeanDeg,
    leftKneeAngle,
    rightKneeAngle,
    leftElbowAngle,
    rightElbowAngle,
    stanceWidthRatio,
    postureSummary: tags.length > 0 ? tags.join(', ') : 'assetto posturale rilevato',
  };
}

function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  cx: number,
  cy: number,
  radius: number
) {
  const x = Math.max(0, Math.floor(cx - radius));
  const y = Math.max(0, Math.floor(cy - radius));
  const w = Math.min(sourceCanvas.width - x, Math.ceil(radius * 2));
  const h = Math.min(sourceCanvas.height - y, Math.ceil(radius * 2));
  if (w <= 4 || h <= 4) return;

  // Pixelation via tiny offscreen canvas (guaranteed to work across iOS Safari, Chrome, Firefox)
  const tiny = document.createElement('canvas');
  tiny.width = Math.max(4, Math.round(w / 10));
  tiny.height = Math.max(4, Math.round(h / 10));
  const tctx = tiny.getContext('2d');
  if (tctx) {
    tctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, tiny.width, tiny.height);
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, x, y, w, h);
  ctx.imageSmoothingEnabled = true;

  // Additional frosted privacy veil so facial traits cannot be inferred
  ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

export async function processFrameWithPrivacy(
  sourceCanvas: HTMLCanvasElement,
  privacyMode: PrivacyMode,
  timestamp: number
): Promise<{
  data: string;
  mimeType: string;
  timestamp: number;
  biomechanics: PoseBiomechanicsFrame;
}> {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  // Fast path: STANDARD mode sends unredacted frame directly
  if (privacyMode === PrivacyMode.STANDARD) {
    const dataUrl = sourceCanvas.toDataURL('image/jpeg', 0.75);
    return {
      data: dataUrl.split(',')[1] || '',
      mimeType: 'image/jpeg',
      timestamp,
      biomechanics: { timestamp, detectedCount: 0, athletes: [] },
    };
  }

  const landmarker = await getPoseLandmarker();
  const result = landmarker.detect(sourceCanvas);

  // Sort poses left -> right by mid-hip horizontal position for stable labeling
  const rawPoses = (result.landmarks || []).slice().sort((a, b) => {
    const ax = ((a[23]?.x ?? 0.5) + (a[24]?.x ?? 0.5)) / 2;
    const bx = ((b[23]?.x ?? 0.5) + (b[24]?.x ?? 0.5)) / 2;
    return ax - bx;
  });

  const athletes: AthletePoseMetrics[] = rawPoses.map((pose, idx) => {
    const sideHint =
      rawPoses.length === 2
        ? idx === 0
          ? 'Atleta #1 (Sinistra)'
          : 'Atleta #2 (Destra)'
        : `Atleta #${idx + 1}`;
    return computeAthleteMetrics(pose, sideHint, width, height);
  });

  const biomechanics: PoseBiomechanicsFrame = {
    timestamp,
    detectedCount: athletes.length,
    athletes,
  };

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Impossibile creare il canvas di anonimizzazione.');
  }

  if (privacyMode === PrivacyMode.BLUR_FACES) {
    // Draw original image, then pixelate + mask all head/face regions locally
    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    for (const pose of rawPoses) {
      const headPoints = pose.slice(0, 11).filter((p) => isVisible(p, 0.15));
      if (headPoints.length > 0) {
        let minX = 1,
          maxX = 0,
          minY = 1,
          maxY = 0;
        for (const pt of headPoints) {
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        }
        const cx = ((minX + maxX) / 2) * width;
        const cy = ((minY + maxY) / 2) * height;
        const headSpan = Math.max((maxX - minX) * width, (maxY - minY) * height);

        // Estimate shoulder span as lower bound so heads facing away or small are still masked
        const lSh = pose[11];
        const rSh = pose[12];
        const shoulderPx =
          lSh && rSh ? Math.hypot((lSh.x - rSh.x) * width, (lSh.y - rSh.y) * height) : 0;

        const radius = Math.max(18, headSpan * 1.1, shoulderPx * 0.42);
        pixelateRegion(ctx, sourceCanvas, cx, cy, radius);
      }
    }

    // Secondary pass using native FaceDetector if available in browser (catches background/close-up faces)
    const anyWin = window as any;
    if (typeof anyWin.FaceDetector === 'function') {
      try {
        const fd = new anyWin.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
        const faces = await fd.detect(sourceCanvas);
        for (const face of faces) {
          const box = face.boundingBox;
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          const r = Math.max(18, Math.max(box.width, box.height) * 0.72);
          pixelateRegion(ctx, sourceCanvas, cx, cy, r);
        }
      } catch {
        // Ignore if native FaceDetector is unavailable/restricted
      }
    }

    // Subtle on-frame privacy seal
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fillRect(10, 10, 210, 24);
    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText('PRIVACY: VOLTI OSCURATI ON-DEVICE', 18, 26);

    const dataUrl = outCanvas.toDataURL('image/jpeg', 0.78);
    return {
      data: dataUrl.split(',')[1] || '',
      mimeType: 'image/jpeg',
      timestamp,
      biomechanics,
    };
  }

  // MODE: SKELETON_ONLY ("Privacy Totale: Solo Scheletro Motorio")
  // Solid dark canvas — ZERO real camera pixels leave the device!
  ctx.fillStyle = '#0B1120';
  ctx.fillRect(0, 0, width, height);

  // Draw clean synthetic spatial grid so Gemini understands relative height, spacing & movement
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
  ctx.lineWidth = 1;
  for (let gx = 1; gx < 6; gx++) {
    const x = (width / 6) * gx;
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, height - 20);
    ctx.stroke();
  }
  for (let gy = 1; gy < 4; gy++) {
    const y = (height / 4) * gy;
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(width - 16, y);
    ctx.stroke();
  }

  // Top Privacy Banner
  ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
  ctx.fillRect(10, 10, width - 20, 26);
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
  ctx.strokeRect(10, 10, width - 20, 26);
  ctx.fillStyle = '#6EE7B7';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`PRIVACY TOTALE: SOLO SCHELETRO MOTORIO (${rawPoses.length} rilevati) • t=${timestamp}s`, 18, 27);

  if (rawPoses.length === 0) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nessuna figura umana rilevata in questo fotogramma', width / 2, height / 2);
  } else {
    rawPoses.forEach((pose, idx) => {
      const palette = SKELETON_PALETTE[idx % SKELETON_PALETTE.length];
      const metrics = athletes[idx];

      // Draw bones
      ctx.strokeStyle = palette.bone;
      ctx.lineWidth = Math.max(3, Math.round(width / 160));
      ctx.lineCap = 'round';
      for (const [i, j] of BODY_CONNECTIONS) {
        const a = pose[i];
        const b = pose[j];
        if (isVisible(a, 0.22) && isVisible(b, 0.22)) {
          ctx.beginPath();
          ctx.moveTo(a.x * width, a.y * height);
          ctx.lineTo(b.x * width, b.y * height);
          ctx.stroke();
        }
      }

      // Draw anonymous geometric Head circle + neck line (NO facial details!)
      const nose = pose[0];
      const lSh = pose[11];
      const rSh = pose[12];
      const shoulderMidX = lSh && rSh ? ((lSh.x + rSh.x) / 2) * width : (nose?.x ?? 0.5) * width;
      const shoulderMidY = lSh && rSh ? ((lSh.y + rSh.y) / 2) * height : (nose?.y ?? 0.4) * height;
      const shoulderPx =
        lSh && rSh ? Math.hypot((lSh.x - rSh.x) * width, (lSh.y - rSh.y) * height) : 36;
      const headRadius = Math.max(11, Math.min(28, shoulderPx * 0.28));

      const headX = isVisible(nose, 0.2) ? nose.x * width : shoulderMidX;
      const headY = isVisible(nose, 0.2) ? nose.y * height : shoulderMidY - headRadius * 2.1;

      // Neck connector
      ctx.beginPath();
      ctx.moveTo(shoulderMidX, shoulderMidY);
      ctx.lineTo(headX, headY + headRadius * 0.8);
      ctx.stroke();

      // Head circle
      ctx.beginPath();
      ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#0F172A';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = palette.bone;
      ctx.stroke();

      // Draw major anatomical joints (11..32)
      for (let k = 11; k <= 32; k++) {
        const pt = pose[k];
        if (isVisible(pt, 0.25)) {
          ctx.beginPath();
          ctx.arc(pt.x * width, pt.y * height, Math.max(3, Math.round(width / 170)), 0, Math.PI * 2);
          ctx.fillStyle = palette.joint;
          ctx.fill();
        }
      }

      // Label pill above head with athlete number & angle readout
      const kneeInfo =
        metrics.leftKneeAngle ?? metrics.rightKneeAngle
          ? `Gin:${metrics.leftKneeAngle ?? metrics.rightKneeAngle}°`
          : '';
      const badgeText = `${metrics.label} | Busto:${metrics.torsoLeanDeg}° ${kneeInfo}`.trim();
      ctx.font = 'bold 10px Arial, sans-serif';
      const textW = ctx.measureText(badgeText).width + 12;
      const bx = Math.max(8, Math.min(width - textW - 8, headX - textW / 2));
      const by = Math.max(42, headY - headRadius - 24);

      ctx.fillStyle = palette.labelBg;
      ctx.fillRect(bx, by, textW, 18);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.fillText(badgeText, bx + 6, by + 13);
    });
  }

  const dataUrl = outCanvas.toDataURL('image/jpeg', 0.82);
  return {
    data: dataUrl.split(',')[1] || '',
    mimeType: 'image/jpeg',
    timestamp,
    biomechanics,
  };
}
