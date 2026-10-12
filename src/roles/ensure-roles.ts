/**
 * Makes the users-permissions roles match src/roles/definitions — only by adding.
 *
 * `planRoles` (pure, tested) compares what exists with the definitions and returns the roles to
 * create and the permissions to grant. `ensureRoles` reads the database, plans and, unless
 * `dryRun`, applies. Running it again changes nothing, and it never deletes a role or a
 * permission nor changes anybody's role: the first admin is assigned by hand in the Strapi admin.
 * Logs carry only role types and action names.
 */

import { ROLE_DEFINITIONS, type RoleDefinition } from './definitions';

const ROLE_UID = 'plugin::users-permissions.role';
const PERMISSION_UID = 'plugin::users-permissions.permission';

// Created by the users-permissions plugin itself; if one is missing something else is wrong,
// so it is reported and skipped instead of being recreated here.
export const PLUGIN_ROLE_TYPES = ['public', 'authenticated'];

export type ExistingRole = { id: number; type: string; actions: string[] };

export type RolesPlan = {
  createRoles: { type: string; name: string; description: string }[];
  grants: { type: string; actions: string[] }[];
  missingPluginRoles: string[];
};

export const planRoles = (
  existing: ExistingRole[],
  definitions: readonly RoleDefinition[] = ROLE_DEFINITIONS,
): RolesPlan => {
  const byType = new Map(existing.map((role) => [role.type, role]));
  const plan: RolesPlan = { createRoles: [], grants: [], missingPluginRoles: [] };

  for (const def of definitions) {
    const role = byType.get(def.type);
    if (!role && PLUGIN_ROLE_TYPES.includes(def.type)) {
      plan.missingPluginRoles.push(def.type);
      continue;
    }
    if (!role) {
      plan.createRoles.push({ type: def.type, name: def.name, description: def.description });
    }
    const inherited = def.inheritsFrom ? byType.get(def.inheritsFrom)?.actions ?? [] : [];
    const has = new Set(role?.actions ?? []);
    const actions = [...new Set([...def.actions, ...inherited])].filter((action) => !has.has(action));
    if (actions.length > 0) plan.grants.push({ type: def.type, actions });
  }

  return plan;
};

export const describePlan = (plan: RolesPlan): string[] => {
  const lines: string[] = [];
  plan.missingPluginRoles.forEach((type) =>
    lines.push(`Role "${type}" not found (created by users-permissions), skipping`));
  plan.createRoles.forEach((role) => lines.push(`Create role "${role.type}" (${role.name})`));
  plan.grants.forEach((grant) =>
    grant.actions.forEach((action) => lines.push(`Grant ${grant.type} permission: ${action}`)));
  if (lines.length === 0) lines.push('Roles and permissions already up to date');
  return lines;
};

const loadRoles = async (strapi: any): Promise<ExistingRole[]> => {
  const roles = await strapi.db.query(ROLE_UID).findMany({ select: ['id', 'type'] });
  return Promise.all(
    roles.map(async (role: { id: number; type: string }) => {
      const permissions = await strapi.db
        .query(PERMISSION_UID)
        .findMany({ where: { role: role.id }, select: ['action'] });
      return { id: role.id, type: role.type, actions: permissions.map((p: any) => p.action) };
    }),
  );
};

export const ensureRoles = async (
  strapi: any,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<RolesPlan> => {
  const existing = await loadRoles(strapi);
  const plan = planRoles(existing);
  const prefix = dryRun ? '[roles:dry-run] ' : '[roles] ';

  if (dryRun) {
    describePlan(plan).forEach((line) => strapi.log.info(prefix + line));
    return plan;
  }

  plan.missingPluginRoles.forEach((type) =>
    strapi.log.warn(`${prefix}Role "${type}" not found, skipping permissions`));

  const ids = new Map(existing.map((role) => [role.type, role.id]));
  for (const role of plan.createRoles) {
    // Same shape the users-permissions role service writes (services/role createRole).
    const created = await strapi.db.query(ROLE_UID).create({ data: role });
    ids.set(role.type, created.id);
    strapi.log.info(`${prefix}Created role "${role.type}"`);
  }

  for (const grant of plan.grants) {
    const roleId = ids.get(grant.type);
    for (const action of grant.actions) {
      // Re-checked right before writing, so two instances starting together do not duplicate.
      const already = await strapi.db.query(PERMISSION_UID).findOne({ where: { role: roleId, action } });
      if (already) continue;
      await strapi.db.query(PERMISSION_UID).create({ data: { role: roleId, action } });
      strapi.log.info(`${prefix}Granted ${grant.type} permission: ${action}`);
    }
  }

  return plan;
};
