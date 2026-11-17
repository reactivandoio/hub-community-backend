/**
 * REA-96: joining two accounts of the same person (usually one CPF, two e-mails).
 *
 * The admin picks the account that stays (`keep`); the other one (`drop`) hands over everything that
 * points at it and is then switched off and anonymized — never deleted, so the history that refers
 * to it (role-change, user-change, the Eventando payments) stays whole.
 *
 * Pure helpers: the database comes in through `MergeStore` (services/user-merge wires it to Strapi,
 * inside one transaction), so the rules are unit tested without booting Strapi.
 */

export const USER_UID = 'plugin::users-permissions.user';

/** A join table that points at a user, seen from the user's side. */
export type LinkSpec = {
  /** `<uid>.<attribute>` of the side that owns the relation. */
  key: string;
  label: string;
  table: string;
  userColumn: string;
  ownerColumn: string;
  /** Table of the entity on the other side (to count documents, not draft/published rows). */
  ownerTable: string;
  /**
   * The user holds one of these at most (its own speaker profile, its team): it moves only when the
   * account that stays has none; otherwise it stays with the dropped account.
   */
  single: boolean;
  /** Counts as a "vínculo" when suggesting which account stays (browsing analytics does not). */
  counts: boolean;
};

type MetaAttribute = {
  type?: string;
  relation?: string;
  target?: string;
  mappedBy?: string;
  joinTable?: {
    name: string;
    joinColumn: { name: string };
    inverseJoinColumn: { name: string };
  };
};

export type ModelMeta = {
  uid: string;
  tableName: string;
  attributes: Record<string, MetaAttribute>;
};

// What each relation is, in the admin's words. A relation to the user missing here still moves
// (under its key), so a new content type is never left behind silently.
export const LINK_LABELS: Record<string, string> = {
  'api::certificate.certificate.users_permissions_user': 'Certificados',
  'api::attendance.attendance.users_permissions_user': 'Presenças',
  'api::agenda.agenda.users_permissions_user': 'Itens da agenda',
  'api::vote.vote.user': 'Votos',
  'api::comment.comment.user_creator': 'Comentários',
  'api::comment.comment.users_tagged': 'Marcações em comentários',
  'api::comment-reply.comment-reply.user_creator': 'Respostas a comentários',
  'api::comment-reply.comment-reply.users_taggeds': 'Marcações em respostas',
  'api::rate.rate.users_permissions_user': 'Avaliações de palestras',
  'api::community.community.organizers': 'Comunidades que organiza',
  'api::event.event.managers': 'Eventos que gere',
  'api::team.team.lead': 'Times que lidera',
  'api::management-invite.management-invite.accepted_by': 'Convites de gestão aceitos',
  'api::management-invite.management-invite.invited_by': 'Convites de gestão enviados',
  'api::analytics-event.analytics-event.users_permissions_user': 'Eventos de navegação',
  [`${USER_UID}.speaker`]: 'Perfil de palestrante',
  [`${USER_UID}.team`]: 'Time',
};

// Audit trails: they say who did what to which account, so they keep pointing at the dropped one.
const HISTORY_KEYS = new Set([
  'api::role-change.role-change.actor',
  'api::role-change.role-change.target',
  'api::user-change.user-change.actor',
  'api::user-change.user-change.target',
  'api::user-change.user-change.source',
]);

// Never moved: the role is the kept account's own (see mergeBlockers).
const USER_OWN_SKIPPED = new Set(['role']);

const NOT_COUNTED = new Set(['api::analytics-event.analytics-event.users_permissions_user']);

/**
 * Every join table holding a user, from Strapi's database metadata: the relations other models own
 * towards the user, and the ones the user model owns itself (speaker, team). Relations declared with
 * `mappedBy` are the inverse view of one already listed and are skipped.
 */
export const userLinkSpecs = (models: ModelMeta[]): LinkSpec[] => {
  const byUid = new Map(models.map((model) => [model.uid, model]));
  const specs: LinkSpec[] = [];
  models.forEach((model) => {
    Object.entries(model.attributes || {}).forEach(([attribute, attr]) => {
      if (attr?.type !== 'relation' || attr.mappedBy || !attr.joinTable || !attr.target) return;
      const key = `${model.uid}.${attribute}`;
      if (HISTORY_KEYS.has(key)) return;
      const { name, joinColumn, inverseJoinColumn } = attr.joinTable;
      if (model.uid === USER_UID) {
        if (USER_OWN_SKIPPED.has(attribute)) return;
        const target = byUid.get(attr.target);
        if (!target) return;
        specs.push({
          key,
          label: LINK_LABELS[key] || key,
          table: name,
          userColumn: joinColumn.name,
          ownerColumn: inverseJoinColumn.name,
          ownerTable: target.tableName,
          single: attr.relation === 'oneToOne' || attr.relation === 'manyToOne',
          counts: !NOT_COUNTED.has(key),
        });
      } else if (attr.target === USER_UID) {
        specs.push({
          key,
          label: LINK_LABELS[key] || key,
          table: name,
          userColumn: inverseJoinColumn.name,
          ownerColumn: joinColumn.name,
          ownerTable: model.tableName,
          single: false,
          counts: !NOT_COUNTED.has(key),
        });
      }
    });
  });
  return specs.sort((a, b) => a.key.localeCompare(b.key));
};

