import { createClient } from '@supabase/supabase-js';

const API = import.meta.env.VITE_API_URL || '/api';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

async function request(path, options = {}) {
  const headers = { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  const { data: { session } = {} } = supabase ? await supabase.auth.getSession() : {};
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data.error;
    const exception = new Error(typeof error === 'string' ? error : error?.message || `Request failed (${response.status})`);
    exception.code = error?.code;
    exception.fields = error?.fields;
    exception.status = response.status;
    throw exception;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
