/**
 * ShopBill Admin Panel - Firebase Configuration & Initialization
 * Connects to provisioned Cloud Firestore database using firestoreDatabaseId
 * and provides structured Firestore error reporting + timeout guards.
 */

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write'
});

// Provisioned Firebase configuration (synchronized with /firebase-applet-config.json)
let loadedConfig = {
  projectId: 'rosy-alcove-l7c1c',
  appId: '1:1078814903052:web:f0e0c405dfe14c6a645729',
  apiKey: 'AIzaSyBtA7xsZw-7ARFbIQAXxEs5j0MoM5N51qE',
  authDomain: 'rosy-alcove-l7c1c.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-shopbillposbilli-a91626e5-15a5-412a-ac2b-645ef774a325',
  storageBucket: 'rosy-alcove-l7c1c.firebasestorage.app',
  messagingSenderId: '1078814903052'
};

try {
  const res = await fetch('/api/firebase-config', { cache: 'no-store' });
  if (res.ok) {
    const json = await res.json();
    if (json && json.projectId && json.apiKey) {
      loadedConfig = json;
    }
  }
} catch (_) {
  // Use embedded provisioned config if fetch is unavailable
}

export const firebaseConfig = loadedConfig;

let app;
let auth;
let db;
let isLiveFirebase = false;

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  db = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
  isLiveFirebase = true;
} catch (error) {
  console.warn('[ShopBill Firebase] Initialization warning:', error.message);
  isLiveFirebase = false;
}

export function handleFirestoreError(error, operationType, path) {
  const user = auth?.currentUser;
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: user?.uid ?? null,
      email: user?.email ?? null,
      emailVerified: user?.emailVerified ?? null,
      isAnonymous: user?.isAnonymous ?? null,
      tenantId: user?.tenantId ?? null,
      providerInfo: (user?.providerData || []).map((p) => ({
        providerId: p.providerId ?? null,
        email: p.email ?? null
      }))
    }
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return new Error(JSON.stringify(errInfo));
}

export function withTimeout(promise, ms = 4500, label = 'Operation') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function testConnection() {
  if (!db) return;
  try {
    await withTimeout(getDocFromServer(doc(db, 'test', 'connection')), 3500, 'Firestore connection test');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export {
  app,
  auth,
  db,
  isLiveFirebase,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
};
