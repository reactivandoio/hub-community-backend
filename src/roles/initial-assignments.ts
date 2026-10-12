/**
 * First role assignments (REA-10), so nobody has to open the Strapi admin:
 * - INITIAL_ADMIN_EMAILS (comma separated): those users become `admin`.
 * - Users listed in `organizers` of a community, still with the default `authenticated` role,
 *   become `community-manager` (they managed those communities before roles existed).
 *
 * Each runs once: an e-mail is applied once (and only when its user exists), and the organizers
 * step once ever — both remembered in the plugin store — so a role later changed in the Hub admin
 * is never undone by a restart. It only promotes: nobody loses a role. Every change goes to the
 * role-change history with actor "migration". Logs show user ids and masked e-mails only.
 */

export const ROLES_STORE = { type: 'plugin', name: 'hub-roles' } as const;
export const STORE_KEYS = {
  adminEmailsApplied: 'initial-admin-emails-applied',
  organizersPromoted: 'organizers-promoted-v1',
} as const;

export type UserWithRole = { id: number; email?: string | null; roleType?: string | null };

export type Assignment = {
  userId: number;
  email: string | null;
  from: string | null;
  to: 'admin' | 'community-manager';
  reason: 'initial-admin' | 'organizer';
};

export const parseEmails = (value?: string | null) => [
  ...new Set(
    (value || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
];

/** a***@example.com — enough to recognize it in a log, without printing the address. */
export const maskEmail = (email?: string | null) => {
  if (!email) return '(sem e-mail)';
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
};

export const planInitialAssignments = ({
  adminEmails,
  appliedAdminEmails,
  usersByEmail,
  organizers,
  organizersDone,
}: {
  adminEmails: string[];
  appliedAdminEmails: string[];
  usersByEmail: Map<string, UserWithRole>;
  organizers: UserWithRole[];
  organizersDone: boolean;
}) => {
  const assignments: Assignment[] = [];
  const missingEmails: string[] = [];
  const appliedNow: string[] = [];
  const applied = new Set(appliedAdminEmails);
  const promoted = new Set<number>();

  for (const email of adminEmails) {
    if (applied.has(email)) continue;
    const user = usersByEmail.get(email);
    if (!user) {
      missingEmails.push(email);
      continue;
    }
    appliedNow.push(email);
    if (user.roleType === 'admin') continue;
    assignments.push({ userId: user.id, email: user.email ?? email, from: user.roleType ?? null, to: 'admin', reason: 'initial-admin' });
    promoted.add(user.id);
  }

  if (!organizersDone) {
    const seen = new Set<number>();
    for (const user of organizers) {
      if (seen.has(user.id) || promoted.has(user.id)) continue;
      seen.add(user.id);
      // Only the default role moves; admins and any other role stay as they are.
      if (user.roleType !== 'authenticated') continue;
      assignments.push({ userId: user.id, email: user.email ?? null, from: 'authenticated', to: 'community-manager', reason: 'organizer' });
    }
  }

  return { assignments, missingEmails, appliedNow };
};

const USER_UID = 'plugin::users-permissions.user';
const ROLE_UID = 'plugin::users-permissions.role';

export const applyInitialAssignments = async (
  strapi: any,
  { dryRun = false, adminEmailsValue = process.env.INITIAL_ADMIN_EMAILS } = {},
) => {
  const prefix = dryRun ? '[roles:dry-run] ' : '[roles] ';
  const store = strapi.store(ROLES_STORE);
  const appliedAdminEmails: string[] = (await store.get({ key: STORE_KEYS.adminEmailsApplied })) || [];
  const organizersDone = Boolean(await store.get({ key: STORE_KEYS.organizersPromoted }));
  const adminEmails = parseEmails(adminEmailsValue);

  const usersByEmail = new Map<string, UserWithRole>();
  for (const email of adminEmails.filter((e) => !appliedAdminEmails.includes(e))) {
    const user = await strapi.db
      .query(USER_UID)
      .findOne({ where: { email: { $eqi: email } }, select: ['id', 'email'], populate: { role: { select: ['type'] } } });
    if (user) usersByEmail.set(email, { id: user.id, email: user.email, roleType: user.role?.type ?? null });
  }

  let organizers: UserWithRole[] = [];
  if (!organizersDone) {
    const communities = await strapi.db.query('api::community.community').findMany({
      where: { deleted_at: null },
      select: ['id'],
      populate: { organizers: { select: ['id', 'email'], populate: { role: { select: ['type'] } } } },
    });
    organizers = communities.flatMap((c: any) =>
      (c.organizers || []).map((u: any) => ({ id: u.id, email: u.email, roleType: u.role?.type ?? null })));
  }

  const plan = planInitialAssignments({ adminEmails, appliedAdminEmails, usersByEmail, organizers, organizersDone });

  plan.missingEmails.forEach((email) =>
    strapi.log.warn(`${prefix}INITIAL_ADMIN_EMAILS: nenhum usuário com ${maskEmail(email)}; nada feito (conta não é criada)`));
  plan.assignments.forEach((a) =>
    strapi.log.info(`${prefix}${dryRun ? 'Would set' : 'Set'} user ${a.userId} (${maskEmail(a.email)}) ${a.from} -> ${a.to} [${a.reason}]`));
  if (!organizersDone && !plan.assignments.some((a) => a.reason === 'organizer')) {
    strapi.log.info(`${prefix}No organizer with the default role to promote`);
  }

  if (dryRun) return plan;

  const roles = await strapi.db.query(ROLE_UID).findMany({ select: ['id', 'type'] });
  const roleId = (type: string) => roles.find((r: any) => r.type === type)?.id;

  for (const a of plan.assignments) {
    const id = roleId(a.to);
    if (!id) throw new Error(`Role "${a.to}" not found; run ensureRoles first`);
    await strapi.db.query(USER_UID).update({ where: { id: a.userId }, data: { role: id } });
    await strapi.db.query('api::role-change.role-change').create({
      data: { actor_email: 'migration', target: a.userId, target_email: a.email, from_role: a.from, to_role: a.to },
    });
  }

  if (plan.appliedNow.length) {
    await store.set({ key: STORE_KEYS.adminEmailsApplied, value: [...appliedAdminEmails, ...plan.appliedNow] });
  }
  if (!organizersDone) await store.set({ key: STORE_KEYS.organizersPromoted, value: new Date().toISOString() });

  return plan;
};
