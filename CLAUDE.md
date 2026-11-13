# Hub Community Backend

Strapi 5.23.5 headless CMS backend for a community hub platform. Manages events, talks, speakers, communities, comments, ratings, and agendas.

## Tech Stack

- **Framework**: Strapi 5.23.5
- **Language**: TypeScript 5
- **Runtime**: Node.js 18.0.0 - 22.x.x
- **Package Manager**: Yarn (strict — do not use npm)
- **Database**: SQLite (default), MySQL, or PostgreSQL — driven by `DATABASE_CLIENT` env var
- **Testing**: Vitest 4.x
- **Email**: Nodemailer (SMTP via Mailgun)
- **Deployment**: PM2

## Commands

| Command | Description |
|---------|-------------|
| `yarn develop` | Start dev server with hot reload (port 1337) |
| `yarn build` | Build admin panel for production |
| `yarn start` | Start production server |
| `yarn test` / `yarn vitest` | Run tests (once / watch) |
| `make start` | Start with PM2 |
| `make refresh` | Pull + install + restart (PM2) |
| `make update` | Pull + install + build + restart (PM2) |
| `yarn roles:check` | Dry run: logs the roles/permissions the next start would add, writes nothing |

## Project Structure

```
config/             # Server, database, API, middleware, plugin, admin config
database/migrations # Database migration scripts
public/             # Static assets
src/
  api/              # API modules (22 entities)
    account-setup/      # POST /api/account-setup — bff-only (API token), no content type
    login-code/         # REA-26: login by a code e-mailed — POST /api/login-code/{request,verify}, bff-only
    agenda/         # User event agendas
    analytics-event/    # Tracking events
    attendance/         # Lista de presença (user × event)
    certificate/        # Issued participation certificates (unique code, idempotent per event+CPF)
    certificate-config/ # Per-event certificate template (sponsors, signatures, text)
    certificate-request-form/ # Public per-category certificate request form of an event
    share-art-config/   # Per-event custom "eu vou" art: background + photo area per format (REA-43)
    comment/        # Comments on events/talks/communities
    comment-reply/  # Threaded comment replies
    community/      # Communities with organizers, tags, events
    event/          # Events with talks, tags, location
    event-feedback/     # Post-event NPS survey
    link/           # Social media links
    location/       # Geographic locations (lat/lng)
    participant/        # Certificate requests filled in on a certificate-request-form, by category
    rate/           # Ratings (1-5) on talks/events
    role-change/        # Audit trail of role changes made from the Hub admin (written by the bff only)
    speaker/        # Talk speakers with bio, avatar, links
    sw-form/            # Startup Weekend volunteer form
    tag/            # Tags for events and communities
    talk/           # Talks within events
    team/               # Teams within an event (custom actions: changeLead, leaveTeam, uploadPresentation)
    vote/           # Public voting
    voting-option/  # Voting options
    voting-session/  # Public voting sessions
  extensions/
    users-permissions/  # Custom user auth schema extensions
  roles/            # users-permissions roles + permissions, applied on every start (ensureRoles)
types/              # TypeScript type definitions
```

Each API module follows Strapi's standard layout:
```
api/{entity}/
  content-types/{entity}/schema.json  # Schema, validation, relations
  controllers/{entity}.ts             # Factory default controller
  routes/{entity}.ts                  # Factory default router
  services/{entity}.ts                # Service (some with custom logic)
```

## Architecture Patterns

### Factory Pattern
Most modules use factory defaults. Custom routes exist in `team` (`routes/custom-change-lead.ts`) and `voting-session` (`routes/custom-results.ts`, `getResults`):
```typescript
export default factories.createCoreController('api::event.event');
export default factories.createCoreRouter('api::event.event');
```

