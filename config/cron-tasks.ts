import { blockDueAgeReviews } from '../src/utils/age-review';

const USER_UID = 'plugin::users-permissions.user';

/**
 * Scheduled tasks (Strapi cron, enabled in config/server.ts).
 *
 * ageReviewBlock (REA-36): every hour, blocks the accounts whose date-of-birth request e-mail (sent
 * by the admin from /admin/usuarios) is older than 7 days and still has no date of birth. Accounts
 * the admin never e-mailed are never `dob_requested`, so a deploy blocks nobody by itself.
 * AGE_REVIEW_AUTO_BLOCK=false turns it off.
 */
export default {
  ageReviewBlock: {
    task: async ({ strapi }: { strapi: any }) => {
      if (process.env.AGE_REVIEW_AUTO_BLOCK === 'false') return;
      try {
        const blocked = await blockDueAgeReviews({
          findDue: (cutoff) =>
            strapi.db.query(USER_UID).findMany({
              where: {
                age_review_status: 'dob_requested',
                age_review_requested_at: { $lte: cutoff },
                date_of_birth: { $null: true },
              },
              select: ['id'],
            }),
          block: (id, data) => strapi.db.query(USER_UID).update({ where: { id }, data }),
        });
        if (blocked > 0) strapi.log.info(`[age-review] ${blocked} account(s) blocked: no date of birth 7 days after the request`);
      } catch (err: any) {
        strapi.log.error('[age-review] auto block failed: ' + err?.message);
      }
    },
    options: { rule: '0 * * * *' },
  },
};
