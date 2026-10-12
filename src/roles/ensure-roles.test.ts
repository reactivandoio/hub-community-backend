import { describe, expect, it, vi } from 'vitest';

import { AUTHENTICATED_ACTIONS, ROLE_DEFINITIONS } from './definitions';
import { describePlan, ensureRoles, planRoles } from './ensure-roles';

const defs = [
  { type: 'public', name: 'Public', description: '', actions: ['a.read'] },
  { type: 'authenticated', name: 'Authenticated', description: '', actions: ['a.read', 'a.write'] },
  { type: 'admin', name: 'Admin', description: 'Admin role', actions: ['a.read', 'a.write'] },
];

describe('planRoles', () => {
  it('creates a missing role and grants all of its actions', () => {
    const plan = planRoles(
      [
        { id: 1, type: 'public', actions: ['a.read'] },
        { id: 2, type: 'authenticated', actions: ['a.read', 'a.write'] },
      ],
      defs,
    );
    expect(plan.createRoles).toEqual([{ type: 'admin', name: 'Admin', description: 'Admin role' }]);
    expect(plan.grants).toEqual([{ type: 'admin', actions: ['a.read', 'a.write'] }]);
    expect(plan.missingPluginRoles).toEqual([]);
  });

  it('reuses a role created by hand (same type) and grants only what it lacks', () => {
    const plan = planRoles(
      [
        { id: 1, type: 'public', actions: ['a.read'] },
        { id: 2, type: 'authenticated', actions: ['a.read', 'a.write'] },
        { id: 3, type: 'admin', actions: ['a.read', 'extra.by.hand'] },
      ],
      defs,
    );
    expect(plan.createRoles).toEqual([]);
    expect(plan.grants).toEqual([{ type: 'admin', actions: ['a.write'] }]);
  });

  it('is a no-op once everything exists (never removes extra permissions)', () => {
    const plan = planRoles(
      [
        { id: 1, type: 'public', actions: ['a.read', 'other'] },
        { id: 2, type: 'authenticated', actions: ['a.read', 'a.write'] },
        { id: 3, type: 'admin', actions: ['a.read', 'a.write', 'x'] },
      ],
      defs,
    );
    expect(plan).toEqual({ createRoles: [], grants: [], missingPluginRoles: [] });
    expect(describePlan(plan)).toEqual(['Roles and permissions already up to date']);
  });

  it('inherits what the parent role holds in the database (plugin defaults, grants by hand)', () => {
    const inheriting = [...defs.slice(0, 2), { ...defs[2], inheritsFrom: 'authenticated' }];
    const plan = planRoles(
      [
        { id: 1, type: 'public', actions: ['a.read'] },
        { id: 2, type: 'authenticated', actions: ['a.read', 'a.write', 'auth.changePassword'] },
        { id: 3, type: 'admin', actions: ['a.read'] },
      ],
      inheriting,
    );
    expect(plan.grants).toEqual([{ type: 'admin', actions: ['a.write', 'auth.changePassword'] }]);
  });

  it('does not recreate the plugin roles', () => {
    const plan = planRoles([], defs);
    expect(plan.missingPluginRoles).toEqual(['public', 'authenticated']);
    expect(plan.createRoles.map((r) => r.type)).toEqual(['admin']);
  });

  it('defines admin and community-manager with every authenticated action', () => {
    for (const type of ['admin', 'community-manager']) {
      const def = ROLE_DEFINITIONS.find((d) => d.type === type);
      expect(def?.actions).toEqual(expect.arrayContaining([...AUTHENTICATED_ACTIONS]));
    }
  });
});

const fakeStrapi = (roles: any[], permissions: any[]) => {
  let nextId = 100;
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const roleQuery = {
    findMany: vi.fn(async () => roles.map(({ id, type }) => ({ id, type }))),
    create: vi.fn(async ({ data }) => {
      const role = { id: nextId++, ...data };
      roles.push(role);
      return role;
    }),
  };
  const permissionQuery = {
    findMany: vi.fn(async ({ where }) => permissions.filter((p) => p.role === where.role)),
    findOne: vi.fn(async ({ where }) =>
      permissions.find((p) => p.role === where.role && p.action === where.action) ?? null),
    create: vi.fn(async ({ data }) => {
      permissions.push(data);
      return data;
    }),
  };
  return {
    log,
    roleQuery,
    permissionQuery,
    db: {
      query: (uid: string) =>
        uid === 'plugin::users-permissions.role' ? roleQuery : permissionQuery,
    },
  };
};

describe('ensureRoles', () => {
  const base = () => [
    { id: 1, type: 'public' },
    { id: 2, type: 'authenticated' },
  ];

  it('dry run plans but writes nothing', async () => {
    const strapi = fakeStrapi(base(), []);
    const plan = await ensureRoles(strapi, { dryRun: true });
    expect(plan.createRoles.map((r) => r.type)).toEqual(['community-manager', 'admin']);
    expect(strapi.roleQuery.create).not.toHaveBeenCalled();
    expect(strapi.permissionQuery.create).not.toHaveBeenCalled();
    expect(strapi.log.info).toHaveBeenCalledWith('[roles:dry-run] Create role "admin" (Admin)');
  });

  it('applies once, and a second run changes nothing', async () => {
    const roles = base();
    const permissions: any[] = [];
    const strapi = fakeStrapi(roles, permissions);
    await ensureRoles(strapi);
    expect(roles.map((r) => r.type)).toEqual(['public', 'authenticated', 'community-manager', 'admin']);
    const admin = roles.find((r) => r.type === 'admin');
    expect(permissions.filter((p) => p.role === admin.id).map((p) => p.action).sort()).toEqual(
      [...AUTHENTICATED_ACTIONS].sort(),
    );

    const count = permissions.length;
    const again = fakeStrapi(roles, permissions);
    const plan = await ensureRoles(again);
    expect(plan.createRoles).toEqual([]);
    expect(plan.grants).toEqual([]);
    expect(permissions.length).toBe(count);
  });
});
