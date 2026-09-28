import { describe, it, expect, vi } from 'vitest';
import { ADMIN_ROLE, ensureRole } from './roles';

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
