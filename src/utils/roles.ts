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
