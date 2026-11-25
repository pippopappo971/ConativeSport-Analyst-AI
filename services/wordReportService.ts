import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { AnalysisResult, PrivacyMode, SessionContext, SportCategory } from '../types';

export interface WordReportProfile {
  name: string;
  sport: string;
  sportCategory?: SportCategory;
  sessionContext?: SessionContext;
  privacyMode?: PrivacyMode;
  focusSpecificAthlete?: boolean;
  date: string;
  teamName?: string;
  athleteRole?: string;
  athleteCategory?: string;
  notes?: string;
  analysis: AnalysisResult;
}

const CATEGORY_LABELS: Record<SportCategory, string> = {
  [SportCategory.DUAL_OPPOSITION]: 'Sport con 2 Giocatori Opposti (1 vs 1)',
  [SportCategory.TEAM_SPORT]: 'Gioco di Squadra (Sport Collettivo)',
  [SportCategory.INDIVIDUAL]: 'Sport Singolo / Individuale',
};

const CONTEXT_LABELS: Record<SessionContext, string> = {
  [SessionContext.SCUOLA]: 'Scuola (Ora di Educazione Fisica)',
  [SessionContext.PALESTRA]: 'Palestra / Allenamento',
  [SessionContext.GARA]: 'Gara / Competizione',
};

const PRIVACY_LABELS: Record<PrivacyMode, string> = {
  [PrivacyMode.STANDARD]: 'Standard (Fotogrammi Originali)',
  [PrivacyMode.BLUR_FACES]: 'Volti Oscurati On-Device (GDPR)',
  [PrivacyMode.SKELETON_ONLY]: 'Privacy Totale: Solo Scheletro Motorio (GDPR)',
};

const STAGE_THEME: Record<
  number,
  { accent: string; softBg: string; border: string; label: string; tagline: string }
> = {
  1: {
    accent: 'DC2626',
    softBg: 'FEF2F2',
    border: 'FECACA',
    label: 'EMOZIONALE',
    tagline: 'Preoccupazione centrata su sicurezza fisica, emotività o risposta d’urgenza (Tai).',
  },
  2: {
    accent: 'D97706',
    softBg: 'FFFBEB',
    border: 'FDE68A',
    label: 'FUNZIONALE',
    tagline: 'Ricerca empirica di efficacia pratica per prove ed errori sul compito motorio (Shin).',
  },
  3: {
    accent: '2563EB',
    softBg: 'EFF6FF',
    border: 'BFDBFE',
    label: 'TECNICA',
    tagline: 'Conformità al modello esterno, ricerca del gesto corretto e riproduzione formale (Gi).',
  },
  4: {
    accent: '4F46E5',
    softBg: 'EEF2FF',
    border: 'C7D2FE',
    label: 'CONTESTUALE',
    tagline: 'Adattamento situazionale della tecnica all’avversario, allo spazio e al tempismo (Gi + Shin).',
  },
  5: {
    accent: '059669',
    softBg: 'ECFDF5',
    border: 'A7F3D0',
    label: 'ESPERTA',
    tagline: 'Sintesi armonica Tai + Gi + Shin, anticipazione motoria, economia e stile personale.',
  },
};

const FONT_FAMILY = 'Calibri';

function clampPct(val: number | undefined): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  size = 11
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Renders the 3D Isometric Conative Volume Graph + Percentage Cards to a high-DPI PNG Uint8Array.
 */
