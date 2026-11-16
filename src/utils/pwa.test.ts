import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPwaPlatform,
  getPwaInstallSummary,
  isRunningStandalone,
} from './pwa';

test('detectPwaPlatform identifies Android, iOS, and desktop user agents', () => {
  assert.equal(
    detectPwaPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0 Mobile Safari/537.36'),
    'android'
  );
  assert.equal(
    detectPwaPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15'),
    'ios'
  );
  assert.equal(
    detectPwaPlatform('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0'),
    'desktop'
  );
});

test('isRunningStandalone handles display-mode media query and iOS navigator.standalone', () => {
  assert.equal(isRunningStandalone(true, false), true);
  assert.equal(isRunningStandalone(false, true), true);
  assert.equal(isRunningStandalone(false, false), false);
});

test('getPwaInstallSummary hides install button in standalone mode and enables native prompt when available', () => {
  const standaloneSummary = getPwaInstallSummary({
    isStandalone: true,
    hasDeferredPrompt: true,
    userAgent: 'Android Chrome',
  });
  assert.equal(standaloneSummary.isStandalone, true);
  assert.equal(standaloneSummary.shouldShowInstallButton, false);
  assert.equal(standaloneSummary.canPromptNativeInstall, false);

  const androidNativePrompt = getPwaInstallSummary({
    isStandalone: false,
    hasDeferredPrompt: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
  });
  assert.equal(androidNativePrompt.platform, 'android');
  assert.equal(androidNativePrompt.canPromptNativeInstall, true);
  assert.equal(androidNativePrompt.shouldShowInstallButton, true);
  assert.equal(androidNativePrompt.installLabel, 'Install Android App');

  const iosSafari = getPwaInstallSummary({
    isStandalone: false,
    hasDeferredPrompt: false,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
  });
  assert.equal(iosSafari.platform, 'ios');
  assert.equal(iosSafari.canPromptNativeInstall, false);
  assert.equal(iosSafari.shouldShowInstallButton, true);
  assert.equal(iosSafari.installLabel, 'Install on iPhone');
});
