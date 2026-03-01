
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { SUPABASE_URL, SUPABASE_ANON_KEY, FUNCTION_BASE_URL } from './config.js';

let client;

export function getSupabase() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export async function getSession() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function requireSession(redirectTo = 'login.html') {
  const session = await getSession();
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}

export async function signOut() {
  await getSupabase().auth.signOut();
  window.location.href = 'login.html';
}

export async function invokeFunction(name, body = {}, { method = 'POST' } = {}) {
  const session = await getSession();
  if (!session?.access_token) {
    window.location.href = 'login.html';
    throw new Error('Your admin session has expired.');
  }

  const response = await fetch(`${FUNCTION_BASE_URL}/${name}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
