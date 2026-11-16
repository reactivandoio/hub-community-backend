import { markDueAgeReviews } from '../src/utils/age-review';

const USER_UID = 'plugin::users-permissions.user';

/**
 * Scheduled tasks (Strapi cron, enabled in config/server.ts).
 *
 * ageReviewBlock (REA-36, changed in REA-60): every hour, the accounts whose date-of-birth request
 * e-mail (sent by the admin from /admin/usuarios/idade) is older than 7 days and still has no date
 * of birth become `dob_update_required` ("pendente de atualização"). Nobody is blocked: the person
 * still logs in with the code and the Hub asks for the date before anything else. Accounts blocked
 * by the old rule (`dob_blocked`) are unblocked into the same status. Accounts the admin never
 * e-mailed are never `dob_requested`, so a deploy changes nobody by itself.
 * AGE_REVIEW_AUTO_BLOCK=false turns it off (name kept for the env files already deployed).
 */
export default {
  ageReviewBlock: {
    task: async ({ strapi }: { strapi: any }) => {
      if (process.env.AGE_REVIEW_AUTO_BLOCK === 'false') return;
      try {
        const users = strapi.db.query(USER_UID);
        const { pending, unblocked } = await markDueAgeReviews({
          findDue: (cutoff) =>
            users.findMany({
              where: {
                age_review_status: 'dob_requested',
                age_review_requested_at: { $lte: cutoff },
                date_of_birth: { $null: true },
              },
              select: ['id'],
            }),
          findLegacyBlocked: () => users.findMany({ where: { age_review_status: 'dob_blocked' }, select: ['id'] }),
          update: (id, data) => users.update({ where: { id }, data }),
        });
        if (pending > 0) strapi.log.info(`[age-review] ${pending} account(s) pending update: no date of birth 7 days after the request`);
        if (unblocked > 0) strapi.log.info(`[age-review] ${unblocked} account(s) blocked for no date of birth unblocked, now pending update`);
      } catch (err: any) {
        strapi.log.error('[age-review] pending-update task failed: ' + err?.message);
      }
    },
    options: { rule: '0 * * * *' },
  },
};
