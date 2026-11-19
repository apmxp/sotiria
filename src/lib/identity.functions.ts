import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { childIdentity, childInput, nickname, pin } from './identity';
import { CHILD_COOKIE, MODE_COOKIE, PICKER_COOKIE, clearCookie, privateResponse, randomToken, requireChild, requireParentMode, revokeChild, tokenHash, writeCookie } from './identity.server';

const familyIdInput = z.object({ familyId: z.string().uuid() });
export const parentAccess = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async () => { requireParentMode(); return { ok: true }; });
export const loadFamily = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  requireParentMode();
  const [profile, memberships] = await Promise.all([context.supabase.from('profiles').select('display_name,preferences').eq('id', context.userId).single(), context.supabase.from('family_members').select('family_id').eq('user_id', context.userId)]);
  if (profile.error || memberships.error) throw new Error('Your family could not be loaded. Please try again.');
  const id = memberships.data[0]?.family_id;
  if (!id) return { profile: profile.data, family: null, children: [] };
  const [family, children] = await Promise.all([context.supabase.from('families').select('id,name').eq('id', id).single(), context.supabase.rpc('get_family_children', { p_family_id: id })]);
  if (family.error || children.error) throw new Error('Your family could not be loaded.');
  return { profile: profile.data, family: family.data, children: children.data };
});
export const setupFamily = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ name: z.string().trim().min(1).max(80) })).handler(async ({ data, context }) => {
  requireParentMode(); const result = await context.supabase.rpc('setup_family', { p_name: data.name });
  if (result.error) throw new Error('Your family could not be created. Please try again.'); return { id: result.data };
});
export const saveParentProfile = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ name: nickname })).handler(async ({ data, context }) => {
  requireParentMode(); const { error } = await context.supabase.from('profiles').update({ display_name: data.name }).eq('id', context.userId); if (error) throw new Error('Your name could not be saved.'); return { ok: true };
});
export const saveChildProfile = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(childInput).handler(async ({ data, context }) => {
  requireParentMode();
  if (!data.id && !data.pin) throw new Error('Choose a six-digit PIN.');
  const { data: id, error } = await context.supabase.rpc('manage_child_authorized', {
    p_family: data.familyId,
    p_child: data.id ?? '00000000-0000-0000-0000-000000000000',
    p_name: data.displayName,
    p_avatar: data.avatar,
    p_pin: data.pin ?? '',
    p_active: data.active,
  });
  if (error) throw new Error('This child profile could not be saved.'); return { id };
});
const createDevicePairingInput = z.object({
  childId: z.string().uuid(),
  idempotencyKeyHash: z.string().regex(/^[0-9a-f]{64}$/),
  pairingHash: z.string().regex(/^[0-9a-f]{64}$/),
  pairingKeyId: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  requestFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  timezone: z.string().min(1).max(100),
}).strict();
export const createChildDevicePairing = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(createDevicePairingInput)
  .handler(async ({ data, context }) => {
    requireParentMode();
    const { data: result, error } = await context.supabase.rpc('create_child_device_pairing', {
      p_child_id: data.childId,
      p_timezone: data.timezone,
      p_idempotency_key_hash: data.idempotencyKeyHash,
      p_request_fingerprint: data.requestFingerprint,
      p_pairing_hash: data.pairingHash,
      p_pairing_key_id: data.pairingKeyId,
    });
    const parsed = z.object({
      status: z.enum(['ok', 'pairing_open', 'pairing_expired', 'child_inactive', 'pairing_unavailable', 'idempotency_conflict']),
      pairing_id: z.string().uuid().optional(),
      expires_at: z.string().optional(),
      reporting_timezone: z.string().optional(),
      retry: z.boolean().optional(),
    }).safeParse(result);
    if (error || !parsed.success) throw new Error('Phone pairing could not be started.');
    if (parsed.data.status === 'pairing_open' && parsed.data.expires_at) {
      return { status: 'pairing_open' as const, expiresAt: parsed.data.expires_at };
    }
    if (parsed.data.status === 'pairing_expired') {
      return { status: 'pairing_expired' as const };
    }
    if (parsed.data.status !== 'ok' || !parsed.data.pairing_id || !parsed.data.expires_at || !parsed.data.reporting_timezone) {
      throw new Error('Phone pairing could not be started. Check that the child profile is active and try again later.');
    }
    return {
      status: 'ok' as const,
      pairingId: parsed.data.pairing_id,
      expiresAt: parsed.data.expires_at,
      reportingTimezone: parsed.data.reporting_timezone,
    };
  });
