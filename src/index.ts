// import type { Core } from '@strapi/strapi';

import { wrapResetPassword } from './api/account-setup/services/account-setup-helpers';
import { ensureRoles } from './roles/ensure-roles';

export default {
  // register() is defined below with email-confirmation and reset-password overrides

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    // Roles and their content-API permissions (src/roles). With ROLES_DRY_RUN=true
    // (yarn roles:check) it only logs the plan and the rest of the bootstrap is skipped.
    const rolesDryRun = process.env.ROLES_DRY_RUN === 'true';
    try {
      await ensureRoles(strapi, { dryRun: rolesDryRun });
    } catch (err) {
      strapi.log.error('Failed to bootstrap permissions: ' + err.message);
      if (rolesDryRun) throw err;
    }
    if (rolesDryRun) return;

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

    // Set the reset password URL programmatically
    const pluginStore = strapi.store({
      type: "plugin",
      name: "users-permissions",
    });

    const settings = await pluginStore.get({ key: "email" });
    const frontendUrl =
      process.env.FRONTEND_URL || "https://hubcommunity.io";

    if (settings && settings.reset_password) {
      // 1. Force update the response_url
      const resetPasswordUrl = `${frontendUrl}/reset-password`;
      settings.reset_password.options.response_url = resetPasswordUrl;

      // 2. Hardcode the URL in the message to be 100% sure it's not empty
      // We keep the <%= TOKEN %> which is correctly populated by Strapi
      settings.reset_password.options.message = `
<p>We heard that you lost your password. Sorry about that!</p>
<p>But don't worry! You can use the following link to reset your password:</p>
<p><a href="${resetPasswordUrl}?code=<%= TOKEN %>">${resetPasswordUrl}?code=<%= TOKEN %></a></p>
<p>Thanks.</p>`.trim();

      await pluginStore.set({ key: "email", value: settings });
      strapi.log.info(
        `Reset password configuration updated with hardcoded URL: ${resetPasswordUrl}`,
      );

      // Verify immediately
      const updatedSettings = await pluginStore.get({ key: "email" });
      strapi.log.info(
        "Verified reset_password options: " +
          JSON.stringify(updatedSettings.reset_password.options),
      );
    }

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

    // Override reset-password so creating the first password (link from the signup e-mail)
    // clears password_pending — see api/account-setup
    originalController.resetPassword = wrapResetPassword(originalController.resetPassword, {
      findUserIdByResetCode: async (code) => {
        const user = await strapi.db
          .query("plugin::users-permissions.user")
          .findOne({ where: { resetPasswordToken: code }, select: ["id"] });
        return user?.id ?? null;
      },
      clearPasswordPending: (id) =>
        strapi.db
          .query("plugin::users-permissions.user")
          .update({ where: { id }, data: { password_pending: false } }),
    });
  },
};

