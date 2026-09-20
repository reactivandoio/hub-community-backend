/**
 * Strapi v5 Database Migration: Backfill `unlisted` for existing events
 *
 * `unlisted` hides an event from the public listings (home, search, community
 * page) while keeping its direct link working. Strapi only applies the schema
 * default when a row is written, so events created before the field existed
 * keep a NULL, and a NULL never matches `unlisted = false` in SQL — those
 * events would silently drop out of every listing. This sets them to false.
 *
 * Idempotent: it only touches rows where the column is still NULL.
 */

async function up() {
  strapi.log.info('Starting event `unlisted` backfill migration...');

  const hasTable = await strapi.db.connection.schema.hasTable('events');
  if (!hasTable) {
    strapi.log.info('Events table does not exist yet. Skipping backfill.');
    return;
  }

  const hasColumn = await strapi.db.connection.schema.hasColumn('events', 'unlisted');
  if (!hasColumn) {
    // Strapi syncs the schema before migrations only for a known content type;
    // if it has not run yet there is nothing to backfill.
    strapi.log.info('Column `unlisted` does not exist yet. Skipping backfill.');
    return;
  }

  const updated = await strapi.db.connection('events').whereNull('unlisted').update({ unlisted: false });

  strapi.log.info(`✓ Backfilled \`unlisted = false\` on ${updated} event(s).`);
}

/**
 * Migration DOWN: nothing to revert — false is the schema default, and the
 * events that were NULL before were already treated as listed.
 */
async function down() {
  strapi.log.info('Nothing to revert for the event `unlisted` backfill.');
}

module.exports = { up, down };
