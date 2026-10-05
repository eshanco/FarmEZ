import { getFirebase } from './firebase-config.js';

export async function watchAuth(callback) {
  const { auth, authMod } = await getFirebase();
  return authMod.onAuthStateChanged(auth, callback);
}

export async function signIn(email, password) {
  const { auth, authMod } = await getFirebase();
  await authMod.signInWithEmailAndPassword(auth, email, password);
}

export async function register(email, password) {
  const { auth, authMod } = await getFirebase();
  await authMod.createUserWithEmailAndPassword(auth, email, password);
}

export async function resetPassword(email) {
  const { auth, authMod } = await getFirebase();
  await authMod.sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  const { auth, authMod } = await getFirebase();
  await authMod.signOut(auth);
}

const MESSAGES = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/email-already-in-use': 'An account already exists for that email. Sign in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Check your signal and try again.',
  'auth/operation-not-allowed': 'Email/password sign-in is not enabled in the Firebase console.',
};

export function authErrorMessage(err) {
  return MESSAGES[err?.code] ?? `Something went wrong (${err?.code ?? err?.message ?? 'unknown error'}).`;
}
