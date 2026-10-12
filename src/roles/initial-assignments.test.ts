import { describe, expect, it } from 'vitest';

import { maskEmail, parseEmails, planInitialAssignments } from './initial-assignments';

const users = (list: [string, number, string][]) =>
  new Map(list.map(([email, id, roleType]) => [email, { id, email, roleType }]));

describe('parseEmails / maskEmail', () => {
  it('normalizes and deduplicates', () => {
    expect(parseEmails(' Ana@X.io, ana@x.io ,, bia@x.io')).toEqual(['ana@x.io', 'bia@x.io']);
    expect(parseEmails(undefined)).toEqual([]);
  });

  it('masks the local part', () => {
    expect(maskEmail('pedro@hotmail.com')).toBe('p***@hotmail.com');
  });
});

describe('planInitialAssignments', () => {
  const base = { adminEmails: [], appliedAdminEmails: [], usersByEmail: new Map(), organizers: [], organizersDone: true };

  it('promotes the initial admins once, whatever role they had', () => {
    const plan = planInitialAssignments({
      ...base,
      adminEmails: ['ana@x.io', 'bia@x.io'],
      usersByEmail: users([['ana@x.io', 1, 'authenticated'], ['bia@x.io', 2, 'community-manager']]),
    });
    expect(plan.assignments.map((a) => [a.userId, a.from, a.to])).toEqual([
      [1, 'authenticated', 'admin'],
      [2, 'community-manager', 'admin'],
    ]);
    expect(plan.appliedNow).toEqual(['ana@x.io', 'bia@x.io']);
  });

  it('never touches an e-mail already applied (a later demotion stands)', () => {
    const plan = planInitialAssignments({
      ...base,
      adminEmails: ['ana@x.io'],
      appliedAdminEmails: ['ana@x.io'],
      usersByEmail: users([['ana@x.io', 1, 'authenticated']]),
    });
    expect(plan.assignments).toEqual([]);
  });

  it('reports an e-mail without user and keeps it for a later start', () => {
    const plan = planInitialAssignments({ ...base, adminEmails: ['nobody@x.io'] });
    expect(plan.missingEmails).toEqual(['nobody@x.io']);
    expect(plan.appliedNow).toEqual([]);
  });

  it('marks an admin already in place as applied without changing it', () => {
    const plan = planInitialAssignments({ ...base, adminEmails: ['ana@x.io'], usersByEmail: users([['ana@x.io', 1, 'admin']]) });
    expect(plan.assignments).toEqual([]);
    expect(plan.appliedNow).toEqual(['ana@x.io']);
  });

  it('promotes organizers with the default role once, and nobody else', () => {
    const plan = planInitialAssignments({
      ...base,
      organizersDone: false,
      organizers: [
        { id: 3, email: 'c@x.io', roleType: 'authenticated' },
        { id: 3, email: 'c@x.io', roleType: 'authenticated' },
        { id: 4, email: 'd@x.io', roleType: 'admin' },
        { id: 5, email: 'e@x.io', roleType: 'community-manager' },
        { id: 6, email: 'f@x.io', roleType: 'custom' },
      ],
    });
    expect(plan.assignments.map((a) => [a.userId, a.to])).toEqual([[3, 'community-manager']]);
    expect(planInitialAssignments({ ...base, organizers: [{ id: 3, roleType: 'authenticated' }] }).assignments).toEqual([]);
  });

  it('does not demote an initial admin who is also an organizer', () => {
    const plan = planInitialAssignments({
      ...base,
      adminEmails: ['ana@x.io'],
      usersByEmail: users([['ana@x.io', 1, 'authenticated']]),
      organizersDone: false,
      organizers: [{ id: 1, email: 'ana@x.io', roleType: 'authenticated' }],
    });
    expect(plan.assignments.map((a) => [a.userId, a.to])).toEqual([[1, 'admin']]);
  });
});
