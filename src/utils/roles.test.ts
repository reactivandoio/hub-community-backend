import { describe, it, expect, vi } from 'vitest';
import {
  ADMIN_ROLE,
  VOTING_WRITE_ACTIONS,
  ensureRole,
  revokePermissions,
} from './roles';

describe('ensureRole', () => {
  it('creates the admin role when it does not exist', async () => {
    const roleQuery = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 9 }),
    };
    const out = await ensureRole(roleQuery, ADMIN_ROLE);
    expect(roleQuery.findOne).toHaveBeenCalledWith({ where: { type: 'admin' } });
    expect(roleQuery.create).toHaveBeenCalledWith({ data: ADMIN_ROLE });
    expect(out).toEqual({ role: { id: 9 }, created: true });
  });

  it('leaves an existing role alone (bootstrap runs on every start)', async () => {
    const roleQuery = {
      findOne: vi.fn().mockResolvedValue({ id: 3 }),
      create: vi.fn(),
    };
    const out = await ensureRole(roleQuery, ADMIN_ROLE);
    expect(roleQuery.create).not.toHaveBeenCalled();
    expect(out).toEqual({ role: { id: 3 }, created: false });
  });
});

describe('revokePermissions', () => {
  it('deletes only the permissions the role has', async () => {
    const permissionQuery = {
      findOne: vi.fn(async ({ where }) => (where.action === VOTING_WRITE_ACTIONS[0] ? { id: 41 } : null)),
      delete: vi.fn().mockResolvedValue({}),
    };
    const out = await revokePermissions(permissionQuery, 2, VOTING_WRITE_ACTIONS);
    expect(out).toEqual([VOTING_WRITE_ACTIONS[0]]);
    expect(permissionQuery.delete).toHaveBeenCalledTimes(1);
    expect(permissionQuery.delete).toHaveBeenCalledWith({ where: { id: 41 } });
    expect(permissionQuery.findOne).toHaveBeenCalledWith({ where: { role: 2, action: VOTING_WRITE_ACTIONS[5] } });
  });

  it('covers create, update and delete of sessions and options', () => {
    expect(VOTING_WRITE_ACTIONS).toHaveLength(6);
    expect(VOTING_WRITE_ACTIONS.every((a) => /\.(create|update|delete)$/.test(a))).toBe(true);
  });
});