const devicePairingStatusInput = z.object({
  childId: z.string().uuid(),
  pairingId: z.string().uuid(),
}).strict();
export const getChildDevicePairingStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(devicePairingStatusInput)
  .handler(async ({ data, context }) => {
    requireParentMode();
    const { data: result, error } = await context.supabase.rpc('get_child_device_pairing_status', {
      p_child_id: data.childId,
      p_pairing_id: data.pairingId,
    });
    const parsed = z.object({
      status: z.enum(['pending', 'redeemed', 'activated', 'cancelled', 'expired']),
      expires_at: z.string(),
      device_name: z.string().nullable(),
      activated_at: z.string().nullable(),
    }).strict().safeParse(result);
    if (error || !parsed.success) throw new Error('Pairing status could not be loaded.');
    return parsed.data;
  });
export const openChildPicker = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(familyIdInput).handler(async ({ data, context }) => {
  requireParentMode(); const membership = await context.supabase.rpc('is_family_parent', { p_family: data.familyId });
  if (membership.error || !membership.data) throw new Error('This family is not available.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const old = getCookie(PICKER_COOKIE);
  if (old) { const revoked = await supabaseAdmin.from('family_picker_sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', await tokenHash(old)); if (revoked.error) throw new Error('Please try again.'); }
  const token = randomToken(); const { error } = await supabaseAdmin.from('family_picker_sessions').insert({ family_id: data.familyId, token_hash: await tokenHash(token) });
  if (error) throw new Error('The child space could not be opened.');
  await revokeChild(); writeCookie(PICKER_COOKIE, token, 28800); writeCookie(MODE_COOKIE, 'locked', 31536000); return { ok: true };
});
export const listPickerChildren = createServerFn({ method: 'POST' }).handler(async () => {
  privateResponse(); const token = getCookie(PICKER_COOKIE); if (!token) return [];
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const picker = await supabaseAdmin.from('family_picker_sessions').select('family_id').eq('token_hash', await tokenHash(token)).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (picker.error || !picker.data) return [];
  const result = await supabaseAdmin.from('child_profiles').select('id,display_name,avatar').eq('family_id', picker.data.family_id).eq('is_active', true).order('created_at');
  if (result.error) throw new Error('Your profiles could not be loaded.'); return result.data;
});
export const verifyChildPin = createServerFn({ method: 'POST' }).inputValidator(z.object({ childId: z.string().uuid(), pin })).handler(async ({ data }) => {
  privateResponse(); const picker = getCookie(PICKER_COOKIE); if (!picker) return { ok: false, reason: 'invalid' };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const token = randomToken();
  const result = await supabaseAdmin.rpc('verify_child_pin', { p_picker_hash: await tokenHash(picker), p_child: data.childId, p_pin: data.pin, p_token_hash: await tokenHash(token) });
  const parsed = z.object({ ok: z.boolean(), reason: z.string().optional(), child: childIdentity.optional() }).safeParse(result.data);
  if (result.error || !parsed.success) throw new Error('Your space could not be opened. Please try again.');
  if (!parsed.data.ok) return { ok: false, reason: parsed.data.reason };
  await revokeChild(); writeCookie(CHILD_COOKIE, token); writeCookie(MODE_COOKIE, 'locked', 31536000);
  return { ok: true, child: parsed.data.child };
});
export const validateChildSession = createServerFn({ method: 'POST' }).handler(async () => requireChild());
export const childLogout = createServerFn({ method: 'POST' }).handler(async () => { privateResponse(); await revokeChild(); return { ok: true }; });
export const unlockParent = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ password: z.string().min(1).max(128) })).handler(async ({ data, context }) => {
  privateResponse(); const user = await context.supabase.auth.getUser();
  const email = user.data.user?.email; if (!email) throw new Error('Please sign in again.');
  const verified = await context.supabase.auth.signInWithPassword({ email, password: data.password });
  if (verified.error || verified.data.user?.id !== context.userId) throw new Error('Please check your password and try again.');
  await revokeChild(); const picker = getCookie(PICKER_COOKIE);
  if (picker) { const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const result = await supabaseAdmin.from('family_picker_sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', await tokenHash(picker)); if (result.error) throw new Error('Please try again.'); }
  clearCookie(PICKER_COOKIE); clearCookie(MODE_COOKIE); return { ok: true };
});