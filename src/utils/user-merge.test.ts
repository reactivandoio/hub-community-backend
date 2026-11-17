import { describe, expect, it, vi } from 'vitest';

import {
  LinkSpec,
  MergeRefusedError,
  MergeStore,
  MergeUser,
  ModelMeta,
  USER_UID,
  anonymizedEmail,
  anonymizedUser,
  cpfDigits,
  duplicateCpfGroups,
  fieldsToFill,
  mergeBlockers,
  mergeUsers,
  previewMerge,
  userLinkSpecs,
} from './user-merge';

const joinTable = (name: string, joinColumn: string, inverseJoinColumn: string) => ({
  name,
  joinColumn: { name: joinColumn },
  inverseJoinColumn: { name: inverseJoinColumn },
});

// A slice of Strapi's metadata, shaped like strapi.db.metadata.
const MODELS: ModelMeta[] = [
  {
    uid: USER_UID,
    tableName: 'up_users',
    attributes: {
      email: { type: 'email' },
      role: { type: 'relation', relation: 'manyToOne', target: 'plugin::users-permissions.role', joinTable: joinTable('up_users_role_lnk', 'user_id', 'role_id') },
      speaker: { type: 'relation', relation: 'oneToOne', target: 'api::speaker.speaker', joinTable: joinTable('up_users_speaker_lnk', 'user_id', 'speaker_id') },
      communities: { type: 'relation', relation: 'manyToMany', target: 'api::community.community', mappedBy: 'organizers', joinTable: joinTable('communities_organizers_lnk', 'user_id', 'community_id') },
    },
  },
  { uid: 'plugin::users-permissions.role', tableName: 'up_roles', attributes: {} },
  { uid: 'api::speaker.speaker', tableName: 'speakers', attributes: {} },
  {
    uid: 'api::community.community',
    tableName: 'communities',
    attributes: {
      organizers: { type: 'relation', relation: 'manyToMany', target: USER_UID, inversedBy: 'communities', joinTable: joinTable('communities_organizers_lnk', 'community_id', 'user_id') } as any,
    },
  },
  {
    uid: 'api::certificate.certificate',
    tableName: 'certificates',
    attributes: {
      users_permissions_user: { type: 'relation', relation: 'manyToOne', target: USER_UID, joinTable: joinTable('certificates_users_permissions_user_lnk', 'certificate_id', 'user_id') },
      event: { type: 'relation', relation: 'manyToOne', target: 'api::event.event', joinTable: joinTable('certificates_event_lnk', 'certificate_id', 'event_id') },
    },
  },
  {
    uid: 'api::analytics-event.analytics-event',
    tableName: 'analytics_events',
    attributes: {
      users_permissions_user: { type: 'relation', relation: 'manyToOne', target: USER_UID, joinTable: joinTable('analytics_events_users_permissions_user_lnk', 'analytics_event_id', 'user_id') },
    },
  },
  {
    uid: 'api::role-change.role-change',
    tableName: 'role_changes',
    attributes: {
      target: { type: 'relation', relation: 'manyToOne', target: USER_UID, joinTable: joinTable('role_changes_target_lnk', 'role_change_id', 'user_id') },
    },
  },
];

