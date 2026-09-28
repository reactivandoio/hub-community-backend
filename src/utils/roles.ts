// Roles of users-permissions created at bootstrap.
//
// "admin" is the source of truth the BFF reads to decide who administers the platform
// (hub-community-bff/src/utils/auth). It gets the same content-api permissions as
// "authenticated": an admin still uses the site as a regular user, and the BFF does the
// administrative writes with the integration token after checking the role.
export const ADMIN_ROLE = {
  type: 'admin',
  name: 'Admin',
  description: 'Administradores da plataforma (autorização no BFF).',
};

type RoleQuery = {
  findOne: (args: { where: { type: string } }) => Promise<{ id: number } | null>;
  create: (args: { data: { type: string; name: string; description: string } }) => Promise<{ id: number }>;
};

/** Creates the role when missing. Idempotent: an existing role is left as it is. */
export const ensureRole = async (
  roleQuery: RoleQuery,
  role: { type: string; name: string; description: string },
  log?: { info: (message: string) => void },
) => {
  const existing = await roleQuery.findOne({ where: { type: role.type } });
  if (existing) return { role: existing, created: false };
  const created = await roleQuery.create({ data: role });
  log?.info(`Created users-permissions role "${role.type}"`);
  return { role: created, created: true };
};

type PermissionQuery = {
  findOne: (args: { where: { role: number; action: string } }) => Promise<{ id: number } | null>;
  delete: (args: { where: { id: number } }) => Promise<unknown>;
};

/**
 * Removes content-api permissions from a role. Idempotent: an action the role does not
 * have is skipped. Used for grants made by hand in the admin panel that must not exist
 * (e.g. public writes on voting sessions, now done by the BFF with the integration token).
 */
export const revokePermissions = async (
  permissionQuery: PermissionQuery,
  roleId: number,
  actions: string[],
  log?: { info: (message: string) => void },
) => {
  const revoked: string[] = [];
  for (const action of actions) {
    const existing = await permissionQuery.findOne({ where: { role: roleId, action } });
    if (existing) {
      await permissionQuery.delete({ where: { id: existing.id } });
      revoked.push(action);
      log?.info(`Revoked permission: ${action}`);
    }
  }
  return revoked;
};

// Voting sessions and options are managed only through the BFF (requireAdmin).
export const VOTING_WRITE_ACTIONS = [
  'api::voting-session.voting-session.create',
  'api::voting-session.voting-session.update',
  'api::voting-session.voting-session.delete',
  'api::voting-option.voting-option.create',
  'api::voting-option.voting-option.update',
  'api::voting-option.voting-option.delete',
];
