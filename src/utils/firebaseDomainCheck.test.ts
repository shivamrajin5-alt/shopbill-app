import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AI_STUDIO_PROJECT_ID,
  evaluateFirebaseDomainConfig,
  getFirebaseConsoleAuthSettingsUrl,
  isAuthorizedByDefaultHost,
  isUnauthorizedDomainError,
  normalizeDomainHost,
} from './firebaseDomainCheck.ts';

test('normalizeDomainHost extracts lowercase hostname without protocol, port, or path', () => {
  assert.equal(normalizeDomainHost('https://ShopBill-App.OnRender.com/admin'), 'shopbill-app.onrender.com');
  assert.equal(normalizeDomainHost('http://localhost:3000/'), 'localhost');
  assert.equal(normalizeDomainHost('  127.0.0.1:8080 '), '127.0.0.1');
});

test('isAuthorizedByDefaultHost allows localhost, firebaseapp, web.app, and Cloud Run hosts', () => {
  assert.equal(isAuthorizedByDefaultHost('localhost'), true);
  assert.equal(isAuthorizedByDefaultHost('127.0.0.1'), true);
  assert.equal(isAuthorizedByDefaultHost('rosy-alcove-l7c1c.firebaseapp.com'), true);
  assert.equal(isAuthorizedByDefaultHost('ais-pre-xdxduqy7b62v2s6g3coptd.asia-east1.run.app'), true);
  assert.equal(isAuthorizedByDefaultHost('shopbill-app.onrender.com'), false);
  assert.equal(isAuthorizedByDefaultHost('billing.myshop.in'), false);
});

test('isUnauthorizedDomainError detects Firebase auth/unauthorized-domain errors', () => {
  assert.equal(isUnauthorizedDomainError(new Error('Firebase: Error (auth/unauthorized-domain).')), true);
  assert.equal(
    isUnauthorizedDomainError(
      'Domain "shopbill-app.onrender.com" is not authorized in Firebase Authentication.'
    ),
    true
  );
  assert.equal(isUnauthorizedDomainError({ code: 'auth/unauthorized-domain', message: 'fail' }), true);
  assert.equal(isUnauthorizedDomainError(new Error('auth/popup-blocked')), false);
});

test('getFirebaseConsoleAuthSettingsUrl builds direct Authentication Settings deep link', () => {
  assert.equal(
    getFirebaseConsoleAuthSettingsUrl('rosy-alcove-l7c1c'),
    'https://console.firebase.google.com/project/rosy-alcove-l7c1c/authentication/settings'
  );
  assert.equal(getFirebaseConsoleAuthSettingsUrl(''), 'https://console.firebase.google.com/');
});

test('evaluateFirebaseDomainConfig flags external unverified host, unauthorized errors, and missing config', () => {
  const renderUnverified = evaluateFirebaseDomainConfig({
    hostname: 'shopbill-app.onrender.com',
    origin: 'https://shopbill-app.onrender.com',
    projectId: DEFAULT_AI_STUDIO_PROJECT_ID,
    authDomain: 'rosy-alcove-l7c1c.firebaseapp.com',
    cloudUserEmail: null,
  });
  assert.equal(renderUnverified.misconfigured, true);
  assert.equal(renderUnverified.reason, 'external_unverified_host');
  assert.equal(renderUnverified.domain, 'shopbill-app.onrender.com');
  assert.equal(renderUnverified.usesDefaultAiStudioProject, true);
  assert.match(renderUnverified.firebaseConsoleUrl, /rosy-alcove-l7c1c\/authentication\/settings/);

  const renderSignedIn = evaluateFirebaseDomainConfig({
    hostname: 'shopbill-app.onrender.com',
    origin: 'https://shopbill-app.onrender.com',
    projectId: 'my-custom-proj',
    authDomain: 'my-custom-proj.firebaseapp.com',
    cloudUserEmail: 'owner@gmail.com',
  });
  assert.equal(renderSignedIn.misconfigured, false);
  assert.equal(renderSignedIn.reason, 'ok');

  const recordedErrorOnRunApp = evaluateFirebaseDomainConfig({
    hostname: 'ais-pre-test.asia-east1.run.app',
    projectId: DEFAULT_AI_STUDIO_PROJECT_ID,
    authDomain: 'rosy-alcove-l7c1c.firebaseapp.com',
    recordedErrorHost: 'ais-pre-test.asia-east1.run.app',
  });
  assert.equal(recordedErrorOnRunApp.misconfigured, true);
  assert.equal(recordedErrorOnRunApp.reason, 'unauthorized_domain_error');

  const missingConfig = evaluateFirebaseDomainConfig({
    hostname: 'localhost',
    projectId: '',
    authDomain: '',
  });
  assert.equal(missingConfig.misconfigured, true);
  assert.equal(missingConfig.reason, 'missing_auth_domain');
});