describe('userLinkSpecs', () => {
  const specs = userLinkSpecs(MODELS);
  const byKey = new Map(specs.map((spec) => [spec.key, spec]));

  it('lists the relations other models own towards the user, with the user on the inverse column', () => {
    expect(byKey.get('api::certificate.certificate.users_permissions_user')).toEqual({
      key: 'api::certificate.certificate.users_permissions_user',
      label: 'Certificados',
      table: 'certificates_users_permissions_user_lnk',
      userColumn: 'user_id',
      ownerColumn: 'certificate_id',
      ownerTable: 'certificates',
      single: false,
      counts: true,
    });
    expect(byKey.get('api::community.community.organizers')).toMatchObject({
      userColumn: 'user_id', ownerColumn: 'community_id', ownerTable: 'communities', single: false,
    });
  });

  it("lists the user's own relations (speaker) as single, and never the role", () => {
    expect(byKey.get(`${USER_UID}.speaker`)).toMatchObject({
      table: 'up_users_speaker_lnk', userColumn: 'user_id', ownerColumn: 'speaker_id', ownerTable: 'speakers', single: true,
    });
    expect(byKey.has(`${USER_UID}.role`)).toBe(false);
  });

  it('skips inverse sides (mappedBy), relations to other models and the audit trails', () => {
    expect(byKey.has(`${USER_UID}.communities`)).toBe(false);
    expect(byKey.has('api::certificate.certificate.event')).toBe(false);
    expect(byKey.has('api::role-change.role-change.target')).toBe(false);
  });

  it('moves browsing analytics without counting it as a link', () => {
    expect(byKey.get('api::analytics-event.analytics-event.users_permissions_user')).toMatchObject({ counts: false });
  });

  it('labels an unknown relation by its key, so it still moves', () => {
    const more = userLinkSpecs([...MODELS, {
      uid: 'api::novo.novo',
      tableName: 'novos',
      attributes: { dono: { type: 'relation', relation: 'manyToOne', target: USER_UID, joinTable: joinTable('novos_dono_lnk', 'novo_id', 'user_id') } },
    }]);
    expect(more.find((spec) => spec.key === 'api::novo.novo.dono')).toMatchObject({ label: 'api::novo.novo.dono' });
  });
});

describe('duplicateCpfGroups', () => {
  it('groups by the digits of the CPF, ignoring punctuation and spaces', () => {
    expect(duplicateCpfGroups([
      { id: 621, cpf: '529.982.247-25' },
      { id: 620, cpf: ' 52998224725 ' },
      { id: 7, cpf: '111.444.777-35' },
      { id: 9, cpf: '' },
      { id: 10, cpf: null },
      { id: 11, cpf: '  ' },
      { id: 3, cpf: '11144477735' },
      { id: 5, cpf: '111 444 777 35' },
    ])).toEqual([[3, 5, 7], [620, 621]]);
  });

  it('leaves out accounts already joined into another', () => {
    expect(duplicateCpfGroups([
      { id: 1, cpf: '52998224725' },
      { id: 2, cpf: '52998224725', merged_at: '2026-11-17T10:00:00.000Z' },
    ])).toEqual([]);
  });

  it('cpfDigits keeps only digits', () => {
    expect(cpfDigits('529.982.247-25')).toBe('52998224725');
    expect(cpfDigits(null)).toBe('');
  });
});

const user = (over: Partial<MergeUser> = {}): MergeUser => ({
  id: 1, documentId: 'doc-1', email: 'a@x.com', name: 'Ana', cpf: '52998224725', role: { type: 'authenticated' }, ...over,
});