async function renderConativeGraphPng(
  graphData: { structural: number; functional: number; technical: number },
  stage: number,
  stageName: string
): Promise<Uint8Array> {
  const width = 960;
  const height = 560;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Impossibile inizializzare il canvas per il grafico.');
  }

  const sVal = clampPct(graphData.structural);
  const fVal = clampPct(graphData.functional);
  const tVal = clampPct(graphData.technical);

  // Outer card background
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, width, height);

  drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 24);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  // Header strip inside canvas
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ANALISI VOLUMETRICA DELLE DIMENSIONI CONATIVE (TAI • GI • SHIN)', 44, 56);

  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`TAPPA ${stage} — ${(stageName || '').toUpperCase()}`, width - 44, 56);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(40, 74);
  ctx.lineTo(width - 40, 74);
  ctx.stroke();

  // Left: Isometric 3D Volume Graph
  const cx = 248;
  const cy = 345;
  const axisLength = 195;

  const s = sVal / 100;
  const f = fVal / 100;
  const t = tVal / 100;

  const vStr = { x: -0.7, y: 0.4 };
  const vFun = { x: 1.0, y: 0.0 };
  const vTec = { x: 0.0, y: -1.0 };

  const getCoord = (strVal: number, funVal: number, tecVal: number) => ({
    x: cx + (strVal * vStr.x + funVal * vFun.x + tecVal * vTec.x) * axisLength,
    y: cy + (strVal * vStr.y + funVal * vFun.y + tecVal * vTec.y) * axisLength,
  });

  const o = { x: cx, y: cy };
  const pStrMax = getCoord(1, 0, 0);
  const pFunMax = getCoord(0, 1, 0);
  const pTecMax = getCoord(0, 0, 1);

  const pS = getCoord(s, 0, 0);
  const pF = getCoord(0, f, 0);
  const pT = getCoord(0, 0, t);
  const pSF = getCoord(s, f, 0);
  const pST = getCoord(s, 0, t);
  const pFT = getCoord(0, f, t);
  const pFinal = getCoord(s, f, t);

  // Subtle 50% and 100% guide lines
  ctx.save();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (const r of [0.5, 1.0]) {
    const gS = getCoord(r, 0, 0);
    const gF = getCoord(0, r, 0);
    const gT = getCoord(0, 0, r);
    ctx.beginPath();
    ctx.moveTo(gS.x, gS.y);
    ctx.lineTo(gT.x, gT.y);
    ctx.lineTo(gF.x, gF.y);
    ctx.stroke();
  }
  ctx.restore();

  // Axes lines
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2.5;

  ctx.strokeStyle = '#EF4444';
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(pStrMax.x, pStrMax.y);
  ctx.stroke();
  drawArrowhead(ctx, o.x, o.y, pStrMax.x, pStrMax.y, '#EF4444');

  ctx.strokeStyle = '#22C55E';
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(pFunMax.x, pFunMax.y);
  ctx.stroke();
  drawArrowhead(ctx, o.x, o.y, pFunMax.x, pFunMax.y, '#22C55E');

  ctx.strokeStyle = '#3B82F6';
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(pTecMax.x, pTecMax.y);
  ctx.stroke();
  drawArrowhead(ctx, o.x, o.y, pTecMax.x, pTecMax.y, '#3B82F6');
  ctx.restore();

  const drawPoly = (
    pts: Array<{ x: number; y: number }>,
    fill: string,
    fillAlpha: number,
    stroke: string,
    strokeAlpha: number,
    lineW = 1.5
  ) => {
    ctx.save();
    ctx.beginPath();
    pts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalAlpha = strokeAlpha;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.stroke();
    ctx.restore();
  };

  // Volume faces
  drawPoly([o, pS, pSF, pF], '#FACC15', 0.38, '#EAB308', 0.55, 1.2);
  drawPoly([o, pS, pST, pT], '#EF4444', 0.28, '#EF4444', 0.55, 1.5);
  drawPoly([o, pF, pFT, pT], '#22C55E', 0.28, '#22C55E', 0.55, 1.5);
  drawPoly([pT, pST, pFinal, pFT], '#3B82F6', 0.28, '#3B82F6', 0.6, 1.5);

  // Dashed internal edges
  ctx.save();
  ctx.strokeStyle = '#64748B';
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  [
    [pS, pSF],
    [pF, pSF],
    [pSF, pFinal],
  ].forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });
  ctx.restore();

  // Result vector
  ctx.save();
  ctx.strokeStyle = '#991B1B';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(pFinal.x, pFinal.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(pFinal.x, pFinal.y, 16, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(220, 38, 38, 0.16)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(pFinal.x, pFinal.y, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#DC2626';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  ctx.restore();

  // Axis Labels
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#DC2626';
  ctx.fillText('STRUTTURA (TAI)', pStrMax.x - 10, pStrMax.y + 34);
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.fillText('100%', pStrMax.x - 10, pStrMax.y + 18);

  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#16A34A';
  ctx.fillText('FUNZIONALITÀ (SHIN)', pFunMax.x - 18, pFunMax.y + 30);
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.fillText('100%', pFunMax.x - 4, pFunMax.y + 15);

  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2563EB';
  ctx.fillText('TECNICA (GI)', pTecMax.x, pTecMax.y - 24);
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.fillText('100%', pTecMax.x + 28, pTecMax.y + 4);

  // Right Panel: Crisp Metric Breakdown Cards
  const panelX = 515;
  const panelW = 400;
  drawRoundedRect(ctx, panelX, 98, panelW, 415, 20);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('RIPARTIZIONE PERCENTUALE MOBILITAZIONE', panelX + 24, 130);

  const metrics = [
    {
      letter: 'S',
      title: 'STRUTTURA',
      sub: 'TAI — Sicurezza, assetto corporeo, equilibrio',
      pct: sVal,
      color: '#EF4444',
      textColor: '#DC2626',
      bgTint: '#FEE2E2',
      y: 152,
    },
    {
      letter: 'T',
      title: 'TECNICA',
      sub: 'GI — Modello esecutivo, gesto codificato',
      pct: tVal,
      color: '#3B82F6',
      textColor: '#2563EB',
      bgTint: '#DBEAFE',
      y: 262,
    },
    {
      letter: 'F',
      title: 'FUNZIONALITÀ',
      sub: 'SHIN — Efficacia pratica, senso tattico',
      pct: fVal,
      color: '#22C55E',
      textColor: '#16A34A',
      bgTint: '#DCFCE7',
      y: 372,
    },
  ];

  metrics.forEach((m) => {
    const cardX = panelX + 20;
    const cardW = panelW - 40;
    const cardH = 92;

    drawRoundedRect(ctx, cardX, m.y, cardW, cardH, 14);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#E2E8F0';
    ctx.stroke();

    // Letter Badge
    drawRoundedRect(ctx, cardX + 14, m.y + 14, 38, 38, 10);
    ctx.fillStyle = m.color;
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.letter, cardX + 33, m.y + 39);

    // Titles
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText(m.title, cardX + 64, m.y + 30);

    ctx.fillStyle = '#64748B';
    ctx.font = '11px Arial, sans-serif';
    ctx.fillText(m.sub, cardX + 64, m.y + 47);

    // Percentage value
    ctx.textAlign = 'right';
    ctx.fillStyle = m.textColor;
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText(`${m.pct}%`, cardX + cardW - 16, m.y + 38);

    // Progress Bar Track
    const barX = cardX + 14;
    const barY = m.y + 66;
    const barW = cardW - 28;
    const barH = 10;

    drawRoundedRect(ctx, barX, barY, barW, barH, 5);
    ctx.fillStyle = m.bgTint;
    ctx.fill();

    if (m.pct > 0) {
      const fillW = Math.max(10, (barW * m.pct) / 100);
      drawRoundedRect(ctx, barX, barY, fillW, barH, 5);
      ctx.fillStyle = m.color;
      ctx.fill();
    }
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = 'italic 11px Arial, sans-serif';
  ctx.fillText(
    'Il vettore risultante rosso rappresenta la sintesi dinamica della mobilitazione.',
    panelX + panelW / 2,
    492
  );

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('Impossibile esportare il grafico conativo come immagine PNG.');
  }
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Parses inline markdown (**bold**, *italic*) and timestamps ([MM:SS]) into styled Word TextRuns.
 */
function parseRichTextRuns(
  rawText: string,
  baseOptions: { size?: number; color?: string; italics?: boolean; bold?: boolean } = {}
): TextRun[] {
  const size = baseOptions.size ?? 21; // 10.5pt
  const baseColor = baseOptions.color ?? '1E293B';
  const runs: TextRun[] = [];

  // Split by bold (**...**), italic (*...*), or timestamp ([MM:SS])
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|\[\d{1,2}:\d{2}\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      runs.push(
        new TextRun({
          text: rawText.slice(lastIndex, match.index),
          font: FONT_FAMILY,
          size,
          color: baseColor,
          italics: baseOptions.italics,
          bold: baseOptions.bold,
        })
      );
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      const inner = token.slice(2, -2);
      runs.push(
        new TextRun({
          text: inner,
          font: FONT_FAMILY,
          size,
          color: '0F172A',
          bold: true,
          italics: baseOptions.italics,
        })
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      const inner = token.slice(1, -1);
      runs.push(
        new TextRun({
          text: inner,
          font: FONT_FAMILY,
          size,
          color: baseColor,
          italics: true,
          bold: baseOptions.bold,
        })
      );
    } else if (/^\[\d{1,2}:\d{2}\]$/.test(token)) {
      runs.push(
        new TextRun({
          text: ` ⏱ ${token} `,
          font: FONT_FAMILY,
          size: Math.max(18, size - 2),
          color: '1D4ED8',
          bold: true,
          shading: {
            type: ShadingType.CLEAR,
            color: 'auto',
            fill: 'DBEAFE',
          },
        })
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < rawText.length) {
    runs.push(
      new TextRun({
        text: rawText.slice(lastIndex),
        font: FONT_FAMILY,
        size,
        color: baseColor,
        italics: baseOptions.italics,
        bold: baseOptions.bold,
      })
    );
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text: rawText, font: FONT_FAMILY, size, color: baseColor }));
  }

  return runs;
}

function buildRichParagraphs(
  text: string,
  options: { size?: number; color?: string; spacingAfter?: number } = {}
): Paragraph[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(
      (line) =>
        new Paragraph({
          spacing: { after: options.spacingAfter ?? 120, line: 276 },
          children: parseRichTextRuns(line, {
            size: options.size ?? 21,
            color: options.color ?? '334155',
          }),
        })
    );
}

function buildTrainingSheetParagraphs(markdown: string): Paragraph[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const paragraphs: Paragraph[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#{1,4}\s+/.test(line)) {
      const headingText = line.replace(/^#{1,4}\s+/, '').trim();
      paragraphs.push(
        new Paragraph({
          spacing: { before: 180, after: 80 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A7F3D0' },
          },
          children: [
            new TextRun({
              text: headingText.toUpperCase(),
              font: FONT_FAMILY,
              size: 22,
              bold: true,
              color: '065F46',
            }),
          ],
        })
      );
    } else if (/^[-*•]\s+/.test(line)) {
      const content = line.replace(/^[-*•]\s+/, '').trim();
      paragraphs.push(
        new Paragraph({
          indent: { left: 320, hanging: 180 },
          spacing: { after: 80, line: 270 },
          children: [
            new TextRun({
              text: '•  ',
              font: FONT_FAMILY,
              size: 21,
              bold: true,
              color: '059669',
            }),
            ...parseRichTextRuns(content, { size: 20, color: '1E293B' }),
          ],
        })
      );
    } else if (/^\d+\.\s+/.test(line)) {
      const match = line.match(/^(\d+\.)\s+(.*)$/);
      const num = match ? match[1] : '1.';
      const content = match ? match[2] : line;
      paragraphs.push(
        new Paragraph({
          indent: { left: 320, hanging: 200 },
          spacing: { after: 80, line: 270 },
          children: [
            new TextRun({
              text: `${num} `,
              font: FONT_FAMILY,
              size: 20,
              bold: true,
              color: '059669',
            }),
            ...parseRichTextRuns(content, { size: 20, color: '1E293B' }),
          ],
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 100, line: 276 },
          children: parseRichTextRuns(line, { size: 20, color: '1E293B' }),
        })
      );
    }
  }

  return paragraphs;
}

function sectionTitleParagraph(eyebrow: string, title: string, accentHex = '1D4ED8'): Paragraph {
  return new Paragraph({
    spacing: { before: 260, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: accentHex },
    },
    children: [
      new TextRun({
        text: `${eyebrow.toUpperCase()}  •  `,
        font: FONT_FAMILY,
        size: 18,
        bold: true,
        color: accentHex,
      }),
      new TextRun({
        text: title.toUpperCase(),
        font: FONT_FAMILY,
        size: 24,
        bold: true,
        color: '0F172A',
      }),
    ],
  });
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const SOFT_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0' },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0' },
  left: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0' },
  right: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0' },
};

