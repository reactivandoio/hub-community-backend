import { describe, expect, it, vi } from 'vitest';

import {
  applyDateOfBirthRules,
  blockDueAgeReviews,
  DateOfBirthError,
  dobRequestCutoff,
  dobRequestDeadline,
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

  it('keeps other review statuses', () => {
    const data = { date_of_birth: '1990-01-01' };
    expect(applyDateOfBirthRules(data, { date_of_birth: null, age_review_status: 'dob_blocked' }, now)).toBe(data);
  });
});

describe('dob request deadline', () => {
  it('is 7 days after the e-mail', () => {
    expect(dobRequestCutoff(now).toISOString()).toBe('2026-11-05T15:00:00.000Z');
    expect(dobRequestDeadline('2026-11-05T15:00:00.000Z').toISOString()).toBe('2026-11-12T15:00:00.000Z');
  });
});

describe('blockDueAgeReviews', () => {
  it('blocks every overdue request with the cutoff of 7 days ago', async () => {
    const db = {
      findDue: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
      block: vi.fn().mockResolvedValue(undefined),
    };
    expect(await blockDueAgeReviews(db, now)).toBe(2);
    expect(db.findDue).toHaveBeenCalledWith(new Date('2026-11-05T15:00:00.000Z'));
    expect(db.block).toHaveBeenCalledWith(1, { blocked: true, age_review_status: 'dob_blocked', age_review_blocked_at: now });
  });

  it('does nothing when nobody is overdue', async () => {
    const db = { findDue: vi.fn().mockResolvedValue([]), block: vi.fn() };
    expect(await blockDueAgeReviews(db, now)).toBe(0);
    expect(db.block).not.toHaveBeenCalled();
  });
});
