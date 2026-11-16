export type PwaPlatform = 'android' | 'ios' | 'desktop';

export interface PwaInstallStatusInput {
  isStandalone: boolean;
  hasDeferredPrompt: boolean;
  userAgent: string;
}

export interface PwaInstallStateSummary {
  platform: PwaPlatform;
  isStandalone: boolean;
  canPromptNativeInstall: boolean;
  shouldShowInstallButton: boolean;
  installLabel: string;
}

export function detectPwaPlatform(userAgent: string): PwaPlatform {
  const ua = (userAgent || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) {
    return 'ios';
  }
  if (/android/.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

export function isRunningStandalone(
  matchMediaStandalone: boolean,
  navigatorStandalone?: boolean
): boolean {
  return Boolean(matchMediaStandalone || navigatorStandalone === true);
}

export function getPwaInstallSummary(
  input: PwaInstallStatusInput
): PwaInstallStateSummary {
  const platform = detectPwaPlatform(input.userAgent);
  const canPromptNativeInstall = !input.isStandalone && input.hasDeferredPrompt;
  const shouldShowInstallButton =
    !input.isStandalone && (input.hasDeferredPrompt || platform === 'ios' || platform === 'android');

  let installLabel = 'Install App';
  if (input.isStandalone) {
    installLabel = 'Installed';
  } else if (platform === 'ios' && !canPromptNativeInstall) {
    installLabel = 'Install on iPhone';
  } else if (platform === 'android') {
    installLabel = 'Install Android App';
  }

  return {
    platform,
    isStandalone: input.isStandalone,
    canPromptNativeInstall,
    shouldShowInstallButton,
    installLabel,
  };
}
