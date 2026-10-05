// Firebase web config. These values identify the project and are safe to publish;
// access to data is controlled by firestore.rules, not by keeping this secret.
// Replace with the config from Firebase console > Project settings > Your apps.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export const isConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');

const SDK = 'https://www.gstatic.com/firebasejs/12.4.0';

let ready;

// Loads the SDK on first use, so the price calculator works without it.
export function getFirebase() {
  ready ??= (async () => {
    const [appMod, authMod, fs] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    // Local cache keeps the herd readable and editable with no signal; writes sync when back online.
    const db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
    return { auth: authMod.getAuth(app), authMod, db, fs };
  })();
  return ready;
}