function makeMetaCell(label: string, value: string, widthPct = 50): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F8FAFC' },
    borders: SOFT_BORDER,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: label.toUpperCase(),
            font: FONT_FAMILY,
            size: 16,
            bold: true,
            color: '64748B',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new TextRun({
            text: value || '—',
            font: FONT_FAMILY,
            size: 20,
            bold: true,
            color: '0F172A',
          }),
        ],
      }),
    ],
  });
}

function makePercentageBarRow(
  label: string,
  sublabel: string,
  pct: number,
  barHex: string,
  trackHex: string
): TableRow {
  const filledBlocks = Math.round(pct / 5); // 20 blocks max
  const emptyBlocks = Math.max(0, 20 - filledBlocks);
  const barVisual = `${'█'.repeat(filledBlocks)}${'░'.repeat(emptyBlocks)}`;

  return new TableRow({
    children: [
      new TableCell({
        width: { size: 36, type: WidthType.PERCENTAGE },
        borders: SOFT_BORDER,
        margins: { top: 110, bottom: 110, left: 140, right: 100 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: label,
                font: FONT_FAMILY,
                size: 20,
                bold: true,
                color: '0F172A',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new TextRun({
                text: sublabel,
                font: FONT_FAMILY,
                size: 17,
                color: '64748B',
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: 46, type: WidthType.PERCENTAGE },
        borders: SOFT_BORDER,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: trackHex },
        margins: { top: 110, bottom: 110, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 0 },
            children: [
              new TextRun({
                text: barVisual,
                font: 'Consolas',
                size: 18,
                color: barHex,
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: 18, type: WidthType.PERCENTAGE },
        borders: SOFT_BORDER,
        margins: { top: 110, bottom: 110, left: 100, right: 140 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0 },
            children: [
              new TextRun({
                text: `${pct}%`,
                font: FONT_FAMILY,
                size: 24,
                bold: true,
                color: barHex,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

export async function exportWordReport(profile: WordReportProfile): Promise<void> {
  const { analysis } = profile;
  const sportCat = analysis.sportCategory || profile.sportCategory || SportCategory.INDIVIDUAL;
  const sessionCtx = analysis.sessionContext || profile.sessionContext || SessionContext.PALESTRA;
  const privMode = analysis.privacyMode || profile.privacyMode || PrivacyMode.STANDARD;
  const isSpecific = Boolean(analysis.focusSpecificAthlete ?? profile.focusSpecificAthlete);

  const stageNum = Math.max(1, Math.min(5, Number(analysis.stage) || 1));
  const stageMeta = STAGE_THEME[stageNum] || STAGE_THEME[1];

  const reportHeadline = isSpecific
    ? "REPORT CONATIVO DELL'ATLETA"
    : sportCat === SportCategory.TEAM_SPORT
    ? 'REPORT CONATIVO DI SQUADRA'
    : sportCat === SportCategory.DUAL_OPPOSITION
    ? 'REPORT DUELLO CONATIVO (1 VS 1)'
    : 'REPORT CONATIVO INDIVIDUALE';

  const sPct = clampPct(analysis.graphData?.structural);
  const tPct = clampPct(analysis.graphData?.technical);
  const fPct = clampPct(analysis.graphData?.functional);

  // Render crisp 3D graph image PNG
  const graphPngBytes = await renderConativeGraphPng(
    { structural: sPct, functional: fPct, technical: tPct },
    stageNum,
    analysis.stageName || stageMeta.label
  );

  const children: Array<Paragraph | Table> = [];

  // 1. COVER HEADER BANNER
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F172A' },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 18, color: '2563EB' },
                bottom: { style: BorderStyle.SINGLE, size: 24, color: '10B981' },
                left: NO_BORDERS.left,
                right: NO_BORDERS.right,
              },
              margins: { top: 220, bottom: 220, left: 260, right: 260 },
              children: [
                new Paragraph({
                  spacing: { after: 60 },
                  children: [
                    new TextRun({
                      text: 'CONATIVESPORT ANALYST AI  •  PEDAGOGIA CONATIVA',
                      font: FONT_FAMILY,
                      size: 18,
                      bold: true,
                      color: '60A5FA',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { after: 80 },
                  children: [
                    new TextRun({
                      text: reportHeadline,
                      font: FONT_FAMILY,
                      size: 36,
                      bold: true,
                      color: 'FFFFFF',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: `${analysis.analysisScopeSummary || profile.name}  •  ${profile.sport}  •  ${CONTEXT_LABELS[sessionCtx]}`,
                      font: FONT_FAMILY,
                      size: 20,
                      color: 'CBD5E1',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  children.push(new Paragraph({ spacing: { after: 140 }, children: [] }));

  // 2. SESSION METADATA GRID
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            makeMetaCell('Data Sessione', profile.date, 34),
            makeMetaCell('Disciplina Sportiva', profile.sport, 33),
            makeMetaCell('Contesto Operativo', CONTEXT_LABELS[sessionCtx], 33),
          ],
        }),
        new TableRow({
          children: [
            makeMetaCell('Struttura Disciplina', CATEGORY_LABELS[sportCat], 34),
            makeMetaCell(
              'Oggetto dell’Analisi',
              analysis.analysisScopeSummary ||
                profile.name + (profile.teamName ? ` (${profile.teamName})` : ''),
              33
            ),
            makeMetaCell('Modalità di Vittoria / Privacy', `${analysis.victoryModality || '—'} • ${PRIVACY_LABELS[privMode]}`, 33),
          ],
        }),
      ],
    })
  );

  children.push(new Paragraph({ spacing: { after: 140 }, children: [] }));

  // 3. TAPPA CONATIVA CALLOUT CARD
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: stageMeta.accent },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 8, color: stageMeta.accent },
                bottom: { style: BorderStyle.SINGLE, size: 8, color: stageMeta.accent },
                left: { style: BorderStyle.SINGLE, size: 8, color: stageMeta.accent },
                right: NO_BORDERS.right,
              },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 160, bottom: 160, left: 100, right: 100 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 20 },
                  children: [
                    new TextRun({
                      text: 'TAPPA',
                      font: FONT_FAMILY,
                      size: 16,
                      bold: true,
                      color: 'FFFFFF',
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: String(stageNum),
                      font: FONT_FAMILY,
                      size: 52,
                      bold: true,
                      color: 'FFFFFF',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 82, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: stageMeta.softBg },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 8, color: stageMeta.border },
                bottom: { style: BorderStyle.SINGLE, size: 8, color: stageMeta.border },
                left: NO_BORDERS.left,
                right: { style: BorderStyle.SINGLE, size: 8, color: stageMeta.border },
              },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 140, bottom: 140, left: 200, right: 180 },
              children: [
                new Paragraph({
                  spacing: { after: 40 },
                  children: [
                    new TextRun({
                      text: 'DIAGNOSI CONATIVA (MODELLO GILLES BUI-XUÂN)',
                      font: FONT_FAMILY,
                      size: 16,
                      bold: true,
                      color: stageMeta.accent,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { after: 60 },
                  children: [
                    new TextRun({
                      text: `TAPPA ${stageNum}: ${(analysis.stageName || stageMeta.label).toUpperCase()}`,
                      font: FONT_FAMILY,
                      size: 28,
                      bold: true,
                      color: '0F172A',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: stageMeta.tagline,
                      font: FONT_FAMILY,
                      size: 19,
                      italics: true,
                      color: '475569',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Specific athlete certification if requested
  if (isSpecific && analysis.targetAthleteConfirmation) {
    children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'EFF6FF' },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 6, color: 'BFDBFE' },
                  bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BFDBFE' },
                  left: { style: BorderStyle.SINGLE, size: 24, color: '2563EB' },
                  right: { style: BorderStyle.SINGLE, size: 6, color: 'BFDBFE' },
                },
                margins: { top: 120, bottom: 120, left: 180, right: 160 },
                children: [
                  new Paragraph({
                    spacing: { after: 40 },
                    children: [
                      new TextRun({
                        text: 'CERTIFICAZIONE TRACCIAMENTO ATLETA SPECIFICO',
                        font: FONT_FAMILY,
                        size: 17,
                        bold: true,
                        color: '1D4ED8',
                      }),
                    ],
                  }),
                  ...buildRichParagraphs(analysis.targetAthleteConfirmation, {
                    size: 19,
                    color: '1E3A8A',
                    spacingAfter: 40,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  }

  // 4. GRAPHIC SECTION + PERCENTAGES TABLE
  children.push(sectionTitleParagraph('Sezione 1', 'Grafico Isometrico & Percentuali Tai / Gi / Shin', '2563EB'));

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 140 },
      children: [
        new ImageRun({
          type: 'png',
          data: graphPngBytes,
          transformation: {
            width: 580,
            height: 338,
          },
        }),
      ],
    })
  );

  // Native Word table with bars + percentages
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 36, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F172A' },
              borders: NO_BORDERS,
              margins: { top: 90, bottom: 90, left: 140, right: 100 },
              children: [
                new Paragraph({
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: 'DIMENSIONE CONATIVA',
                      font: FONT_FAMILY,
                      size: 17,
                      bold: true,
                      color: 'FFFFFF',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 46, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F172A' },
              borders: NO_BORDERS,
              margins: { top: 90, bottom: 90, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: 'INTENSITÀ DI MOBILITAZIONE',
                      font: FONT_FAMILY,
                      size: 17,
                      bold: true,
                      color: 'FFFFFF',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F172A' },
              borders: NO_BORDERS,
              margins: { top: 90, bottom: 90, left: 100, right: 140 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: 'VALORE',
                      font: FONT_FAMILY,
                      size: 17,
                      bold: true,
                      color: 'FFFFFF',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        makePercentageBarRow(
          'Struttura (Tai)',
          'Postura, sicurezza fisica, equilibrio di base',
          sPct,
          'DC2626',
          'FEF2F2'
        ),
        makePercentageBarRow(
          'Tecnica (Gi)',
          'Fedeltà al modello esecutivo e controllo del gesto',
          tPct,
          '2563EB',
          'EFF6FF'
        ),
        makePercentageBarRow(
          'Funzionalità (Shin)',
          'Efficacia tattica, adattamento e scopo dell’azione',
          fPct,
          '16A34A',
          'F0FDF4'
        ),
      ],
    })
  );

  // 5. CATEGORY-SPECIFIC DYNAMICS SECTION
  if (analysis.comparison) {
    const cmp = analysis.comparison;
    children.push(
      sectionTitleParagraph('Sezione 2', 'Confronto Duello Conativo (2 Giocatori Opposti)', '4F46E5')
    );

    const buildDuelCell = (
      headerTitle: string,
      athlete: typeof cmp.targetAthlete,
      bgHex: string,
      accentHex: string
    ) =>
      new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: bgHex },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 14, color: accentHex },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' },
          left: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' },
          right: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' },
        },
        margins: { top: 140, bottom: 140, left: 160, right: 160 },
        children: [
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: `${headerTitle.toUpperCase()}  •  ${athlete.role || ''}`,
                font: FONT_FAMILY,
                size: 16,
                bold: true,
                color: accentHex,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: athlete.visualIdentifier,
                font: FONT_FAMILY,
                size: 22,
                bold: true,
                color: '0F172A',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: ` TAPPA ${athlete.stage} — ${athlete.stageName} `,
                font: FONT_FAMILY,
                size: 18,
                bold: true,
                color: 'FFFFFF',
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: accentHex },
              }),
            ],
          }),
          ...buildRichParagraphs(`Azione osservata: ${athlete.actionSummary}`, {
            size: 19,
            color: '334155',
            spacingAfter: 80,
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: 'Preoccupazione: ',
                font: FONT_FAMILY,
                size: 18,
                bold: true,
                color: '475569',
              }),
              new TextRun({
                text: `"${athlete.preoccupation}"`,
                font: FONT_FAMILY,
                size: 18,
                italics: true,
                color: '475569',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new TextRun({
                text: `Tai ${clampPct(athlete.graphData?.structural)}%   |   Gi ${clampPct(athlete.graphData?.technical)}%   |   Shin ${clampPct(athlete.graphData?.functional)}%`,
                font: FONT_FAMILY,
                size: 18,
                bold: true,
                color: '0F172A',
              }),
            ],
          }),
        ],
      });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              buildDuelCell(
                isSpecific ? '1. Atleta Target' : 'Contendente A',
                cmp.targetAthlete,
                'EFF6FF',
                '2563EB'
              ),
              buildDuelCell(
                isSpecific ? '2. Avversario' : 'Contendente B',
                cmp.opponentAthlete,
                'EEF2FF',
                '4F46E5'
              ),
            ],
          }),
        ],
      })
    );

    children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: '1E1B4B' },
                borders: NO_BORDERS,
                margins: { top: 140, bottom: 140, left: 180, right: 180 },
                children: [
                  new Paragraph({
                    spacing: { after: 60 },
                    children: [
                      new TextRun({
                        text: `DOMINANZA CONATIVA: ${cmp.duel.higherStageAthlete}  (Divario: ${cmp.duel.levelGap} ${cmp.duel.levelGap === 1 ? 'tappa' : 'tappe'})`,
                        font: FONT_FAMILY,
                        size: 20,
                        bold: true,
                        color: 'FCD34D',
                      }),
                    ],
                  }),
                  new Paragraph({
                    spacing: { after: 60 },
                    children: [
                      new TextRun({
                        text: 'Meccanismo di Imposizione: ',
                        font: FONT_FAMILY,
                        size: 19,
                        bold: true,
                        color: '93C5FD',
                      }),
                      new TextRun({
                        text: cmp.duel.impositionMechanism,
                        font: FONT_FAMILY,
                        size: 19,
                        color: 'F1F5F9',
                      }),
                    ],
                  }),
                  new Paragraph({
                    spacing: { after: 0 },
                    children: [
                      new TextRun({
                        text: `Effetto di Regressione su ${cmp.duel.lowerStageAthlete}: `,
                        font: FONT_FAMILY,
                        size: 19,
                        bold: true,
                        color: 'FCA5A5',
                      }),
                      new TextRun({
                        text: cmp.duel.regressionEffect,
                        font: FONT_FAMILY,
                        size: 19,
                        color: 'F1F5F9',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  }

  if (analysis.teamDynamics) {
    const td = analysis.teamDynamics;
    children.push(
      sectionTitleParagraph('Sezione 2', `Dinamica Collettiva di Squadra (${td.teamFocus})`, '059669')
    );
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              makeMetaCell('1. Organizzazione Collettiva', td.collectiveOrganization, 33),
              makeMetaCell('2. Spazio-Tempo & Senza Palla', td.spaceTimeManagement, 34),
              makeMetaCell('3. Risposta alla Pressione', td.opponentPressureEffect, 33),
            ],
          }),
        ],
      })
    );
  }

  if (analysis.individualDynamics) {
    const idyn = analysis.individualDynamics;
    children.push(
      sectionTitleParagraph('Sezione 2', 'Rapporto Corpo-Ambiente, Attrezzo & Economia', 'D97706')
    );
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              makeMetaCell('1. Ambiente / Attrezzo', idyn.environmentOrApparatus, 33),
              makeMetaCell('2. Tecnica (Gi) vs Efficacia (Shin)', idyn.technicalVsFunctionalBalance, 34),
              makeMetaCell('3. Economia & Fluidità Motoria', idyn.motorEconomy, 33),
            ],
          }),
        ],
      })
    );
  }

  if (analysis.groupMobilization) {
    const gm = analysis.groupMobilization;
    children.push(
      sectionTitleParagraph(
        'Sezione 2B',
        'Censimento Mobilitazione Conativa del Gruppo (Movimento • Espressioni • Postura)',
        '0F766E'
      )
    );

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              makeMetaCell('Totale Alunni / Atleti Osservati', `${gm.totalDetected}`, 25),
              makeMetaCell('Mobilitati Conativamente', `${gm.mobilizedCount} (${gm.mobilizationRatePct}%)`, 25),
              makeMetaCell('Non Interessati / Passivi', `${gm.disengagedCount}`, 25),
              makeMetaCell(
                'Movimento / Coinvolgimento',
                `${gm.movementActivityScore}/100 (${gm.overallEngagementLevel})`,
                25
              ),
            ],
          }),
        ],
      })
    );

    children.push(new Paragraph({ spacing: { after: 90 }, children: [] }));

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              makeMetaCell('1. Quantità di Movimento / Attività', gm.movementActivityAnalysis, 33),
              makeMetaCell('2. Espressioni Facciali & Sguardo', gm.facialExpressionAnalysis, 34),
              makeMetaCell('3. Postura Generale del Corpo', gm.bodyPostureAnalysis, 33),
            ],
          }),
        ],
      })
    );

    if (Array.isArray(gm.observedIndividuals) && gm.observedIndividuals.length > 0) {
      children.push(new Paragraph({ spacing: { after: 90 }, children: [] }));
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 24, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F172A' },
                  borders: NO_BORDERS,
                  margins: { top: 80, bottom: 80, left: 120, right: 100 },
                  children: [
                    new Paragraph({
                      spacing: { after: 0 },
                      children: [
                        new TextRun({ text: 'SOGGETTO', font: FONT_FAMILY, size: 16, bold: true, color: 'FFFFFF' }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 22, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F172A' },
                  borders: NO_BORDERS,
                  margins: { top: 80, bottom: 80, left: 100, right: 100 },
                  children: [
                    new Paragraph({
                      spacing: { after: 0 },
                      children: [
                        new TextRun({ text: 'STATO / ATTIVITÀ', font: FONT_FAMILY, size: 16, bold: true, color: 'FFFFFF' }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 54, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F172A' },
                  borders: NO_BORDERS,
                  margins: { top: 80, bottom: 80, left: 100, right: 120 },
                  children: [
                    new Paragraph({
                      spacing: { after: 0 },
                      children: [
                        new TextRun({
                          text: 'INDICATORI VISIVI & LETTURA CONATIVA',
                          font: FONT_FAMILY,
                          size: 16,
                          bold: true,
                          color: 'FFFFFF',
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            ...gm.observedIndividuals.map((ind) => {
              const isMob = ind.status === 'MOBILITATO';
              return new TableRow({
                children: [
                  new TableCell({
                    width: { size: 24, type: WidthType.PERCENTAGE },
                    borders: SOFT_BORDER,
                    shading: { type: ShadingType.CLEAR, color: 'auto', fill: isMob ? 'F0FDF4' : 'FFF1F2' },
                    margins: { top: 80, bottom: 80, left: 120, right: 100 },
                    children: [
                      new Paragraph({
                        spacing: { after: 0 },
                        children: [
                          new TextRun({
                            text: ind.identifier,
                            font: FONT_FAMILY,
                            size: 18,
                            bold: true,
                            color: '0F172A',
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 22, type: WidthType.PERCENTAGE },
                    borders: SOFT_BORDER,
                    margins: { top: 80, bottom: 80, left: 100, right: 100 },
                    children: [
                      new Paragraph({
                        spacing: { after: 20 },
                        children: [
                          new TextRun({
                            text: isMob ? 'MOBILITATO' : 'NON INTERESSATO',
                            font: FONT_FAMILY,
                            size: 17,
                            bold: true,
                            color: isMob ? '047857' : 'BE123C',
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { after: 0 },
                        children: [
                          new TextRun({
                            text: `Movimento: ${ind.movementLevel}`,
                            font: FONT_FAMILY,
                            size: 16,
                            color: '64748B',
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 54, type: WidthType.PERCENTAGE },
                    borders: SOFT_BORDER,
                    margins: { top: 80, bottom: 80, left: 100, right: 120 },
                    children: [
                      ...buildRichParagraphs(
                        `${ind.postureAndExpressionCue} — ${ind.conativeInterpretation}`,
                        { size: 18, color: '334155', spacingAfter: 20 }
                      ),
                    ],
                  }),
                ],
              });
            }),
          ],
        })
      );
    }

    children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
    children.push(
      ...buildRichParagraphs(
        `Sintesi del Gruppo: ${gm.groupSummary}\nStrategia di Coinvolgimento Orizzontale: ${gm.reengagementStrategy}`,
        { size: 20, color: '0F172A' }
      )
    );
  }

  // 6. CONSONANCE & MOBILIZATION
  children.push(
    sectionTitleParagraph('Sezione 3', 'Consonanza o Conflitto con il Compito Motorio', '1D4ED8')
  );
  children.push(...buildRichParagraphs(analysis.consonance, { size: 21, color: '1E293B' }));

  children.push(
    sectionTitleParagraph('Sezione 4', 'Preoccupazione Dominante & Mobilitazione (Tappa Conativa)', '1D4ED8')
  );
  children.push(...buildRichParagraphs(analysis.mobilization, { size: 21, color: '1E293B' }));

  // 7. METACONATIVE REFLECTION CALLOUT
  children.push(
    sectionTitleParagraph('Sezione 5', 'Domanda di Riflessione Metaconativa', 'D97706')
  );
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFBEB' },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 6, color: 'FDE68A' },
                bottom: { style: BorderStyle.SINGLE, size: 6, color: 'FDE68A' },
                left: { style: BorderStyle.SINGLE, size: 28, color: 'D97706' },
                right: { style: BorderStyle.SINGLE, size: 6, color: 'FDE68A' },
              },
              margins: { top: 150, bottom: 150, left: 200, right: 180 },
              children: [
                new Paragraph({
                  spacing: { after: 60 },
                  children: [
                    new TextRun({
                      text: `“${analysis.metaReflection}”`,
                      font: FONT_FAMILY,
                      size: 24,
                      italics: true,
                      bold: true,
                      color: '78350F',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: 'Stimolo pedagogico di presa di coscienza (Bui-Xuân / Reuchlin) per far evolvere il senso dell’azione.',
                      font: FONT_FAMILY,
                      size: 18,
                      color: '92400E',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // 8. HORIZONTAL TRAINING SHEET (SITUATIONS-PROBLEME)
  children.push(
    sectionTitleParagraph('Sezione 6', 'Scheda di Intervento Pedagogico Orizzontale (Situazione-Problema)', '059669')
  );
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F0FDF4' },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 12, color: '059669' },
                bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A7F3D0' },
                left: { style: BorderStyle.SINGLE, size: 6, color: 'A7F3D0' },
                right: { style: BorderStyle.SINGLE, size: 6, color: 'A7F3D0' },
              },
              margins: { top: 140, bottom: 160, left: 200, right: 200 },
              children: buildTrainingSheetParagraphs(analysis.trainingSheet),
            }),
          ],
        }),
      ],
    })
  );

  // Build final Document with A4 portrait page setup & clean header/footer
  const doc = new Document({
    creator: 'ConativeSport Analyst AI',
    title: `${reportHeadline} - ${profile.name}`,
    description: `Report di analisi conativa (${profile.sport} - ${profile.date})`,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906, // A4 width in twips
              height: 16838, // A4 height in twips
            },
            margin: {
              top: 1000,
              bottom: 1000,
              left: 1000,
              right: 1000,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `ConativeSport Analyst  •  ${profile.sport}  •  ${profile.date}`,
                    font: FONT_FAMILY,
                    size: 16,
                    color: '94A3B8',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Pedagogia Conativa (Gilles Bui-Xuân • Jigoro Kano • Maurice Reuchlin)  •  Pagina ',
                    font: FONT_FAMILY,
                    size: 16,
                    color: '94A3B8',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT_FAMILY,
                    size: 16,
                    bold: true,
                    color: '64748B',
                  }),
                  new TextRun({
                    text: ' di ',
                    font: FONT_FAMILY,
                    size: 16,
                    color: '94A3B8',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT_FAMILY,
                    size: 16,
                    bold: true,
                    color: '64748B',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = (profile.name || profile.sport || 'Analisi').replace(/[^a-zA-Z0-9àèéìòù_-]+/g, '_');
  link.download = `Report_Conativo_${safeName}_${profile.date}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
