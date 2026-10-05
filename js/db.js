import { getFirebase } from './firebase-config.js';

// Animals live at users/{uid}/animals/{id}. See firestore.rules.
//
// Writes are not awaited by callers: with the offline cache a write promise only settles once
// the server confirms it, which never happens without signal. The local snapshot updates at once.

async function animalsRef(uid) {
  const { db, fs } = await getFirebase();
  return { fs, ref: fs.collection(db, 'users', uid, 'animals') };
}

// Calls onData with the full list whenever it changes. Returns an unsubscribe function.
export async function subscribeAnimals(uid, onData, onError) {
  const { fs, ref } = await animalsRef(uid);
  return fs.onSnapshot(
    ref,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

// Returns the new id immediately; `done` settles when the server has the write.
export async function addAnimal(uid, data) {
  const { fs, ref } = await animalsRef(uid);
  const docRef = fs.doc(ref);
  return { id: docRef.id, done: fs.setDoc(docRef, { ...data, createdAt: fs.serverTimestamp() }) };
}

export async function updateAnimal(uid, id, data) {
  const { fs, ref } = await animalsRef(uid);
  return { done: fs.updateDoc(fs.doc(ref, id), data) };
}

export async function deleteAnimal(uid, id) {
  const { fs, ref } = await animalsRef(uid);
  return { done: fs.deleteDoc(fs.doc(ref, id)) };
}
