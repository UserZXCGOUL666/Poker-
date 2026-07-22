import { describe, expect, it } from 'vitest';
import { displayName, hasAdminAccess, miniAppUrl, normalizePhoneNumber, registrationLabel } from './botHelpers.js';

describe('bot helpers', () => {
  it('builds Mini App deep links without keeping stale query parameters', () => {
    expect(miniAppUrl('https://club.example/?old=1', '/admin', { section: 'seating' }))
      .toBe('https://club.example/admin?section=seating');
  });

  it('normalizes own Telegram contact numbers', () => {
    expect(normalizePhoneNumber('+7 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizePhoneNumber('0049 151 1234567')).toBe('+491511234567');
    expect(normalizePhoneNumber('123')).toBeNull();
  });

  it('uses username when available', () => {
    expect(displayName({ firstName: 'Анна', username: 'anna' })).toBe('@anna');
    expect(displayName({ firstName: 'Анна', lastName: 'Иванова' })).toBe('Анна Иванова');
  });

  it('describes late registration separately from a scheduled tournament', () => {
    const common = { registrationClosed: false, registrationDeadline: null, participantCount: 12, capacity: 24 };
    expect(registrationLabel({ ...common, status: 'ACTIVE' })).toContain('поздняя');
    expect(registrationLabel({ ...common, status: 'UPCOMING' })).toBe('регистрация открыта');
  });

  it('does not grant admin access to a forged Telegram ID', () => {
    const adminIds = new Set(['111', '222']);
    expect(hasAdminAccess(111, adminIds)).toBe(true);
    expect(hasAdminAccess(333, adminIds)).toBe(false);
  });
});
