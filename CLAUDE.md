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
| `yarn vitest` | Run tests |
| `make start` | Start with PM2 |
| `make refresh` | Pull + install + restart (PM2) |
| `make update` | Pull + install + build + restart (PM2) |

## Project Structure

```
config/             # Server, database, API, middleware, plugin, admin config
database/migrations # Database migration scripts
public/             # Static assets
src/
  api/              # API modules (22 entities)
    agenda/         # User event agendas
    analytics-event/    # Tracking events
    attendance/         # Lista de presença (user × event)
    certificate/        # Issued participation certificates (unique code, idempotent per event+CPF)
    certificate-config/ # Per-event certificate template (sponsors, signatures, text)
    certificate-request-form/ # Public per-category certificate request form of an event
    comment/        # Comments on events/talks/communities
    comment-reply/  # Threaded comment replies
    community/      # Communities with organizers, tags, events
    event/          # Events with talks, tags, location
    event-feedback/     # Post-event NPS survey
    link/           # Social media links
    location/       # Geographic locations (lat/lng)
    participant/        # Certificate requests filled in on a certificate-request-form, by category
    rate/           # Ratings (1-5) on talks/events
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
Entities WITHOUT soft delete: Agenda, Analytics-Event, Attendance, Certificate-Config, Comment, CommentReply, Event-Feedback, Link, Participant, Rate, Sw-Form, Tag, Team, Vote, Voting-Option, Voting-Session.

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

### Schema Validation
All validation is declarative in `schema.json` files — not in code. Patterns include:
- `required`, `unique`, `minLength`, `maxLength`, `min`, `max`
- `regex` for slug format: `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- `enum` for link types: WEB, LINKEDIN, GITHUB, INSTAGRAM, WHATSAPP, TELEGRAM, OTHER
- All content types have `draftAndPublish: false`

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
