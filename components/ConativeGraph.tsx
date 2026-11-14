import React from 'react';

interface ConativeGraphProps {
  data: {
    structural: number; // Red - Bottom Left (Tai)
    functional: number; // Green - Right (Shin/Functional)
    technical: number; // Blue - Top (Gi/Technical)
  };
}

const ConativeGraph: React.FC<ConativeGraphProps> = ({ data }) => {
  // SVG Configuration - Large dimensions for high impact
  const width = 600;
  const height = 600;
  
  // Origin shift to balance the larger volume
  const cx = width / 2 - 40;
  const cy = height / 2 + 50;
  const scale = 2.4; 
  const axisLength = 100 * scale;

  // Normalized values (0-1)
  const s = data.structural / 100;
  const f = data.functional / 100;
  const t = data.technical / 100;

  // Unit vectors for isometric projection
  const vStr = { x: -0.7, y: 0.4 }; // Structural (Tai)
  const vFun = { x: 1.0, y: 0.0 };  // Functional (Shin)
  const vTec = { x: 0.0, y: -1.0 }; // Technical (Gi)

  const getCoord = (strVal: number, funVal: number, tecVal: number) => {
    return {
      x: cx + (strVal * vStr.x + funVal * vFun.x + tecVal * vTec.x) * axisLength,
      y: cy + (strVal * vStr.y + funVal * vFun.y + tecVal * vTec.y) * axisLength
    };
  };

  const o = { x: cx, y: cy };
  const pStrMax = getCoord(1, 0, 0);
  const pFunMax = getCoord(0, 1, 0);
  const pTecMax = getCoord(0, 0, 1);
  
  // Vertices for the conative volume
  const pS = getCoord(s, 0, 0);
  const pF = getCoord(0, f, 0);
  const pT = getCoord(0, 0, t);
  const pSF = getCoord(s, f, 0);
  const pST = getCoord(s, 0, t);
  const pFT = getCoord(0, f, t);
  const pFinal = getCoord(s, f, t);

  // Faces definitions
  const faceBase = `${o.x},${o.y} ${pS.x},${pS.y} ${pSF.x},${pSF.y} ${pF.x},${pF.y}`;
  const faceLeft = `${o.x},${o.y} ${pS.x},${pS.y} ${pST.x},${pST.y} ${pT.x},${pT.y}`;
  const faceRight = `${o.x},${o.y} ${pF.x},${pF.y} ${pFT.x},${pFT.y} ${pT.x},${pT.y}`;
  const faceTop = `${pT.x},${pT.y} ${pST.x},${pST.y} ${pFinal.x},${pFinal.y} ${pFT.x},${pFT.y}`;

  return (
    <div className="w-full bg-white rounded-[2.5rem] flex flex-col items-center p-6 gap-6 overflow-hidden">
      {/* Title */}
      <div className="text-center w-full border-b border-slate-100 pb-3">
        <h3 className="text-slate-800 font-black uppercase tracking-[0.3em] text-[11px]">Analisi delle Dimensioni</h3>
      </div>

      {/* Graph Area */}
      <div className="relative w-full flex justify-center items-center bg-white/50 rounded-3xl">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="drop-shadow-xl w-full max-w-[480px] aspect-square transform scale-105">
          <defs>
            <marker id="arrow-red" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#ef4444" />
            </marker>
            <marker id="arrow-green" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#22c55e" />
            </marker>
            <marker id="arrow-blue" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6" />
            </marker>
          </defs>

          {/* AXES LINES (Background) */}
          <line x1={o.x} y1={o.y} x2={pStrMax.x} y2={pStrMax.y} stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrow-red)" opacity="0.3" />
          <line x1={o.x} y1={o.y} x2={pFunMax.x} y2={pFunMax.y} stroke="#22c55e" strokeWidth="2" markerEnd="url(#arrow-green)" opacity="0.3" />
          <line x1={o.x} y1={o.y} x2={pTecMax.x} y2={pTecMax.y} stroke="#3b82f6" strokeWidth="2" markerEnd="url(#arrow-blue)" opacity="0.3" />

          {/* COLORED VOLUME FACES */}
          {/* Base Floor - Colored (Amber/Yellow) */}
          <polygon points={faceBase} fill="#facc15" fillOpacity="0.35" stroke="#eab308" strokeWidth="1" strokeOpacity="0.4" />
          
          {/* Walls */}
          <polygon points={faceLeft} fill="#ef4444" fillOpacity="0.25" stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.4" />
          <polygon points={faceRight} fill="#22c55e" fillOpacity="0.25" stroke="#22c55e" strokeWidth="1.5" strokeOpacity="0.4" />
          <polygon points={faceTop} fill="#3b82f6" fillOpacity="0.25" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.4" />

          {/* DASHED PROJECTIONS */}
          <line x1={pS.x} y1={pS.y} x2={pSF.x} y2={pSF.y} stroke="#94a3b8" strokeWidth="1" strokeDasharray="5" opacity="0.4" />
          <line x1={pF.x} y1={pF.y} x2={pSF.x} y2={pSF.y} stroke="#94a3b8" strokeWidth="1" strokeDasharray="5" opacity="0.4" />
          <line x1={pSF.x} y1={pSF.y} x2={pFinal.x} y2={pFinal.y} stroke="#94a3b8" strokeWidth="1" strokeDasharray="5" opacity="0.4" />

          {/* RESULT VECTOR */}
          <line x1={o.x} y1={o.y} x2={pFinal.x} y2={pFinal.y} stroke="#991b1b" strokeWidth="6" strokeLinecap="round" />
          <circle cx={pFinal.x} cy={pFinal.y} r="10" fill="#dc2626" stroke="white" strokeWidth="3" />
          <circle cx={pFinal.x} cy={pFinal.y} r="18" fill="none" stroke="#dc2626" strokeWidth="1" opacity="0.2" />

          {/* AXIS LABELS - Positioning optimized for the scale */}
          <text x={pStrMax.x - 30} y={pStrMax.y + 45} fill="#ef4444" fontSize="16" fontWeight="900" textAnchor="middle">STRUTTURA</text>
          <text x={pFunMax.x + 30} y={pFunMax.y + 25} fill="#22c55e" fontSize="16" fontWeight="900" textAnchor="start">FUNZIONALE</text>
          <text x={pTecMax.x} y={pTecMax.y - 35} fill="#3b82f6" fontSize="16" fontWeight="900" textAnchor="middle">TECNICA</text>

          {/* 100% TICK LABELS */}
          <text x={pStrMax.x - 45} y={pStrMax.y + 15} fill="#94a3b8" fontSize="11" fontWeight="bold">100%</text>
          <text x={pFunMax.x - 10} y={pFunMax.y + 25} fill="#94a3b8" fontSize="11" fontWeight="bold">100%</text>
          <text x={pTecMax.x + 15} y={pTecMax.y + 5} fill="#94a3b8" fontSize="11" fontWeight="bold">100%</text>
        </svg>
      </div>

      {/* Vertical Legend Below the Graph with Percentages */}
      <div className="w-full max-w-[320px] bg-slate-50/80 p-5 rounded-3xl border border-slate-100 flex flex-col gap-4 shadow-sm">
        {/* Struttura (Tai) */}
        <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm border border-red-50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-red-100">S</div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-800 uppercase tracking-tighter">Struttura</span>
              <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest">(TAI)</span>
            </div>
          </div>
          <div className="text-lg font-black text-red-600 tabular-nums">
            {data.structural}%
          </div>
        </div>
        
        {/* Funzionalità (Shin) */}
        <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm border border-green-50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-green-100">F</div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-800 uppercase tracking-tighter">Funzionalità</span>
              <span className="text-[9px] font-bold text-green-600 uppercase tracking-widest">(SHIN)</span>
            </div>
          </div>
          <div className="text-lg font-black text-green-600 tabular-nums">
            {data.functional}%
          </div>
        </div>

        {/* Tecnica (Gi) */}
        <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm border border-blue-50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-blue-100">T</div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-800 uppercase tracking-tighter">Tecnica</span>
              <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">(GI)</span>
            </div>
          </div>
          <div className="text-lg font-black text-blue-600 tabular-nums">
            {data.technical}%
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConativeGraph;