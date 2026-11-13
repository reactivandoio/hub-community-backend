import { describe, expect, it } from 'vitest';
import invite from './content-types/management-invite/schema.json';
import event from '../event/content-types/event/schema.json';
import user from '../../extensions/users-permissions/content-types/user/schema.json';
import { ASSIGNABLE_ROLE_TYPES, ROLE_DEFINITIONS } from '../../roles/definitions';
import { PROTECTED_USER_FIELDS } from '../../roles/user-update-guard';

// REA-48: invites to organize a community or manage an event, event managers and the
// event-manager role. Strapi only fails at boot when a relation side is missing, so the shape the
// bff relies on is pinned here.
describe('management-invite schema', () => {
  const attrs = invite.attributes as Record<string, any>;

  it('is one of two kinds, for one e-mail', () => {
    expect(attrs.kind).toMatchObject({ type: 'enumeration', enum: ['community_organizer', 'event_manager'], required: true });
    expect(attrs.email).toMatchObject({ type: 'email', required: true });
  });

  // Not `private`: Strapi refuses filtering on a private field ("Invalid key token_hash"), and the
  // bff finds the invite of a link by its hash. Nobody but the bff reads this collection (no role has
  // it), and the field holds only the hash, never the token.
  it('keeps only the hash of the token, unique, and filterable by the bff', () => {
    expect(attrs.token_hash).toMatchObject({ type: 'string', required: true, unique: true });
    expect(attrs.token_hash.private).toBeUndefined();
    expect(attrs.token).toBeUndefined();
  });

  it('expires, is used once (accepted_at / accepted_by) and can be revoked', () => {
    expect(attrs.expires_at).toMatchObject({ type: 'datetime', required: true });
    expect(attrs.accepted_at).toMatchObject({ type: 'datetime' });
    expect(attrs.accepted_by).toMatchObject({ relation: 'manyToOne', target: 'plugin::users-permissions.user' });
    expect(attrs.revoked_at).toMatchObject({ type: 'datetime' });
  });

  it('points to the community or the event, and to who invited', () => {
    expect(attrs.community).toMatchObject({ relation: 'manyToOne', target: 'api::community.community' });
    expect(attrs.event).toMatchObject({ relation: 'manyToOne', target: 'api::event.event' });
    expect(attrs.invited_by).toMatchObject({ relation: 'manyToOne', target: 'plugin::users-permissions.user' });
  });
});

describe('event managers', () => {
  it('is a many-to-many between events and users, on both sides', () => {
    expect((event.attributes as Record<string, unknown>).managers).toEqual({
      type: 'relation',
      relation: 'manyToMany',
      target: 'plugin::users-permissions.user',
      inversedBy: 'managed_events',
    });
    expect((user.attributes as Record<string, unknown>).managed_events).toEqual({
      type: 'relation',
      relation: 'manyToMany',
      target: 'api::event.event',
      mappedBy: 'managers',
    });
  });

  it('cannot be changed by the user through PUT /api/users (nor the communities they organize)', () => {
    expect(PROTECTED_USER_FIELDS).toContain('managed_events');
    expect(PROTECTED_USER_FIELDS).toContain('communities');
  });
});

describe('event-manager role', () => {
  it('exists between authenticated and community-manager, with the authenticated actions', () => {
    const types = ROLE_DEFINITIONS.map((role) => role.type);
    expect(types.indexOf('event-manager')).toBeGreaterThan(types.indexOf('authenticated'));
    expect(types.indexOf('event-manager')).toBeLessThan(types.indexOf('community-manager'));
    expect(ROLE_DEFINITIONS.find((role) => role.type === 'event-manager')).toMatchObject({
      name: 'Event Manager',
      inheritsFrom: 'authenticated',
    });
  });

  it('can be assigned in the Hub admin', () => {
    expect(ASSIGNABLE_ROLE_TYPES).toEqual(['authenticated', 'event-manager', 'community-manager', 'admin']);
  });
});
