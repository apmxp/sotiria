import { deleteCookie, getCookie, getRequest, setCookie, setResponseHeader } from '@tanstack/react-start/server';
import { childIdentity, SESSION_SECONDS } from './identity';

export const CHILD_COOKIE = 'sotiria-child';
export const PICKER_COOKIE = 'sotiria-picker';
export const MODE_COOKIE = 'sotiria-child-mode';
export function privateResponse() { setResponseHeader('Cache-Control', 'no-store'); }
export function writeCookie(name: string, token: string, maxAge = SESSION_SECONDS) {
  setCookie(name, token, { httpOnly: true, secure: new URL(getRequest().url).protocol === 'https:', sameSite: 'strict', path: '/', maxAge });
}
export function clearCookie(name: string) { deleteCookie(name, { path: '/' }); }
export function requireParentMode() { privateResponse(); if (getCookie(MODE_COOKIE)) throw new Error('Please sign in again to open the parent space.'); }
export function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
export async function tokenHash(token: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join(''); }
export async function requireChild() {
  privateResponse();
  const token = getCookie(CHILD_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Your space has closed. Please choose your profile and enter your PIN again.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.rpc('validate_child_session', { p_token_hash: await tokenHash(token) });
  const parsed = childIdentity.safeParse(data);
  if (error || !parsed.success) { clearCookie(CHILD_COOKIE); throw new Error('Your space has closed. Please enter your PIN again.'); }
  return parsed.data;
}
export async function revokeChild() {
  const token = getCookie(CHILD_COOKIE);
  if (token) {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('child_sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', await tokenHash(token)).is('revoked_at', null);
    if (error) throw new Error('Could not close your space. Please try again.');
  }
  clearCookie(CHILD_COOKIE);
}