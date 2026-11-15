import { z } from 'zod';

export const nickname = z.string().trim().min(1).max(30);
export const pin = z.string().regex(/^\d{6}$/, 'Use a six-digit PIN.');
export const childIdentity = z.object({ id: z.string().uuid(), family_id: z.string().uuid(), display_name: nickname, avatar: z.string().min(1).max(16) });
export type ChildIdentity = z.infer<typeof childIdentity>;
export const childInput = z.object({ id: z.string().uuid().optional(), familyId: z.string().uuid(), displayName: nickname, avatar: z.string().min(1).max(16), pin: pin.optional(), active: z.boolean() });
export const SESSION_SECONDS = 7200;
export const IDLE_SECONDS = 1200;
export const LOCKOUT_SECONDS = 900;
export const MAX_PIN_FAILURES = 5;

export function sessionAllowed(session: { expiresAt: number; lastActivityAt: number; revoked: boolean; active: boolean }, now: number) {
  return session.active && !session.revoked && session.expiresAt > now && session.lastActivityAt > now - IDLE_SECONDS;
}