### Soft Deletes
6 entities use soft delete (Event, Community, Talk, Speaker, Location, Certificate). The `delete()` method is overridden to set `deleted_at` (or `revoked_at` for Certificate) instead of removing the record:
```typescript
async delete(documentId: string, params: any) {
  return super.update(documentId, {
    ...params,
    data: { ...params?.data, deleted_at: new Date() },
  });
}
```
Entities WITHOUT soft delete: Agenda, Analytics-Event, Attendance, Certificate-Config, Share-Art-Config, Comment, CommentReply, Event-Feedback, Link, Participant, Rate, Sw-Form, Tag, Team, Vote, Voting-Option, Voting-Session.

### Unlisted Events
`Event.unlisted` (boolean, default false) hides an event from the public listings while keeping its
direct link working. This repo only stores the flag — the filtering lives in `hub-community-bff`
(`resolvers/Event` excludes it from the `events` query unless `include_unlisted` is passed, and
`resolvers/Community` drops it from `Community.events`). Rows written before the field existed hold
NULL, which `unlisted = false` does not match in SQL, so
`database/migrations/2026-09-20-backfill-event-unlisted.js` backfills them.

### Slug Generation
Event and Community auto-generate unique slugs on `create()` and `update()` via `generateUniqueSlug()`:
- Uses `slugify` with `{ lower: true, strict: true, trim: true }`
- Max 100 characters, trailing hyphens removed after truncation
- Collision handling: appends `-2`, `-3`, etc.
- On update, excludes current entity from uniqueness check via `documentId: { $ne: entityId }`
- Throws `Error("Title is required to generate slug")` if title is missing

### Certificate issuing
`api::certificate` `create()` is idempotent per `(event, identifier, category)`: it returns the existing non-revoked certificate of that category instead of creating a duplicate, so the same person can hold one certificate as participante and another as mentor. Input validation via `validateIssueInput` (event required, 11-digit CPF). `code` is `RCT-` + 8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, allocated with collision retry (max 5). Pure logic lives in `services/certificate-helpers.ts` (tested). Components: `certificate.sponsor`, `certificate.signature`.

### Certificate categories
`Certificate.category`, `Participant.category` and `CertificateRequestForm.category` hold the label
the organizer typed ("Participante" — the default — "Organizador", "Mentor"…). Comparisons never use
the raw string: `src/utils/certificate-category.ts` normalizes it (`normalizeCategory`), builds an
accent- and case-insensitive key (`categoryKey`) and produces the Strapi filter (`categoryFilter`),
where the default category also matches the `NULL` left by every row written before the field
existed — so no backfill migration is needed. A `certificate-request-form` is the public link
(`/certificado/solicitar/<slug>`) for one category of one event; its `slug` is generated from the
event and the category by the service and is never regenerated on update, so a shared link keeps
working when the title or category is edited.

### Login by e-mail code (REA-26)
There is no password login in the Hub: the person types the e-mail, gets a 6-digit code and types it
back. `POST /api/login-code/request` (`{ email }` → `{ status: 'sent', code, expiresAt }` |
`cooldown` + `retryAfter` | `limit` | `blocked`) and `POST /api/login-code/verify` (`{ email, code }` →
`{ status: 'ok', jwt, user, created }` | `invalid` + `attemptsLeft` | `expired` | `blocked`) are
called only by the bff with the integration API token (no `auth` config, so no role has the scope);
the bff e-mails the code. `api::login-code` stores only `HMAC-SHA256(email:code)` (key
`LOGIN_CODE_SECRET`, else the users-permissions JWT secret), valid 10 min, 5 tries, one code per
minute and 10 a day per e-mail; a new code invalidates the previous one. A right code returns a
regular users-permissions JWT; an unknown e-mail gets its account created then (random unused
password, `confirmed: true`). Logging in with a code verifies the e-mail, so it sets
`password_pending: false`. Blocked accounts get neither a code nor a session. Pure logic in
`services/login-code-helpers.ts` (tested). The plugin's `/auth/local*`, forgot/reset-password routes
still exist but no client uses them any more.

### Custom "eu vou" art (REA-43)
`api::share-art-config` is one per event (`event` oneToOne, `Event.share_art_config` mappedBy), written
and read only by the bff with the integration token (granted to no role). Per format — `story` (9:16)
and `feed` (1:1) — it holds a background image (`<format>_background`) and the participant photo area
(`<format>_photo_area`, component `share-art.photo-area`): `x`, `y`, `width`, `height` as fractions of
the background (0–1, so the area does not depend on the image resolution) and `radius` from 0 (square
corners) to 1 (circle when the area is square: radius = `radius` × half of the smaller side). They are
`float` (double), not `decimal`: Strapi creates decimal columns as `decimal(10,2)`. The schema only
bounds each number to 0–1; the bff checks that the area fits inside the image and that each background
has its format's ratio. The art itself is drawn in the browser by hub-community-frontend.

### Account setup (signup without login)
`POST /api/account-setup` (`{ email, name?, phone? }` → `{ created, pending }`) is called only by the bff
with the integration API token: the route has no `auth` config, so its derived scope
`api::account-setup.account-setup.setup` is granted to no role (anonymous/JWT → 401/403, full-access
API token → allowed). It creates the account when missing (random unused password, `confirmed: true`,
`password_pending: true`) and says whether the account is still pending, for the bff's "conclua seu
cadastro" e-mail. `password_pending` now means "registration not finished: the e-mail was never
verified by a login code" (REA-22/REA-26); old accounts that created a password are already false.
`register()` in `src/index.ts` still wraps `auth.resetPassword` to clear it after an old reset link.
Pure logic lives in `services/account-setup-helpers.ts` (tested).

