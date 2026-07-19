import { TournamentRegistrationStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { canPlayerCancelRegistration, isOccupiedRegistration, nextRegistrationStatus } from './registrations.js';

describe('tournament registration rules', () => {
  it('uses the main list until capacity is reached', () => {
    expect(nextRegistrationStatus(47, 48)).toBe(TournamentRegistrationStatus.REGISTERED);
    expect(nextRegistrationStatus(48, 48)).toBe(TournamentRegistrationStatus.WAITLISTED);
  });

  it('counts checked-in and played users as occupied seats', () => {
    expect(isOccupiedRegistration(TournamentRegistrationStatus.REGISTERED)).toBe(true);
    expect(isOccupiedRegistration(TournamentRegistrationStatus.CHECKED_IN)).toBe(true);
    expect(isOccupiedRegistration(TournamentRegistrationStatus.PLAYED)).toBe(true);
    expect(isOccupiedRegistration(TournamentRegistrationStatus.WAITLISTED)).toBe(false);
    expect(isOccupiedRegistration(TournamentRegistrationStatus.CANCELLED)).toBe(false);
  });

  it('allows a player to cancel only an upcoming, unplayed registration', () => {
    expect(canPlayerCancelRegistration('UPCOMING', TournamentRegistrationStatus.REGISTERED)).toBe(true);
    expect(canPlayerCancelRegistration('UPCOMING', TournamentRegistrationStatus.WAITLISTED)).toBe(true);
    expect(canPlayerCancelRegistration('ACTIVE', TournamentRegistrationStatus.REGISTERED)).toBe(false);
    expect(canPlayerCancelRegistration('UPCOMING', TournamentRegistrationStatus.CHECKED_IN)).toBe(false);
    expect(canPlayerCancelRegistration('FINISHED', TournamentRegistrationStatus.PLAYED)).toBe(false);
  });
});
