import { authErrorMessage, register, resetPassword, signIn } from '../auth.js';
import { esc, showError } from '../util.js';

let mode = 'signin';

export function renderLogin(el) {
  const creating = mode === 'register';
  el.innerHTML = `
    <section class="card narrow login">
      <h1>${creating ? 'Create account' : 'Sign in'}</h1>
      <form novalidate>
        <label>Email
          <input name="email" type="email" autocomplete="email" required>
        </label>
        <label>Password
          <input name="password" type="password" autocomplete="${creating ? 'new-password' : 'current-password'}" required minlength="6">
        </label>
        <p class="form-error" role="alert" hidden></p>
        <p class="form-note" role="status" hidden></p>
        <button class="btn primary block" type="submit">${creating ? 'Create account' : 'Sign in'}</button>
      </form>
      <div class="login-links">
        <button type="button" class="link" id="toggle-mode">${creating ? 'I already have an account' : 'Create an account'}</button>
        ${creating ? '' : '<button type="button" class="link" id="reset">Forgot password</button>'}
      </div>
      <p class="hint">Just need a quick sum? The <a href="#calculator">price calculator</a> works without signing in.</p>
    </section>`;

  const form = el.querySelector('form');
  const note = el.querySelector('.form-note');
  const fields = () => Object.fromEntries(new FormData(form));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { email, password } = fields();
    if (!email.trim() || !password) return showError(form, 'Enter your email and password.');
    showError(form, null);
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      await (creating ? register : signIn)(email.trim(), password);
      // The auth listener in app.js takes over from here.
    } catch (err) {
      showError(form, authErrorMessage(err));
      button.disabled = false;
    }
  });

  el.querySelector('#toggle-mode').addEventListener('click', () => {
    mode = creating ? 'signin' : 'register';
    renderLogin(el);
  });

  el.querySelector('#reset')?.addEventListener('click', async () => {
    const email = fields().email.trim();
    if (!email) return showError(form, 'Enter your email above first, then press Forgot password.');
    showError(form, null);
    try {
      await resetPassword(email);
      note.innerHTML = `If an account exists for ${esc(email)}, a reset link is on its way.`;
      note.hidden = false;
    } catch (err) {
      showError(form, authErrorMessage(err));
    }
  });
}
