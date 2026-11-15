import { describe, expect, it } from 'vitest';
import { childInput, IDLE_SECONDS, LOCKOUT_SECONDS, MAX_PIN_FAILURES, pin, SESSION_SECONDS, sessionAllowed } from '@/lib/identity';
import { identityKey } from '@/components/demo-provider';

const now = 1_000_000;
const fresh = { expiresAt: now + 60, lastActivityAt: now - 60, revoked: false, active: true };

describe('child PIN rules', () => {
  it('accepts exactly six digits', () => { expect(pin.safeParse('123456').success).toBe(true); });
  it('rejects five digits, seven digits and letters', () => {
    expect(pin.safeParse('12345').success).toBe(false);
    expect(pin.safeParse('1234567').success).toBe(false);
    expect(pin.safeParse('12a456').success).toBe(false);
  });
  it('locks after five failures for fifteen minutes', () => { expect(MAX_PIN_FAILURES).toBe(5); expect(LOCKOUT_SECONDS).toBe(15 * 60); });
  it('rejects a nickname longer than 30 characters', () => {
    expect(childInput.safeParse({ familyId: crypto.randomUUID(), displayName: 'x'.repeat(31), avatar: '🌱', active: true }).success).toBe(false);
  });
});

describe('child session lifetime', () => {
  it('lasts two hours with a twenty-minute idle limit', () => { expect(SESSION_SECONDS).toBe(2 * 60 * 60); expect(IDLE_SECONDS).toBe(20 * 60); });
  it('allows an active, recent, unexpired session', () => { expect(sessionAllowed(fresh, now)).toBe(true); });
  it('rejects an expired session', () => { expect(sessionAllowed({ ...fresh, expiresAt: now }, now)).toBe(false); });
  it('rejects a session idle for twenty minutes', () => { expect(sessionAllowed({ ...fresh, lastActivityAt: now - IDLE_SECONDS }, now)).toBe(false); });
  it('rejects a revoked session', () => { expect(sessionAllowed({ ...fresh, revoked: true }, now)).toBe(false); });
  it('rejects an inactive profile', () => { expect(sessionAllowed({ ...fresh, active: false }, now)).toBe(false); });
});

describe('sample data isolation', () => {
  it('gives each child its own identity scope', () => { expect(identityKey('child:a')).not.toBe(identityKey('child:b')); });
  it('keeps a parent on one identity while switching the selected child', () => { expect(identityKey('parent:u1:c1')).toBe(identityKey('parent:u1:c2')); });
  it('separates two different parents', () => { expect(identityKey('parent:u1:c1')).not.toBe(identityKey('parent:u2:c1')); });
});