describe('mergeBlockers', () => {
  it('lets two accounts of the same CPF through', () => {
    expect(mergeBlockers({ keep: user({ id: 621 }), drop: user({ id: 620, cpf: '529.982.247-25' }), actorId: 1 })).toEqual([]);
  });

  it('refuses a missing account and the same account twice', () => {
    expect(mergeBlockers({ keep: null, drop: user() })).toEqual(['Conta não encontrada.']);
    expect(mergeBlockers({ keep: user(), drop: user() })).toEqual(['Escolha duas contas diferentes.']);
  });

  it('refuses dropping the admin doing it', () => {
    const reasons = mergeBlockers({ keep: user({ id: 2, role: { type: 'admin' } }), drop: user({ id: 1, role: { type: 'admin' } }), actorId: 1 });
    expect(reasons).toEqual(['Você não pode descartar a sua própria conta. Peça a outro admin.']);
  });

  it('refuses dropping an account with more access than the one that stays', () => {
    expect(mergeBlockers({ keep: user({ id: 2 }), drop: user({ id: 3, role: { type: 'admin' } }) }))
      .toEqual(['A conta descartada é Admin. Dê esse papel à conta que fica antes de juntar.']);
    expect(mergeBlockers({ keep: user({ id: 2, role: { type: 'event-manager' } }), drop: user({ id: 3, role: { type: 'community-manager' } }) }))
      .toHaveLength(1);
    expect(mergeBlockers({ keep: user({ id: 2, role: { type: 'admin' } }), drop: user({ id: 3, role: { type: 'admin' } }) }))
      .toEqual([]);
  });

  it('refuses two different CPFs, but not a missing one', () => {
    expect(mergeBlockers({ keep: user({ id: 2 }), drop: user({ id: 3, cpf: '11144477735' }) })).toHaveLength(1);
    expect(mergeBlockers({ keep: user({ id: 2, cpf: null }), drop: user({ id: 3 }) })).toEqual([]);
  });

  it('refuses accounts already joined', () => {
    expect(mergeBlockers({ keep: user({ id: 2, merged_at: 'x' }), drop: user({ id: 3, merged_at: 'y' }) })).toEqual([
      'A conta que fica já foi juntada a outra.',
      'A conta descartada já foi juntada a outra.',
    ]);
  });
});

describe('fieldsToFill / anonymizedUser', () => {
  it('fills only the empty fields of the account that stays', () => {
    expect(fieldsToFill(
      user({ id: 2, name: 'Wag', cpf: null, phone: '', date_of_birth: null }),
      user({ id: 3, name: 'Outro', cpf: '529.982.247-25', phone: '62999990000', date_of_birth: '1990-01-02' }),
    )).toEqual({ cpf: '52998224725', phone: '62999990000', date_of_birth: '1990-01-02' });
  });

  it('switches the dropped account off with no personal data left', () => {
    const now = new Date('2026-11-17T12:00:00.000Z');
    const data = anonymizedUser({ id: 620, keepId: 621, now, authenticatedRoleId: 4 });
    expect(data).toMatchObject({
      email: 'conta-unificada-620@merged.invalid',
      username: 'conta-unificada-620',
      name: 'Conta unificada',
      cpf: null,
      phone: null,
      date_of_birth: null,
      blocked: true,
      marketing_opt_in: false,
      sessions_revoked_at: now.toISOString(),
      merged_into: 621,
      merged_at: now.toISOString(),
      role: 4,
    });
    expect(anonymizedEmail(620)).toBe(data.email);
  });
});

// In-memory store: links as { [specKey]: { [userId]: count } }.
const memoryStore = (users: MergeUser[], links: Record<string, Record<number, number>>, specs: LinkSpec[], heldSingle: Record<string, number[]> = {}) => {
  const updates: Array<[number, Record<string, unknown>]> = [];
  const calls: string[] = [];
  const store: MergeStore = {
    specs: () => specs,
    findUser: async (id) => users.find((u) => u.id === id) || null,
    countLinks: async (spec, id) => links[spec.key]?.[id] || 0,
    moveLinks: vi.fn(async (spec, from, to) => {
      calls.push(`move ${spec.key}`);
      const count = links[spec.key]?.[from] || 0;
      if (spec.single && (heldSingle[spec.key] || []).includes(to)) return { moved: 0, kept: count };
      links[spec.key][to] = (links[spec.key][to] || 0) + count;
      links[spec.key][from] = 0;
      return { moved: count, kept: 0 };
    }),
    countEmailRows: async () => ({ certificates: 1, requests: 0 }),
    moveEmailRows: vi.fn(async () => ({ certificates: 1, requests: 0 })),
    lastLoginAt: async () => null,
    authenticatedRoleId: async () => 4,
    updateUser: vi.fn(async (id, data) => {
      calls.push(`update ${id}`);
      updates.push([id, data]);
    }),
  };
  return { store, updates, calls };
};

const SPECS = userLinkSpecs(MODELS);

