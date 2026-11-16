import { useEffect, useState } from 'react';
import {
  detectPwaPlatform,
  isRunningStandalone,
  type PwaPlatform,
} from '../utils/pwa';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return isRunningStandalone(
      window.matchMedia('(display-mode: standalone)').matches,
      (window.navigator as unknown as { standalone?: boolean }).standalone
    );
  });
  const [platform, setPlatform] = useState<PwaPlatform>(() => {
    if (typeof window === 'undefined') return 'desktop';
    return detectPwaPlatform(window.navigator.userAgent);
  });

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const syncStandalone = () => {
      setIsInstalled(
        isRunningStandalone(
          media.matches,
          (window.navigator as unknown as { standalone?: boolean }).standalone
        )
      );
    };

    syncStandalone();
    setPlatform(detectPwaPlatform(window.navigator.userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    media.addEventListener?.('change', syncStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      media.removeEventListener?.('change', syncStandalone);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS: platform === 'ios',
    isAndroid: platform === 'android',
    platform,
    install,
  };
}
