import { signOutUser, watchAuth } from './auth.js';
import { toBreedCode } from './breeds.js';
import { subscribeAnimals } from './db.js';
import { isConfigured } from './firebase-config.js';
import { watchSettings } from './settings.js';
import { toast } from './util.js';
import { renderAnimal } from './views/animal.js';
import { renderCalculator } from './views/calculator.js';
import { renderAnimalForm, renderHerd } from './views/herd.js';
import { renderInsights } from './views/insights.js';
import { renderLogin } from './views/login.js';

const state = { user: null, animals: [], authReady: false, loading: true, failed: null };

const view = document.getElementById('view');
const signOutBtn = document.getElementById('sign-out');

const ROUTES = {
  herd: renderHerd,
  new: renderAnimalForm,
  edit: renderAnimalForm,
  animal: renderAnimal,
  insights: renderInsights,
};
// Views where the user is typing; a background data update must not redraw these.
const NO_LIVE_REDRAW = new Set(['new', 'edit', 'calculator']);

function route() {
  const [name, arg] = location.hash.slice(1).split('/');
  return { name: name || 'herd', arg: arg ? decodeURIComponent(arg) : undefined };
}

function message(html) {
  view.innerHTML = `<div class="card narrow">${html}</div>`;
}

function render() {
  const { name, arg } = route();
  const section = name === 'calculator' || name === 'insights' ? name : 'herd';
  document.querySelectorAll('#nav a').forEach((a) => {
    if (a.dataset.section === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  signOutBtn.hidden = !state.user;

  if (name === 'calculator') return renderCalculator(view, { arg });

  if (!isConfigured) {
    return message(`
      <h1>Finish setup</h1>
      <p>Firebase is not connected yet. Paste your project's web config into
      <code>js/firebase-config.js</code> (steps are in the README). Until then only the
      <a href="#calculator">price calculator</a> is available.</p>`);
  }
  if (state.failed) return message(`<h1>Could not load</h1><p>${state.failed}</p>`);
  if (!state.authReady) return message('<p class="muted">Loading…</p>');
  if (!state.user) return renderLogin(view);
  if (state.loading) return message('<p class="muted">Loading your herd…</p>');

  const draw = ROUTES[name];
  if (!draw) {
    location.replace('#herd');
    return;
  }
  draw(view, { state, arg });
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

signOutBtn.addEventListener('click', () => signOutUser().catch((err) => toast(err.message)));

async function start() {
  render();
  if (!isConfigured) return;

  let unsubscribe = null;
  let unwatchSettings = null;
  try {
    await watchAuth(async (user) => {
      unsubscribe?.();
      unsubscribe = null;
      unwatchSettings?.();
      unwatchSettings = null;
      state.user = user;
      state.animals = [];
      state.authReady = true;
      state.loading = Boolean(user);
      render();
      if (!user) return;

      unsubscribe = await subscribeAnimals(
        user.uid,
        (animals) => {
          const first = state.loading;
          // Records saved before breeds were card codes still hold full names.
          state.animals = animals.map((a) => ({ ...a, breed: toBreedCode(a.breed), damBreed: toBreedCode(a.damBreed) }));
          state.loading = false;
          if (first || !NO_LIVE_REDRAW.has(route().name)) render();
        },
        (err) => {
          state.failed = err.code === 'permission-denied'
            ? 'The database refused access. Check that <code>firestore.rules</code> has been published.'
            : `Database error: ${err.code ?? err.message}`;
          render();
        },
      );
      // The €/kg and gain rate behind the estimates, shared between the user's devices.
      unwatchSettings = await watchSettings(
        user.uid,
        () => {
          if (!state.loading && !NO_LIVE_REDRAW.has(route().name)) render();
        },
        (err) => toast(`Could not load saved estimates: ${err.code ?? err.message}`),
      );
    });
  } catch (err) {
    state.failed = 'Could not reach Firebase. Check your connection and reload.';
    render();
  }
}

start();
