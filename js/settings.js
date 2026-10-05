import { saveSettings, subscribeSettings } from './db.js';
import { positive, reportWrite } from './util.js';

// Estimate defaults (the €/kg and a typed gain rate) are saved to the account so every device
// shows the same herd values. A copy stays in localStorage so they are there before the first
// snapshot arrives. Storage can be unavailable (private windows), so failures are ignored.

const KEYS = ['pricePerKg', 'manualAdg'];
// These are set on every keystroke, so writes wait for a pause in typing.
const SAVE_DELAY = 800;

let uid = null;
let pending = {};
let timer;

function readLocal(key) {
  try {
    return positive(localStorage.getItem(`farmez.${key}`) ?? '');
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    if (value === null) localStorage.removeItem(`farmez.${key}`);
    else localStorage.setItem(`farmez.${key}`, String(value));
  } catch {
    // ignore
  }
}

function save(userId, data) {
  saveSettings(userId, data).then(({ done }) => reportWrite(done));
}

export function getSetting(key) {
  return readLocal(key);
}

export function setSetting(key, value) {
  writeLocal(key, value);
  if (!uid) return;
  pending[key] = value;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const data = pending;
    pending = {};
    save(uid, data);
  }, SAVE_DELAY);
}

// Keeps this device in step with the account. Calls onChange when another device changed a
// value. Returns a function that stops watching.
export async function watchSettings(userId, onChange, onError) {
  uid = userId;
  const stop = await subscribeSettings(
    userId,
    (remote, fromCache) => {
      const unsaved = {};
      let changed = false;
      for (const key of KEYS) {
        if (key in pending) continue; // typed here and not saved yet
        const local = readLocal(key);
        if (remote[key] === undefined) {
          if (local !== null) unsaved[key] = local;
          continue;
        }
        const value = positive(remote[key] ?? '');
        if (value !== local) {
          writeLocal(key, value);
          changed = true;
        }
      }
      // Values set on this device before settings were synced. An empty offline cache does not
      // mean the account has none, so wait for the server's answer before sending them up.
      if (!fromCache && Object.keys(unsaved).length) save(userId, unsaved);
      if (changed) onChange();
    },
    onError,
  );
  return () => {
    stop();
    clearTimeout(timer);
    pending = {};
    uid = null;
  };
}
