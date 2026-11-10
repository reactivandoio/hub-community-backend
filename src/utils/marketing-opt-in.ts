/**
 * Marketing opt-in of a user (REA-29). The date is always ours: whenever `marketing_opt_in` is
 * written, `marketing_opt_in_at` becomes now (opt-in given) or null (taken back). Used by the
 * users-permissions user lifecycle in src/index.ts. Campaign e-mails go to everyone who has not
 * unsubscribed (legitimate interest); the opt-in is only recorded.
 */
export const stampOptIn = <T extends Record<string, unknown>>(data: T, now: Date = new Date()): T => {
  if (!data || typeof data.marketing_opt_in !== 'boolean') return data;
  return { ...data, marketing_opt_in_at: data.marketing_opt_in ? now : null };
};
