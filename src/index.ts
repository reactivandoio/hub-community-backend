// import type { Core } from '@strapi/strapi';

import { ensureRoles } from './roles/ensure-roles';
import { applyInitialAssignments } from './roles/initial-assignments';
import { wrapUserUpdate } from './roles/user-update-guard';
import { closePasswordLogin } from './roles/password-login-guard';
import { guardRevokedSessions } from './roles/session-revocation';
import { stampOptIn } from './utils/marketing-opt-in';
import { applyDateOfBirthRules, DateOfBirthError, stampAdultDeclaration } from './utils/age-review';
import { errors } from '@strapi/utils';

const USER_UID = 'plugin::users-permissions.user';

// REA-36: a refused date of birth answers 400 with the reason, from any write path.
const withDateOfBirthRules = (data: any, current: any) => {
  try {
    return applyDateOfBirthRules(data, current);
  } catch (err) {
    if (err instanceof DateOfBirthError) throw new errors.ValidationError(err.message);
    throw err;
  }
};

export default {
  // register() is defined below with the email-confirmation override and the password routes closed (REA-46)

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    // Roles, their content-API permissions and the first assignments (src/roles). With ROLES_DRY_RUN=true
    // (yarn roles:check) it only logs the plan and the rest of the bootstrap is skipped.
    const rolesDryRun = process.env.ROLES_DRY_RUN === 'true';
    try {
      await ensureRoles(strapi, { dryRun: rolesDryRun });
      // First admins (INITIAL_ADMIN_EMAILS) and organizers -> community-manager, once each.
      await applyInitialAssignments(strapi, { dryRun: rolesDryRun });
    } catch (err) {
      strapi.log.error('Failed to bootstrap permissions: ' + err.message);
      if (rolesDryRun) throw err;
    }
    if (rolesDryRun) return;

    // marketing_opt_in_at follows marketing_opt_in, whoever writes it (REA-29) — see utils/marketing-opt-in.
    // REA-36: adult_declaration_at follows adult_declaration, and date_of_birth must be 18+ — see
    // utils/age-review.
    strapi.db.lifecycles.subscribe({
      models: [USER_UID],
      beforeCreate(event: any) {
        const data = stampAdultDeclaration(stampOptIn(event.params.data));
        event.params.data = withDateOfBirthRules(data, null);
      },
      async beforeUpdate(event: any) {
        const data = stampAdultDeclaration(stampOptIn(event.params.data));
        const current = data && data.date_of_birth
          ? await strapi.db.query(USER_UID).findOne({
              where: event.params.where,
              select: ['date_of_birth', 'age_review_status'],
            })
          : null;
        event.params.data = withDateOfBirthRules(data, current ?? {});
      },
    });
    // REA-36: the certificate request form also asks for the date of birth — 18+ only.
    strapi.db.lifecycles.subscribe({
      models: ['api::participant.participant'],
      beforeCreate(event: any) {
        event.params.data = withDateOfBirthRules(event.params.data, null);
      },
    });

    // Add indexes for Performance Considerations (session_id, option_id, fingerprint)
    try {
      const knex = strapi.db.connection;
      const tableExists = await knex.schema.hasTable('votes');
      if (tableExists) {
        // Fingerprint index
        await knex.schema.alterTable('votes', (table) => {
          table.index(['fingerprint'], 'idx_vote_fingerprint').catch(() => {});
        }).catch(() => {});
        
        // Relation indexes (Strapi might create these automatically, but we ensure them here)
        // Note: Strapi usually names foreign keys as <relation_name>_id
        await knex.schema.alterTable('votes', (table) => {
          table.index(['voting_session_id'], 'idx_vote_session').catch(() => {});
        }).catch(() => {});

        await knex.schema.alterTable('votes', (table) => {
          table.index(['voting_option_id'], 'idx_vote_option').catch(() => {});
        }).catch(() => {});
        
        strapi.log.info('Voting performance indexes ensured');
      }
    } catch (err) {
      strapi.log.warn('Could not define custom performance indexes, they might exist or table not ready: ' + err.message);
    }

    // REA-52: the admin reads a person's e-mails by address, and Mailgun's webhook finds the row by
    // message id. hasIndex is not portable, so a "already exists" error is simply ignored.
    try {
      const knex = strapi.db.connection;
      if (await knex.schema.hasTable('email_campaign_deliveries')) {
        for (const [column, name] of [['email', 'idx_email_delivery_email'], ['message_id', 'idx_email_delivery_message_id']]) {
          if (await knex.schema.hasColumn('email_campaign_deliveries', column)) {
            await knex.schema.alterTable('email_campaign_deliveries', (table) => {
              table.index([column], name);
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      strapi.log.warn('Could not ensure e-mail delivery indexes: ' + err.message);
    }

    const pluginStore = strapi.store({
      type: "plugin",
      name: "users-permissions",
    });
    const frontendUrl =
      process.env.FRONTEND_URL || "https://hubcommunity.io";

    // Configure email confirmation redirect URL
    const advancedSettings = await pluginStore.get({ key: "advanced" });
    if (advancedSettings) {
      advancedSettings.email_confirmation_redirection = `${frontendUrl}/email-confirmed`;
      await pluginStore.set({ key: "advanced", value: advancedSettings });
      strapi.log.info(
        `Email confirmation redirect configured: ${frontendUrl}/email-confirmed`,
      );
    }
  },

  register({ strapi }: { strapi: any }) {
    // Override the email-confirmation controller to handle already-confirmed tokens
    const originalController =
      strapi.plugin("users-permissions").controller("auth");
    const originalEmailConfirmation = originalController.emailConfirmation;

    originalController.emailConfirmation = async (ctx: any) => {
      try {
        await originalEmailConfirmation(ctx);
      } catch (err: any) {
        // If the error is "Invalid token" it means the account is already confirmed
        const frontendUrl = process.env.FRONTEND_URL || "https://hubcommunity.io";
        if (
          err?.message === "Invalid token" ||
          err?.name === "ValidationError"
        ) {
          // Redirect to frontend with already-confirmed flag
          ctx.redirect(
            `${frontendUrl}/email-confirmed?already=true`,
          );
          return;
        }
        throw err;
      }
    };

    // PUT /api/users/:id with a user JWT: only the user's own record, never role/blocked/…
    // (the plugin route has no ownership check) — see roles/user-update-guard
    const userController = strapi.plugin("users-permissions").controller("user");
    userController.update = wrapUserUpdate(userController.update);

    // REA-46: no password in the Hub (login by e-mail code, REA-26). /auth/local, the signup and
    // the forgot/reset/change-password routes answer 404 — see roles/password-login-guard
    closePasswordLogin(originalController);

    // REA-63: a JWT issued before the user's sessions_revoked_at is anonymous (the admin changed the
    // e-mail) — see roles/session-revocation. The bff checks the same.
    guardRevokedSessions(strapi.plugin("users-permissions").service("jwt"), async (id) => {
      const user = await strapi.db.query(USER_UID).findOne({
        where: { id },
        select: ["sessions_revoked_at"],
      });
      return user?.sessions_revoked_at ?? null;
    });
  },
};

