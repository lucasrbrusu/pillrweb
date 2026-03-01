
import { getSupabase } from './session.js';

const form = document.getElementById('loginForm');
const notice = document.getElementById('notice');
const submitBtn = document.getElementById('submitBtn');

function showNotice(message, type = 'error') {
  notice.textContent = message;
  notice.className = `notice show ${type}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in…';
  notice.className = 'notice';

  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '').trim();

  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    window.location.href = 'dashboard.html';
  } catch (error) {
    showNotice(error.message || 'Sign in failed.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
  }
});
