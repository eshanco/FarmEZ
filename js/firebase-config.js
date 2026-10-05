// Firebase web config. These values identify the project and are safe to publish;
// access to data is controlled by firestore.rules, not by keeping this secret.
export const firebaseConfig = {
  apiKey: 'AIzaSyDPl7bPvP9k_2Nb-5P7ZQPIoKa-pny7-KI',
  authDomain: 'farmez-34668.firebaseapp.com',
  projectId: 'farmez-34668',
  storageBucket: 'farmez-34668.firebasestorage.app',
  messagingSenderId: '721016067616',
  appId: '1:721016067616:web:efdd62267a13583a8c8e45',
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
