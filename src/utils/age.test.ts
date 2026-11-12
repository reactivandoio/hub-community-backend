import { describe, expect, it } from 'vitest';

import { ageOn, dateOfBirthRefusal, isMinor, todayYmd } from './age';

// 2026-11-12 02:00 UTC is still 2026-11-11 in São Paulo (UTC-3).
const lateNightUtc = new Date('2026-11-12T02:00:00.000Z');
const noon = new Date('2026-11-12T15:00:00.000Z');

describe('todayYmd', () => {
  it('uses the calendar date in São Paulo', () => {
    expect(todayYmd(lateNightUtc)).toEqual({ y: 2026, m: 11, d: 11 });
    expect(todayYmd(noon)).toEqual({ y: 2026, m: 11, d: 12 });
  });
});

describe('ageOn', () => {
  it('counts whole years, turning a year older on the birthday', () => {
    expect(ageOn('2008-11-12', noon)).toBe(18);
    expect(ageOn('2008-11-13', noon)).toBe(17);
    expect(ageOn('2008-11-12', lateNightUtc)).toBe(17);
  });

  it('accepts a Date and an ISO date-time', () => {
    expect(ageOn(new Date('1990-05-20T00:00:00.000Z'), noon)).toBe(36);
    expect(ageOn('1990-05-20T00:00:00.000Z', noon)).toBe(36);
  });

  it('returns null for invalid dates', () => {
    expect(ageOn('2001-02-30', noon)).toBeNull();
    expect(ageOn('20/05/1990', noon)).toBeNull();
    expect(ageOn(null, noon)).toBeNull();
    expect(ageOn('', noon)).toBeNull();
  });
});

describe('dateOfBirthRefusal', () => {
  it('accepts 18 or more', () => {
    expect(dateOfBirthRefusal('2008-11-12', noon)).toBeNull();
    expect(dateOfBirthRefusal('1950-01-01', noon)).toBeNull();
  });

  it('refuses under 18', () => {
    expect(dateOfBirthRefusal('2008-11-13', noon)).toBe('É preciso ter 18 anos ou mais.');
  });

  it('refuses dates that are invalid, in the future or absurdly old', () => {
    expect(dateOfBirthRefusal('abc', noon)).toBe('Informe uma data de nascimento válida.');
    expect(dateOfBirthRefusal('2030-01-01', noon)).toBe('Informe uma data de nascimento válida.');
    expect(dateOfBirthRefusal('1800-01-01', noon)).toBe('Informe uma data de nascimento válida.');
  });
});

describe('isMinor', () => {
  it('is true only for a valid date under 18', () => {
    expect(isMinor('2010-01-01', noon)).toBe(true);
    expect(isMinor('1990-01-01', noon)).toBe(false);
    expect(isMinor(null, noon)).toBe(false);
  });
});
