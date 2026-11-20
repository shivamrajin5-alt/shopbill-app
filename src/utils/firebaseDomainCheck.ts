export type FirebaseDomainMisconfigReason =
  | 'ok'
  | 'unauthorized_domain_error'
  | 'external_unverified_host'
  | 'missing_auth_domain';

export interface FirebaseDomainStatus {
  misconfigured: boolean;
  reason: FirebaseDomainMisconfigReason;
  domain: string;
  origin: string;
  projectId: string;
  authDomain: string;
  firebaseConsoleUrl: string;
  usesDefaultAiStudioProject: boolean;
  headline: string;
  message: string;
}

const DOMAIN_ERROR_STORAGE_KEY = 'shopbill_firebase_domain_error_v1';
export const DEFAULT_AI_STUDIO_PROJECT_ID = 'rosy-alcove-l7c1c';

export function normalizeDomainHost(hostname?: string | null): string {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0]
    .replace(/^\[|\]$/g, '');
}

export function isAuthorizedByDefaultHost(hostname?: string | null): boolean {
  const clean = normalizeDomainHost(hostname);
  if (!clean) return false;
  if (clean === 'localhost' || clean === '127.0.0.1' || clean === '::1') {
    return true;
  }
  if (
    clean.endsWith('.firebaseapp.com') ||
    clean.endsWith('.web.app') ||
    clean.endsWith('.run.app')
  ) {
    return true;
  }
  return false;
}

export function isUnauthorizedDomainError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '').toLowerCase()
      : '';
  const combined = `${code} ${msg}`;
  return (
    combined.includes('auth/unauthorized-domain') ||
    combined.includes('unauthorized-domain') ||
    combined.includes('is not authorized in firebase authentication') ||
    combined.includes('not authorized for oauth operations')
  );
}

export function getFirebaseConsoleAuthSettingsUrl(projectId?: string | null): string {
  const clean = String(projectId || '').trim();
  if (!clean) {
    return 'https://console.firebase.google.com/';
  }
  return `https://console.firebase.google.com/project/${encodeURIComponent(clean)}/authentication/settings`;
}

export function evaluateFirebaseDomainConfig(input: {
  hostname?: string | null;
  origin?: string | null;
  projectId?: string | null;
  authDomain?: string | null;
  cloudUserEmail?: string | null;
  recordedErrorHost?: string | null;
}): FirebaseDomainStatus {
  const domain = normalizeDomainHost(input.hostname) || 'localhost';
  const origin = String(input.origin || '').trim() || `https://${domain}`;
  const projectId = String(input.projectId || '').trim();
  const authDomain = String(input.authDomain || '').trim();
  const firebaseConsoleUrl = getFirebaseConsoleAuthSettingsUrl(projectId);
  const usesDefaultAiStudioProject = projectId === DEFAULT_AI_STUDIO_PROJECT_ID;
  const recordedHost = normalizeDomainHost(input.recordedErrorHost);

  if (!projectId || !authDomain) {
    return {
      misconfigured: true,
      reason: 'missing_auth_domain',
      domain,
      origin,
      projectId,
      authDomain,
      firebaseConsoleUrl,
      usesDefaultAiStudioProject,
      headline: 'Configuration Guide: Firebase Auth Config Incomplete',
      message:
        'Firebase projectId or authDomain is missing. Verify your Firebase config and authorized domains in the Firebase Console.',
    };
  }

  if (recordedHost && recordedHost === domain) {
    return {
      misconfigured: true,
      reason: 'unauthorized_domain_error',
      domain,
      origin,
      projectId,
      authDomain,
      firebaseConsoleUrl,
      usesDefaultAiStudioProject,
      headline: 'Configuration Guide: Authorize This Domain in Firebase',
      message: `Firebase blocked Google Sign-In because "${domain}" is not listed under Authentication > Settings > Authorized domains for project "${projectId}".`,
    };
  }

  if (!isAuthorizedByDefaultHost(domain) && !input.cloudUserEmail) {
    return {
      misconfigured: true,
      reason: 'external_unverified_host',
      domain,
      origin,
      projectId,
      authDomain,
      firebaseConsoleUrl,
      usesDefaultAiStudioProject,
      headline: 'Configuration Guide: External Domain Authorization Required',
      message: `This app is hosted on "${domain}", which must be added to Firebase Authentication > Settings > Authorized domains before Google Sign-In & Cloud Sync will work.`,
    };
  }

  return {
    misconfigured: false,
    reason: 'ok',
    domain,
    origin,
    projectId,
    authDomain,
    firebaseConsoleUrl,
    usesDefaultAiStudioProject,
    headline: 'Firebase Authorized Domain Ready',
    message: `"${domain}" is ready for Firebase Authentication.`,
  };
}

export function recordUnauthorizedDomainHost(hostname?: string | null): void {
  const clean = normalizeDomainHost(hostname);
  if (!clean || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(DOMAIN_ERROR_STORAGE_KEY, clean);
  } catch (_) {}
}

export function getRecordedUnauthorizedDomainHost(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const val = window.localStorage.getItem(DOMAIN_ERROR_STORAGE_KEY);
    const clean = normalizeDomainHost(val);
    return clean || null;
  } catch (_) {
    return null;
  }
}

export function clearRecordedUnauthorizedDomainHost(hostname?: string | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (!hostname) {
      window.localStorage.removeItem(DOMAIN_ERROR_STORAGE_KEY);
      return;
    }
    const clean = normalizeDomainHost(hostname);
    const existing = normalizeDomainHost(window.localStorage.getItem(DOMAIN_ERROR_STORAGE_KEY));
    if (!existing || existing === clean) {
      window.localStorage.removeItem(DOMAIN_ERROR_STORAGE_KEY);
    }
  } catch (_) {}
}
