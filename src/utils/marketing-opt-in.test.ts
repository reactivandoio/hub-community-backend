import { describe, expect, it } from 'vitest';

import { stampOptIn } from './marketing-opt-in';

const now = new Date('2026-11-10T12:00:00.000Z');

describe('stampOptIn', () => {
  it('stamps the date when the opt-in is given', () => {
    expect(stampOptIn({ marketing_opt_in: true }, now)).toEqual({
      marketing_opt_in: true,
      marketing_opt_in_at: now,
    });
  });

  it('clears the date when the opt-in is taken back', () => {
    expect(stampOptIn({ marketing_opt_in: false, marketing_opt_in_at: now }, now)).toEqual({
      marketing_opt_in: false,
      marketing_opt_in_at: null,
    });
  });

  it('leaves the data alone when the opt-in is not being changed', () => {
    const data = { name: 'Ana' };
    expect(stampOptIn(data, now)).toBe(data);
  });

  it('ignores a date sent by the caller and uses its own clock', () => {
    const sent = new Date('2020-01-01T00:00:00.000Z');
    expect(stampOptIn({ marketing_opt_in: true, marketing_opt_in_at: sent }, now).marketing_opt_in_at).toBe(now);
  });
});
