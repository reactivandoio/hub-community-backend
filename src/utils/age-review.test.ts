import { describe, expect, it, vi } from 'vitest';

import {
  applyDateOfBirthRules,
  DateOfBirthError,
  dobRequestCutoff,
  dobRequestDeadline,
  markDueAgeReviews,
  stampAdultDeclaration,
} from './age-review';

const now = new Date('2026-11-12T15:00:00.000Z');

describe('stampAdultDeclaration', () => {
  it('stamps the date when the declaration is given and clears it when taken back', () => {
    expect(stampAdultDeclaration({ adult_declaration: true }, now)).toEqual({
      adult_declaration: true,
      adult_declaration_at: now,
    });
    expect(stampAdultDeclaration({ adult_declaration: false }, now)).toEqual({
      adult_declaration: false,
      adult_declaration_at: null,
    });
  });

  it('leaves other writes alone and ignores a date sent by the caller', () => {
    const data = { name: 'Ana' };
    expect(stampAdultDeclaration(data, now)).toBe(data);
    const sent = new Date('2020-01-01T00:00:00.000Z');
    expect(stampAdultDeclaration({ adult_declaration: true, adult_declaration_at: sent }, now).adult_declaration_at).toBe(now);
  });
});

describe('applyDateOfBirthRules', () => {
  it('accepts an adult date on create', () => {
    const data = { date_of_birth: '1990-01-01' };
    expect(applyDateOfBirthRules(data, null, now)).toBe(data);
  });

  it('refuses a minor or invalid date', () => {
    expect(() => applyDateOfBirthRules({ date_of_birth: '2010-01-01' }, null, now)).toThrow(DateOfBirthError);
    expect(() => applyDateOfBirthRules({ date_of_birth: '2010-01-01' }, null, now)).toThrow('É preciso ter 18 anos ou mais.');
    expect(() => applyDateOfBirthRules({ date_of_birth: '2099-01-01' }, { date_of_birth: null }, now)).toThrow(DateOfBirthError);
  });

  it('does not check a date that is not changing (old records stay editable)', () => {
    const data = { date_of_birth: '2010-01-01', blocked: true };
    expect(applyDateOfBirthRules(data, { date_of_birth: '2010-01-01' }, now)).toBe(data);
  });

  it('ignores writes without a date', () => {
    const data = { name: 'Ana', date_of_birth: null };
    expect(applyDateOfBirthRules(data, { date_of_birth: null }, now)).toBe(data);
  });

  it('ends a pending date-of-birth request when the date arrives', () => {
    expect(
      applyDateOfBirthRules({ date_of_birth: '1990-01-01' }, { date_of_birth: null, age_review_status: 'dob_requested' }, now),
    ).toEqual({ date_of_birth: '1990-01-01', age_review_status: null, age_review_requested_at: null });
  });

  it('takes an account pending update back to normal when the date arrives (REA-60)', () => {
    expect(
      applyDateOfBirthRules({ date_of_birth: '1990-01-01' }, { date_of_birth: null, age_review_status: 'dob_update_required' }, now),
    ).toEqual({ date_of_birth: '1990-01-01', age_review_status: null, age_review_requested_at: null });
  });

  it('keeps other review statuses', () => {
    const data = { date_of_birth: '1990-01-01' };
    expect(applyDateOfBirthRules(data, { date_of_birth: null, age_review_status: 'dob_blocked' }, now)).toBe(data);
    expect(applyDateOfBirthRules(data, { date_of_birth: null, age_review_status: 'minor_blocked' }, now)).toBe(data);
  });
});

describe('dob request deadline', () => {
  it('is 7 days after the e-mail', () => {
    expect(dobRequestCutoff(now).toISOString()).toBe('2026-11-05T15:00:00.000Z');
    expect(dobRequestDeadline('2026-11-05T15:00:00.000Z').toISOString()).toBe('2026-11-12T15:00:00.000Z');
  });
});

describe('markDueAgeReviews', () => {
  const makeDb = (due: { id: number }[], legacy: { id: number }[] = []) => ({
    findDue: vi.fn().mockResolvedValue(due),
    findLegacyBlocked: vi.fn().mockResolvedValue(legacy),
    update: vi.fn().mockResolvedValue(undefined),
  });

  it('marks every overdue request as pending update, without blocking', async () => {
    const db = makeDb([{ id: 1 }, { id: 2 }]);
    expect(await markDueAgeReviews(db, now)).toEqual({ pending: 2, unblocked: 0 });
    expect(db.findDue).toHaveBeenCalledWith(new Date('2026-11-05T15:00:00.000Z'));
    expect(db.update).toHaveBeenCalledWith(1, { age_review_status: 'dob_update_required' });
    for (const [, data] of db.update.mock.calls) expect(data).not.toHaveProperty('blocked', true);
  });

  it('unblocks the accounts blocked by the old rule into pending update', async () => {
    const db = makeDb([], [{ id: 7 }]);
    expect(await markDueAgeReviews(db, now)).toEqual({ pending: 0, unblocked: 1 });
    expect(db.update).toHaveBeenCalledWith(7, { blocked: false, age_review_status: 'dob_update_required', age_review_blocked_at: null });
  });

  it('does nothing when nobody is overdue', async () => {
    const db = makeDb([]);
    expect(await markDueAgeReviews(db, now)).toEqual({ pending: 0, unblocked: 0 });
    expect(db.update).not.toHaveBeenCalled();
  });
});
