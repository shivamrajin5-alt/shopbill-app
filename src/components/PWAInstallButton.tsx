import React, { useState } from 'react';
import { Download, Smartphone, CheckCircle2, X, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'topbar' | 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'topbar',
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
          <div>
            <div className="text-xs font-bold text-emerald-900">
              BillKart App Installed
            </div>
            <div className="text-[11px] text-emerald-700">
              Running in standalone app mode on this device.
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleAction = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuide(true);
  };

  const renderGuideModal = () => {
    if (!showGuide) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
          className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 text-slate-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <h3
                  id="pwa-install-guide-title"
                  className="text-sm font-bold text-slate-900"
                >
                  Install BillKart App
                </h3>
                <p className="text-[11px] text-slate-500">
                  {isIOS
                    ? 'iPhone / iPad Safari Instructions'
                    : 'Android & Desktop Chrome Instructions'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              aria-label="Close install instructions"
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isIOS ? (
            <ol className="mt-4 space-y-2.5 text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-700">1.</span>
                <span>
                  Safari toolbar mein <Share className="w-3.5 h-3.5 inline text-sky-600 mx-0.5" />{' '}
                  <strong>Share</strong> button par tap karein.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-700">2.</span>
                <span>
                  Neeche scroll karke <strong>Add to Home Screen</strong> select karein aur <strong>Add</strong> tap karein.
                </span>
              </li>
            </ol>
          ) : (
            <ol className="mt-4 space-y-2.5 text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-700">1.</span>
                <span>
                  Apne Android phone ke <strong>Chrome</strong> browser mein ye page open karein (full tab mein, iframe ke bahar).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-700">2.</span>
                <span>
                  Top-right <strong>⋮ Menu</strong> par tap karein aur{' '}
                  <strong>Install app</strong> ya <strong>Add to Home screen</strong> chunein.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-700">3.</span>
                <span>
                  BillKart home screen par native Android app ki tarah install ho jaayega aur offline-ready chalega.
                </span>
              </li>
            </ol>
          )}

          <button
            type="button"
            onClick={() => setShowGuide(false)}
            className="mt-4 w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 py-2.5 text-xs font-bold text-white transition"
          >
            Got it
          </button>
        </div>
      </div>
    );
  };

  if (variant === 'card') {
    return (
      <>
        <div className="bg-gradient-to-br from-emerald-50 to-white p-4 rounded-xl border border-emerald-200 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Android &amp; Mobile App (PWA)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Home screen par install karke full-screen billing app chalayein
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAction}
            className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-sm transition flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {isInstallable
              ? 'Install BillKart App'
              : isIOS
                ? 'Install on iPhone / iPad'
                : isAndroid
                  ? 'Install on Android Phone'
                  : 'Install App'}
          </button>
        </div>
        {renderGuideModal()}
      </>
    );
  }

  if (variant === 'compact') {
    if (!isInstallable && !isIOS && !isAndroid) {
      return null;
    }
    return (
      <>
        <button
          type="button"
          onClick={handleAction}
          className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
        >
          <Download className="w-3.5 h-3.5" />
          {isInstallable
            ? 'Install BillKart App on Device'
            : isIOS
              ? 'Install BillKart on iPhone'
              : 'Install BillKart on Android'}
        </button>
        {renderGuideModal()}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleAction}
        title="Install BillKart App"
        className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {isInstallable ? 'Install App' : isIOS ? 'Install on iOS' : 'Install App'}
        </span>
      </button>
      {renderGuideModal()}
    </>
  );
};