describe('previewMerge', () => {
  it('lists what would move, the blockers and the fields to fill, without writing', async () => {
    const { store } = memoryStore(
      [user({ id: 621, email: 'w.sd@x.com', phone: null }), user({ id: 620, email: 'W.Ope@x.com', phone: '62' })],
      { 'api::certificate.certificate.users_permissions_user': { 620: 2 }, [`${USER_UID}.speaker`]: {} },
      SPECS,
    );
    const preview = await previewMerge(store, { keepId: 621, dropId: 620, actorId: 1 });
    expect(preview.blockers).toEqual([]);
    expect(preview.links).toEqual([{ key: 'api::certificate.certificate.users_permissions_user', label: 'Certificados', counts: true, count: 2 }]);
    expect(preview.emailRows).toEqual({ certificates: 1, requests: 0 });
    expect(preview.fill).toEqual(['phone']);
    expect(store.moveLinks).not.toHaveBeenCalled();
    expect(store.updateUser).not.toHaveBeenCalled();
  });
});

describe('mergeUsers', () => {
  it('moves every link, re-addresses the e-mail rows, anonymizes the dropped account first, then fills the kept one', async () => {
    const now = new Date('2026-11-17T12:00:00.000Z');
    const { store, updates, calls } = memoryStore(
      [user({ id: 621, email: 'w.sd@x.com', cpf: null }), user({ id: 620, email: ' W.Ope@x.com ' })],
      {
        'api::certificate.certificate.users_permissions_user': { 620: 2 },
        'api::community.community.organizers': { 620: 0 },
        [`${USER_UID}.speaker`]: { 620: 1 },
      },
      SPECS,
    );
    const result = await mergeUsers(store, { keepId: 621, dropId: 620, actorId: 1, now });

    expect(result.links).toEqual([
      { key: 'api::certificate.certificate.users_permissions_user', label: 'Certificados', counts: true, count: 2, moved: 2, kept: 0 },
      { key: `${USER_UID}.speaker`, label: 'Perfil de palestrante', counts: true, count: 1, moved: 1, kept: 0 },
    ]);
    expect(store.moveEmailRows).toHaveBeenCalledWith('w.ope@x.com', 'w.sd@x.com');
    expect(result).toMatchObject({ keepEmail: 'w.sd@x.com', dropEmail: 'w.ope@x.com', filled: ['cpf'], keepDocumentId: 'doc-1' });
    expect(calls.slice(-2)).toEqual(['update 620', 'update 621']);
    expect(updates[0][1]).toMatchObject({ cpf: null, blocked: true, merged_into: 621, role: 4 });
    expect(updates[1][1]).toEqual({ cpf: '52998224725' });
  });

  it('leaves a speaker profile with the dropped account when the kept one has its own', async () => {
    const { store } = memoryStore(
      [user({ id: 621, email: 'a@x.com' }), user({ id: 620, email: 'b@x.com' })],
      { [`${USER_UID}.speaker`]: { 620: 1, 621: 1 } },
      SPECS,
      { [`${USER_UID}.speaker`]: [621] },
    );
    const result = await mergeUsers(store, { keepId: 621, dropId: 620 });
    expect(result.links).toEqual([
      { key: `${USER_UID}.speaker`, label: 'Perfil de palestrante', counts: true, count: 1, moved: 0, kept: 1 },
    ]);
  });

  it('refuses before writing anything', async () => {
    const { store } = memoryStore(
      [user({ id: 2 }), user({ id: 3, role: { type: 'admin' } })],
      { 'api::certificate.certificate.users_permissions_user': { 3: 1 } },
      SPECS,
    );
    await expect(mergeUsers(store, { keepId: 2, dropId: 3 })).rejects.toBeInstanceOf(MergeRefusedError);
    expect(store.moveLinks).not.toHaveBeenCalled();
    expect(store.updateUser).not.toHaveBeenCalled();
    expect(store.moveEmailRows).not.toHaveBeenCalled();
  });
});
