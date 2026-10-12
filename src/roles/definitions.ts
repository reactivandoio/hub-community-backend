/**
 * The users-permissions roles of the Hub and the content-API actions each one holds.
 *
 * `ensureRoles` (./ensure-roles) applies this on every start: it creates the roles that are
 * missing and grants the actions a role lacks. It never removes a role, a permission or a
 * user's role, so a permission granted by hand in the Strapi admin survives.
 *
 * A user has exactly one role. `admin` and `community-manager` hold every action of
 * `authenticated` — the list below and whatever that role has in the database, such as the
 * plugin's own defaults (`auth.changePassword`) — so moving someone into them never takes away
 * what they could already do.
 * What makes them different is decided by the bff (utils/auth), which does the admin work
 * with the integration token: `admin` sees and does everything and assigns roles;
 * `community-manager` enters /admin and manages only the communities it organizes
 * (`community.organizers`) and their events.
 */

export type RoleDefinition = {
  type: string;
  name: string;
  description: string;
  actions: readonly string[];
  /** Also holds every action this role has in the database (plugin defaults, grants by hand). */
  inheritsFrom?: string;
};

export const PUBLIC_ACTIONS = [
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
] as const;

export const AUTHENTICATED_ACTIONS = [
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
] as const;

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    type: 'public',
    name: 'Public',
    description: 'Default role given to unauthenticated user.',
    actions: PUBLIC_ACTIONS,
  },
  {
    type: 'authenticated',
    name: 'Authenticated',
    description: 'Default role given to authenticated user.',
    actions: AUTHENTICATED_ACTIONS,
  },
  {
    type: 'community-manager',
    name: 'Community Manager',
    description: 'Manages, in the Hub admin, the communities they organize and their events.',
    actions: AUTHENTICATED_ACTIONS,
    inheritsFrom: 'authenticated',
  },
  {
    type: 'admin',
    name: 'Admin',
    description: 'Hub administrator: sees and does everything in the Hub admin and assigns roles.',
    actions: AUTHENTICATED_ACTIONS,
    inheritsFrom: 'authenticated',
  },
];

/** Roles the Hub admin may assign to a user (the bff keeps the same list). */
export const ASSIGNABLE_ROLE_TYPES = ['authenticated', 'community-manager', 'admin'] as const;
