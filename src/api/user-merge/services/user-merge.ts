/**
 * user-merge service (REA-96)
 *
 * Wires the pure rules of utils/user-merge to Strapi. The join tables come from Strapi's database
 * metadata, so a content type created later that points at the user is moved too.
 */

import {
  CpfUser,
  LinkSpec,
  MergeStore,
  ModelMeta,
  USER_UID,
  duplicateCpfGroups,
  mergeUsers,
  previewMerge,
  userLinkSpecs,
} from '../../../utils/user-merge';

const USER_FIELDS = [
  'id', 'documentId', 'email', 'name', 'cpf', 'phone', 'date_of_birth', 'blocked', 'merged_at', 'createdAt',
];

// Never more groups than this in one answer (a page of the admin's screen is far smaller).
const MAX_GROUPS = 200;
const DELETE_CHUNK = 500;

export default ({ strapi }: { strapi: any }) => {
  const specs = (): LinkSpec[] => userLinkSpecs([...strapi.db.metadata.values()] as ModelMeta[]);

  const store = (knex: any): MergeStore => {
    const cachedSpecs = specs();
    return {
      specs: () => cachedSpecs,
      findUser: (id) => strapi.db.query(USER_UID).findOne({
        where: { id },
        select: USER_FIELDS,
        populate: { role: { select: ['type'] } },
      }),
      async countLinks(spec, userId) {
        const row = await knex(`${spec.table} as l`)
          .join(`${spec.ownerTable} as o`, 'o.id', `l.${spec.ownerColumn}`)
          .where(`l.${spec.userColumn}`, userId)
          .countDistinct({ total: 'o.document_id' })
          .first();
        return Number(row?.total) || 0;
      },
      async moveLinks(spec, fromId, toId) {
        if (spec.single) {
          const held = await knex(spec.table).where(spec.userColumn, toId).first();
          if (held) return { moved: 0, kept: await this.countLinks(spec, fromId) };
        } else {
          // The kept account is already linked to some of these: drop the duplicate rows instead
          // of moving them (the join tables are unique per pair).
          const shared = (await knex(spec.table).where(spec.userColumn, toId).select(spec.ownerColumn))
            .map((row: any) => row[spec.ownerColumn]);
          for (let i = 0; i < shared.length; i += DELETE_CHUNK) {
            await knex(spec.table)
              .where(spec.userColumn, fromId)
              .whereIn(spec.ownerColumn, shared.slice(i, i + DELETE_CHUNK))
              .del();
          }
        }
        const moved = await this.countLinks(spec, fromId);
        await knex(spec.table).where(spec.userColumn, fromId).update({ [spec.userColumn]: toId });
        return { moved, kept: 0 };
      },
      async countEmailRows(email) {
        const where = { email: { $eqi: email } };
        const [certificates, requests] = await Promise.all([
          strapi.db.query('api::certificate.certificate').count({ where }),
          strapi.db.query('api::participant.participant').count({ where }),
        ]);
        return { certificates, requests };
      },
      async moveEmailRows(fromEmail, toEmail) {
        const where = { email: { $eqi: fromEmail } };
        const certificates = await strapi.db.query('api::certificate.certificate')
          .updateMany({ where, data: { email: toEmail } });
        const requests = await strapi.db.query('api::participant.participant')
          .updateMany({ where, data: { email: toEmail } });
        return { certificates: Number(certificates?.count) || 0, requests: Number(requests?.count) || 0 };
      },
      async lastLoginAt(email) {
        const code = await strapi.db.query('api::login-code.login-code').findOne({
          where: { email: { $eqi: email }, consumed_at: { $notNull: true } },
          orderBy: { consumed_at: 'desc' },
          select: ['consumed_at'],
        });
        return code?.consumed_at ? new Date(code.consumed_at).toISOString() : null;
      },
      async authenticatedRoleId() {
        const role = await strapi.db.query('plugin::users-permissions.role')
          .findOne({ where: { type: 'authenticated' }, select: ['id'] });
        return role?.id ?? null;
      },
      async updateUser(id, data) {
        await strapi.db.query(USER_UID).update({ where: { id }, data });
      },
    };
  };

  const describe = async (s: MergeStore, id: number) => {
    const user: any = await s.findUser(id);
    if (!user) return null;
    const counted = [];
    for (const spec of s.specs()) {
      const count = await s.countLinks(spec, id);
      if (count > 0) counted.push({ key: spec.key, label: spec.label, counts: spec.counts, count });
    }
    const email = String(user.email || '').trim().toLowerCase();
    return {
      id: user.id,
      documentId: user.documentId,
      name: user.name ?? null,
      email: user.email ?? null,
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
      blocked: Boolean(user.blocked),
      role: user.role?.type ?? null,
      lastLoginAt: email ? await s.lastLoginAt(email) : null,
      links: counted,
      emailRows: email ? await s.countEmailRows(email) : { certificates: 0, requests: 0 },
    };
  };

  return {
    /** Groups of accounts sharing a CPF, each account with what is linked to it. Read only. */
    async duplicates() {
      const users: CpfUser[] = await strapi.db.query(USER_UID).findMany({
        where: { cpf: { $notNull: true } },
        select: ['id', 'cpf', 'merged_at'],
      });
      const groups = duplicateCpfGroups(users);
      const s = store(strapi.db.connection);
      const answer = [];
      for (const ids of groups.slice(0, MAX_GROUPS)) {
        const accounts = [];
        for (const id of ids) accounts.push(await describe(s, id));
        answer.push({ ids, users: accounts.filter(Boolean) });
      }
      return { total: groups.length, groups: answer };
    },

    preview({ keepId, dropId, actorId }: { keepId: number; dropId: number; actorId?: number | null }) {
      return previewMerge(store(strapi.db.connection), { keepId, dropId, actorId });
    },

    /** Joins drop into keep, all or nothing. */
    merge({ keepId, dropId, actorId }: { keepId: number; dropId: number; actorId?: number | null }) {
      return strapi.db.transaction(({ trx }: { trx: any }) =>
        mergeUsers(store(trx), { keepId, dropId, actorId, now: new Date() }));
    },
  };
};
