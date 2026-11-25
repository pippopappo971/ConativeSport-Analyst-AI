import React, { useState } from 'react';
import { Download, Smartphone, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors border border-blue-400/40 font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
        title="Installa ConativeSport Analyst come app sul tuo dispositivo"
      >
        <Download size={13} />
        Installa App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors border border-blue-400/40 font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
          title="Installa su iPhone o iPad con l'icona dedicata"
        >
          <Smartphone size={13} />
          Installa su iOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white text-slate-800 p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/pwa-192x192.png"
                    alt="Icona ConativeSport Analyst"
                    className="w-12 h-12 rounded-xl border border-slate-200 shadow-xs shrink-0"
                  />
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Installa su iPhone / iPad
                    </h3>
                    <p className="text-[11px] text-slate-500 font-semibold">
                      Aggiungi l&apos;app con l&apos;icona ufficiale alla schermata Home
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <ol className="space-y-2.5 text-xs text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <li className="flex items-start gap-2">
                  <Share size={15} className="text-blue-600 shrink-0 mt-0.5" />
                  <span>
                    1. Tocca il pulsante <strong>Condividi</strong> nella barra di Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <PlusSquare size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    2. Scorri verso il basso e seleziona <strong>Aggiungi alla schermata Home</strong>.
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Ho capito
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
