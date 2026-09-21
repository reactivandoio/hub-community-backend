// import type { Core } from '@strapi/strapi';

export default {
  // register() is defined below with email-confirmation override

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    // Helper: grant permissions to a role (idempotent)
    const grantPermissions = async (roleType: string, actions: string[]) => {
      const role = await strapi.db.query('plugin::users-permissions.role').findOne({
        where: { type: roleType },
      });

      if (!role) {
        strapi.log.warn(`Role "${roleType}" not found, skipping permissions`);
        return;
      }

      for (const action of actions) {
        const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
          where: { role: role.id, action },
        });

        if (!existing) {
          await strapi.db.query('plugin::users-permissions.permission').create({
            data: { role: role.id, action },
          });
          strapi.log.info(`Granted ${roleType} permission: ${action}`);
        }
      }
    };

    try {
      // ── Public role permissions ──
      await grantPermissions('public', [
        // Events (read)
        'api::event.event.find',
        'api::event.event.findOne',
        // Communities (read)
        'api::community.community.find',
        'api::community.community.findOne',
        // Talks (read)
        'api::talk.talk.find',
        'api::talk.talk.findOne',
        // Speakers (read)
        'api::speaker.speaker.find',
        'api::speaker.speaker.findOne',
        // Locations (read)
        'api::location.location.find',
        'api::location.location.findOne',
        // Tags (read)
        'api::tag.tag.find',
        'api::tag.tag.findOne',
        // Teams (read)
        'api::team.team.find',
        'api::team.team.findOne',
        // Voting
        'api::voting-session.voting-session.find',
        'api::voting-session.voting-session.findOne',
        'api::voting-session.voting-session.getResults',
        'api::voting-option.voting-option.find',
        'api::voting-option.voting-option.findOne',
        'api::vote.vote.create',
        // SW Form
        'api::sw-form.sw-form.create',
        // Certificate request forms: the public link reads the form by slug and writes the
        // request. Reading the requests back stays with the authenticated role.
        'api::certificate-request-form.certificate-request-form.find',
        'api::participant.participant.create',
        // Upload (public upload for cover images)
        'plugin::upload.content-api.upload',
        'plugin::upload.content-api.find',
        'plugin::upload.content-api.findOne',
      ]);

      // ── Authenticated role permissions ──
      await grantPermissions('authenticated', [
        // Events (full CRUD)
        'api::event.event.find',
        'api::event.event.findOne',
        'api::event.event.create',
        'api::event.event.update',
        'api::event.event.delete',
        // Communities (full CRUD)
        'api::community.community.find',
        'api::community.community.findOne',
        'api::community.community.create',
        'api::community.community.update',
        'api::community.community.delete',
        // Talks (full CRUD)
        'api::talk.talk.find',
        'api::talk.talk.findOne',
        'api::talk.talk.create',
        'api::talk.talk.update',
        'api::talk.talk.delete',
        // Speakers (full CRUD)
        'api::speaker.speaker.find',
        'api::speaker.speaker.findOne',
        'api::speaker.speaker.create',
        'api::speaker.speaker.update',
        'api::speaker.speaker.delete',
        // Locations (full CRUD)
        'api::location.location.find',
        'api::location.location.findOne',
        'api::location.location.create',
        'api::location.location.update',
        'api::location.location.delete',
        // Tags (read + create)
        'api::tag.tag.find',
        'api::tag.tag.findOne',
        'api::tag.tag.create',
        // Teams (full CRUD + custom actions)
        'api::team.team.find',
        'api::team.team.findOne',
        'api::team.team.create',
        'api::team.team.update',
        'api::team.team.delete',
        'api::team.team.changeLead',
        'api::team.team.leaveTeam',
        // Agendas (full CRUD)
        'api::agenda.agenda.find',
        'api::agenda.agenda.findOne',
        'api::agenda.agenda.create',
        'api::agenda.agenda.update',
        'api::agenda.agenda.delete',
        // Comments (full CRUD)
        'api::comment.comment.find',
        'api::comment.comment.findOne',
        'api::comment.comment.create',
        'api::comment.comment.update',
        'api::comment.comment.delete',
        // Participants (read + create)
        'api::participant.participant.find',
        'api::participant.participant.findOne',
        'api::participant.participant.create',
        // Certificate request forms (full CRUD, admin surface)
        'api::certificate-request-form.certificate-request-form.find',
        'api::certificate-request-form.certificate-request-form.findOne',
        'api::certificate-request-form.certificate-request-form.create',
        'api::certificate-request-form.certificate-request-form.update',
        'api::certificate-request-form.certificate-request-form.delete',
        // SW Form (read)
        'api::sw-form.sw-form.find',
        'api::sw-form.sw-form.findOne',
        // Upload (authenticated upload for cover images)
        'plugin::upload.content-api.upload',
        'plugin::upload.content-api.find',
        'plugin::upload.content-api.findOne',
        // Users (read own profile + update)
        'plugin::users-permissions.user.me',
        'plugin::users-permissions.user.update',
        // Voting
        'api::voting-session.voting-session.find',
        'api::voting-session.voting-session.findOne',
        'api::voting-option.voting-option.find',
        'api::voting-option.voting-option.findOne',
        'api::vote.vote.create',
      ]);
    } catch (err) {
      strapi.log.error('Failed to bootstrap permissions: ' + err.message);
    }

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
  },
};