/** The CPF as digits only ("123.456.789-09 " → "12345678909"); '' when there is none. */
export const cpfDigits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

export type CpfUser = { id: number; cpf?: string | null; merged_at?: string | null };

/**
 * Accounts sharing a CPF (punctuation and spaces ignored), as groups of ids in ascending order,
 * groups ordered by their first id. Accounts already merged into another are left out.
 */
export const duplicateCpfGroups = (users: CpfUser[]): number[][] => {
  const byCpf = new Map<string, number[]>();
  users.forEach((user) => {
    if (user.merged_at) return;
    const cpf = cpfDigits(user.cpf);
    if (!cpf) return;
    const ids = byCpf.get(cpf) || [];
    ids.push(Number(user.id));
    byCpf.set(cpf, ids);
  });
  return [...byCpf.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => [...ids].sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
};

export type MergeUser = {
  id: number;
  documentId?: string;
  email?: string | null;
  name?: string | null;
  cpf?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  blocked?: boolean | null;
  merged_at?: string | null;
  role?: { type?: string | null } | null;
};

// Higher rank = more access. The dropped account cannot hold more than the kept one: the admin
// gives the role to the account that stays first (setUserRole records it), so a merge never
// changes anybody's access by itself.
const ROLE_RANK: Record<string, number> = {
  authenticated: 0,
  'event-manager': 1,
  'community-manager': 2,
  admin: 3,
};
const ROLE_NAMES: Record<string, string> = {
  'event-manager': 'Event Manager',
  'community-manager': 'Community Manager',
  admin: 'Admin',
};
const rankOf = (user: MergeUser) => ROLE_RANK[user.role?.type || 'authenticated'] ?? 0;

/** Why these two accounts cannot be joined (empty: they can). Messages for the admin's screen. */
export const mergeBlockers = (
  { keep, drop, actorId }: { keep: MergeUser | null; drop: MergeUser | null; actorId?: number | string | null },
): string[] => {
  if (!keep || !drop) return ['Conta não encontrada.'];
  if (String(keep.id) === String(drop.id)) return ['Escolha duas contas diferentes.'];
  const reasons: string[] = [];
  if (keep.merged_at) reasons.push('A conta que fica já foi juntada a outra.');
  if (drop.merged_at) reasons.push('A conta descartada já foi juntada a outra.');
  if (actorId != null && String(actorId) === String(drop.id)) {
    reasons.push('Você não pode descartar a sua própria conta. Peça a outro admin.');
  }
  if (rankOf(drop) > rankOf(keep)) {
    const name = ROLE_NAMES[drop.role?.type || ''] || drop.role?.type;
    reasons.push(`A conta descartada é ${name}. Dê esse papel à conta que fica antes de juntar.`);
  }
  const keepCpf = cpfDigits(keep.cpf);
  const dropCpf = cpfDigits(drop.cpf);
  if (keepCpf && dropCpf && keepCpf !== dropCpf) {
    reasons.push('As duas contas têm CPFs diferentes. Confira se são da mesma pessoa e corrija o CPF antes.');
  }
  return reasons;
};

// Filled on the kept account only when it has none (never overwritten).
const FILLABLE = ['name', 'cpf', 'phone', 'date_of_birth'] as const;

const isEmpty = (value: unknown) => value === null || value === undefined || String(value).trim() === '';

/** The kept account's empty fields that the dropped one can fill. */
export const fieldsToFill = (keep: MergeUser, drop: MergeUser): Record<string, string> => {
  const data: Record<string, string> = {};
  FILLABLE.forEach((field) => {
    if (isEmpty(keep[field]) && !isEmpty(drop[field])) {
      data[field] = field === 'cpf' ? cpfDigits(drop[field]) : String(drop[field]);
    }
  });
  return data;
};

/** The address a dropped account ends with: unique, and nobody can receive a login code there. */
export const anonymizedEmail = (id: number | string) => `conta-unificada-${id}@merged.invalid`;

/**
 * What the dropped account becomes: blocked, sessions ended, no personal data, pointing at the account
 * that stays. The row is kept (history and payments refer to it).
 */
export const anonymizedUser = (
  { id, keepId, now, authenticatedRoleId }: { id: number; keepId: number; now: Date; authenticatedRoleId?: number | null },
) => ({
  email: anonymizedEmail(id),
  username: `conta-unificada-${id}`,
  name: 'Conta unificada',
  cpf: null,
  phone: null,
  date_of_birth: null,
  cover_photo: null,
  twitter: null,
  linkedin: null,
  github: null,
  website: null,
  instagram: null,
  marketing_opt_in: false,
  age_review_status: null,
  blocked: true,
  sessions_revoked_at: now.toISOString(),
  merged_into: keepId,
  merged_at: now.toISOString(),
  ...(authenticatedRoleId ? { role: authenticatedRoleId } : {}),
});

export class MergeRefusedError extends Error {
  reasons: string[];

  constructor(reasons: string[]) {
    super(reasons.join(' '));
    this.name = 'MergeRefusedError';
    this.reasons = reasons;
  }
}

export type LinkCount = { key: string; label: string; count: number; counts: boolean };
export type LinkMove = LinkCount & { moved: number; kept: number };

/** Database access of a merge (services/user-merge runs it inside one transaction). */
export type MergeStore = {
  specs: () => LinkSpec[];
  findUser: (id: number) => Promise<MergeUser | null>;
  /** Distinct documents linked to the user through this table. */
  countLinks: (spec: LinkSpec, userId: number) => Promise<number>;
  /** Moves the links; answers how many documents moved and how many stayed with `fromId`. */
  moveLinks: (spec: LinkSpec, fromId: number, toId: number) => Promise<{ moved: number; kept: number }>;
  /** Hub rows keyed by e-mail (certificates sent to it, certificate requests). */
  countEmailRows: (email: string) => Promise<{ certificates: number; requests: number }>;
  moveEmailRows: (fromEmail: string, toEmail: string) => Promise<{ certificates: number; requests: number }>;
  lastLoginAt: (email: string) => Promise<string | null>;
  authenticatedRoleId: () => Promise<number | null>;
  updateUser: (id: number, data: Record<string, unknown>) => Promise<void>;
};

const normalizedEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();

const countAll = async (store: MergeStore, userId: number): Promise<LinkCount[]> => {
  const counts: LinkCount[] = [];
  // One at a time: a handful of small queries, and the transaction holds a single connection.
  for (const spec of store.specs()) {
    counts.push({ key: spec.key, label: spec.label, counts: spec.counts, count: await store.countLinks(spec, userId) });
  }
  return counts;
};

/** What joining would move, read only. */
export const previewMerge = async (
  store: MergeStore,
  { keepId, dropId, actorId }: { keepId: number; dropId: number; actorId?: number | null },
) => {
  const [keep, drop] = await Promise.all([store.findUser(keepId), store.findUser(dropId)]);
  const blockers = mergeBlockers({ keep, drop, actorId });
  if (!keep || !drop) return { keep, drop, blockers, links: [], emailRows: { certificates: 0, requests: 0 }, fill: [] };
  const links = (await countAll(store, dropId)).filter((link) => link.count > 0);
  const dropEmail = normalizedEmail(drop.email);
  const emailRows = dropEmail ? await store.countEmailRows(dropEmail) : { certificates: 0, requests: 0 };
  return { keep, drop, blockers, links, emailRows, fill: Object.keys(fieldsToFill(keep, drop)) };
};

/**
 * Joins `drop` into `keep`. Refuses (MergeRefusedError) when mergeBlockers says so. Moves every link,
 * re-addresses the Hub rows keyed by the old e-mail, anonymizes and blocks the dropped account (its
 * sessions end) and fills the kept account's empty fields. Answers what moved and both e-mails as
 * they were (the bff moves the Eventando signups with them).
 */
export const mergeUsers = async (
  store: MergeStore,
  { keepId, dropId, actorId, now = new Date() }: { keepId: number; dropId: number; actorId?: number | null; now?: Date },
) => {
  const [keep, drop] = await Promise.all([store.findUser(keepId), store.findUser(dropId)]);
  const blockers = mergeBlockers({ keep, drop, actorId });
  if (blockers.length > 0) throw new MergeRefusedError(blockers);

  const links: LinkMove[] = [];
  for (const spec of store.specs()) {
    const count = await store.countLinks(spec, dropId);
    if (count === 0) continue;
    const { moved, kept } = await store.moveLinks(spec, dropId, keepId);
    links.push({ key: spec.key, label: spec.label, counts: spec.counts, count, moved, kept });
  }

  const keepEmail = normalizedEmail(keep!.email);
  const dropEmail = normalizedEmail(drop!.email);
  const emailRows = dropEmail && keepEmail && dropEmail !== keepEmail
    ? await store.moveEmailRows(dropEmail, keepEmail)
    : { certificates: 0, requests: 0 };

  const fill = fieldsToFill(keep!, drop!);
  // Read before writing: Strapi's update adds its own keys (updatedAt) to the data it is given.
  const filled = Object.keys(fill);
  // The dropped account lets go of its CPF first, so the kept one never shares it, even for a moment.
  await store.updateUser(dropId, anonymizedUser({
    id: dropId, keepId, now, authenticatedRoleId: await store.authenticatedRoleId(),
  }));
  if (filled.length > 0) await store.updateUser(keepId, { ...fill });

  return {
    keepId,
    dropId,
    keepDocumentId: keep!.documentId ?? null,
    dropDocumentId: drop!.documentId ?? null,
    keepEmail,
    dropEmail,
    links,
    emailRows,
    filled,
  };
};
