# FarmEZ

A small web app for tracking cattle from purchase to sale.

- Record each animal at purchase: tag number, date of birth, breed, dam breed, purchase date, weight and cost. Breeds are entered as the code on the cattle card, e.g. `AA` for Aberdeen Angus and `AAX` for an Aberdeen Angus cross.
- Line up the animals you are selling this week on the Selling tab, with estimated weight, value and margin for the sale date.
- Record the sale date, weight and price when it goes. On sale day, enter the sale weight and type bids as they rise to see the €/kg you are getting.
- See average daily weight gain, a projected weight and an estimated sale price for every animal still on the farm.
- Compare breeds and dam breeds on gain, price per kg and profit.
- Price calculator: enter a weight and see what it is worth from €3.00 to €7.00 per kg.

Plain HTML, CSS and JavaScript with no build step. Hosted on GitHub Pages, with Firebase for sign-in and storage. Works on phone and desktop, and can be added to a phone's home screen.

## One-time setup

### 1. Firebase

1. Go to <https://console.firebase.google.com> and create a project.
2. **Build > Authentication > Get started**, then enable the **Email/Password** provider.
3. **Build > Firestore Database > Create database** (production mode, any EU region).
4. In Firestore, open the **Rules** tab, paste the contents of [`firestore.rules`](firestore.rules) and publish.
5. **Project settings > Your apps > Web app (`</>`)**, register an app, and copy the `firebaseConfig` object.
6. Paste those values into [`js/firebase-config.js`](js/firebase-config.js).

The config values are not secret. The rules in step 4 are what keep each user's herd private.

### 2. GitHub Pages

1. Push to `main`.
2. In the repository: **Settings > Pages > Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Back in Firebase: **Authentication > Settings > Authorized domains**, add `eshanco.github.io`.

The app is then at <https://eshanco.github.io/FarmEZ/>. Open it, choose **Create an account**, and start adding animals.

## How the estimates work

**Daily gain** is (latest weight − purchase weight) ÷ days since purchase.

For an animal still on the farm, the gain rate used for projections is the first of these that is available:

1. the animal's own gain, once it has a weigh-in at least 30 days after purchase (interim weigh-ins are switched off for now; see `WEIGH_INS_ENABLED` in `js/views/animal.js`);
2. the average of sold animals with the same breed and dam breed;
3. the average of sold animals with the same breed;
4. the average of all sold animals;
5. a figure you type in.

**Projected weight** is the last known weight plus that rate for each day since. **Estimated sale price** is projected weight × €/kg, where €/kg defaults to the average of your last five sales and can be changed on any animal. The €/kg and gain rate you type are saved to your account, so every device you sign in on shows the same estimates.

## Development

```sh
npm start   # serves the app at http://localhost:8000
npm test    # unit tests for the calculations in js/calc.js
```

`localhost` is an authorized domain in Firebase by default, so sign-in works locally.