### Schema Validation
All validation is declarative in `schema.json` files — not in code. Patterns include:
- `required`, `unique`, `minLength`, `maxLength`, `min`, `max`
- `regex` for slug format: `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- `enum` for link types: WEB, LINKEDIN, GITHUB, INSTAGRAM, WHATSAPP, TELEGRAM, OTHER
- All content types have `draftAndPublish: false`

### Roles and permissions
`src/roles/definitions.ts` lists the users-permissions roles and their content-API actions:
`public`, `authenticated` (every user, the default), `community-manager` and `admin`. Both new roles
hold every `authenticated` action — the list plus whatever that role has in the database, e.g. the
plugin's `auth.changePassword` — because a user has one role and must not lose anything by moving.
What admin and community-manager may do in the Hub admin is decided in `hub-community-bff`
(`utils/auth`, by `role.type`), which works with the integration token.
`ensureRoles` (`src/roles/ensure-roles.ts`, plan logic tested) runs first in `bootstrap()`: it creates
missing roles (matched by `type`, so a role created by hand in the Strapi admin is reused) and grants
missing actions. It only adds: it never deletes a role or permission and never changes a user's role
— the first admin is assigned by hand (Content Manager → User → Role). `yarn roles:check` loads the
app with `ROLES_DRY_RUN=true`, which logs the plan and skips the rest of the bootstrap (loading Strapi
still syncs the schema, as any start does).
After `ensureRoles`, `applyInitialAssignments` (`src/roles/initial-assignments.ts`, plan logic tested)
promotes to `admin` the users whose e-mail is in `INITIAL_ADMIN_EMAILS`, and to `community-manager`
the users in `community.organizers` (non-deleted communities) still on `authenticated`. Each runs once —
applied e-mails and the organizers step are remembered in the plugin store `hub-roles` — so a role
changed later in the Hub admin is not undone by a restart; it never creates accounts nor demotes, and
each change is written to `role-change` with actor "migration". Logs mask e-mails.
`api::role-change` is granted to no role; only the bff (full-access API token) writes and reads it.
The same goes for the e-mail marketing collections (REA-29): `email-campaign`, `email-campaign-delivery`
(`key` = `<campaign documentId>:<email>`, unique, so nobody gets a campaign twice) and
`email-suppression` (unsubscribed e-mails, never sent a campaign). The user has `marketing_opt_in`
(accepted by `/auth/local/register`) and `marketing_opt_in_at`, stamped by a db lifecycle in
`bootstrap()` (`utils/marketing-opt-in`) and refused by the update guard.
`PUT /api/users/:id` (users-permissions `user.update`, granted to `authenticated`) has no ownership
check in the plugin; `register()` wraps it with `roles/user-update-guard`: with a user JWT only the
user's own record, and never `role`, `blocked`, `confirmed`, `provider`, tokens or `password_pending`.
API-token requests (the bff) are unchanged.

### Age rules (REA-36)
The Hub is 18+ only. Pure logic in `src/utils/age.ts` (age in São Paulo calendar days) and
`src/utils/age-review.ts`, applied by the user db lifecycle in `bootstrap()`:
- `adult_declaration` (accepted by `/auth/local/register`, written by the bff on every signup form) is
  the "tenho 18 anos ou mais" checkbox; `adult_declaration_at` is stamped by the lifecycle.
  `participant.adult_declaration_at` records it on certificate requests.
- `date_of_birth`, when written, must be a valid date of someone aged 18+ (users and participants),
  or the write answers 400 `ValidationError`. A date equal to the stored one is not re-checked, so
  old records stay editable.
- Age review, driven from the Hub admin (`/admin/usuarios`, bff): `age_review_status`
  `dob_requested` (e-mail asking for the date sent at `age_review_requested_at`), `dob_blocked`,
  `minor_blocked`, plus `age_review_blocked_at`. A valid date sent while `dob_requested` clears the
  request. `config/cron-tasks.ts` (`ageReviewBlock`, hourly) blocks (`blocked: true`) the accounts
  still without a date 7 days after the e-mail; only accounts the admin e-mailed are ever
  `dob_requested`, so a deploy blocks nobody. `AGE_REVIEW_AUTO_BLOCK=false` turns it off.
  All these fields are refused by the update guard for user JWTs.

### Bootstrap
`src/index.ts` configures password reset email on startup. Sets reset URL to `${PUBLIC_URL}/admin/auth/reset-password` and stores it in the users-permissions plugin store.

## Entity Relationships

### Event
- has many: talks, agenda, comments
- belongs to: location (manyToOne)
- many-to-many: tags, communities

### Community
- has one: location
- has many: links, comments
- many-to-many: events, tags, organizers (User)

### Talk
- belongs to: event
- many-to-many: speakers
- has many: comments

### Speaker
- has one: user (users_permissions_user)
- has many: socials (Link)
- many-to-many: talks

### Location
- has one: community
- has many: events

### Agenda
- belongs to: user, event
- has many: talks

### Comment
- belongs to: event, talk, community (polymorphic-like via separate relations)
- has one: user_creator
- has many: comment_replies, users_tagged

### Rate
- has one: user, talk, event
- value: integer 1-5

### Tag
- many-to-many: events, communities

### Link
- belongs to: community
- social_media enum: WEB | LINKEDIN | GITHUB | INSTAGRAM | WHATSAPP | TELEGRAM | OTHER

## API Configuration
- Default pagination limit: 25
- Max pagination limit: 100
- Count included in responses (`withCount: true`)

## Environment Variables
See `.env.example` for the full list. Key groups:
- **Server**: HOST, PORT, APP_KEYS, PUBLIC_URL
- **Database**: DATABASE_CLIENT, DATABASE_HOST/PORT/NAME/USERNAME/PASSWORD, DATABASE_FILENAME (SQLite)
- **Auth**: ADMIN_JWT_SECRET, API_TOKEN_SALT, TRANSFER_TOKEN_SALT
- **Email**: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_DEFAULT_FROM, EMAIL_DEFAULT_REPLY_TO

## Testing
- Framework: Vitest 4.x
- Test files co-located with services: `src/api/{entity}/services/{entity}.test.ts`
- Mock pattern: create mock strapi with `vi.fn()` for `entityService.findMany`
- Current coverage: slug generation for events (special chars, truncation, duplicates, edge cases); certificate code/idempotency helpers

## Git Conventions
- Mix of conventional commits (`feat:`, `fix:`) and informal messages
- No pre-commit hooks, linting config, or CI/CD enforced
- Package manager: Yarn (lockfile: yarn.lock)
