import { describe, expect, it } from 'vitest';
import credential from './content-types/termhub-credential/schema.json';
import run from '../ai-text-run/content-types/ai-text-run/schema.json';
import { ROLE_DEFINITIONS } from '../../roles/definitions';

// REA-51: the termhub token of each admin user and the AI text runs. Both are bff-only: no role
// has them, and the bff reads them with the integration token.
describe('termhub-credential schema', () => {
  const attrs = credential.attributes as Record<string, any>;

  it('is one per user', () => {
    expect(attrs.user_id).toMatchObject({ type: 'integer', required: true, unique: true });
  });

  // Only the ciphertext: the key (TERMHUB_TOKEN_KEY) lives in the bff, so a copy of the database
  // does not open the token. Not `private`, or the bff (REST, integration token) could not read it.
  it('keeps the token only encrypted, plus a hint, and the termhub project', () => {
    expect(attrs.token_ciphertext).toMatchObject({ type: 'text', required: true });
    expect(attrs.token).toBeUndefined();
    expect(attrs.token_hint).toMatchObject({ type: 'string' });
    expect(attrs.project).toMatchObject({ type: 'string', required: true });
    expect(attrs.verified_at).toMatchObject({ type: 'datetime' });
  });
});

describe('ai-text-run schema', () => {
  const attrs = run.attributes as Record<string, any>;

  it('is unique per idempotency key and tied to a user, an event and a campaign type', () => {
    expect(attrs.idempotency_key).toMatchObject({ type: 'string', required: true, unique: true });
    expect(attrs.user_id).toMatchObject({ type: 'integer', required: true });
    expect(attrs.event_document_id).toMatchObject({ type: 'string', required: true });
    expect(attrs.campaign_type.enum).toEqual(['invite', 'share', 'reminder']);
  });

  it('follows the termhub run states', () => {
    expect(attrs.status.enum).toEqual(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
  });
});

describe('roles', () => {
  it('grant neither collection to anyone (bff only)', () => {
    const text = JSON.stringify(ROLE_DEFINITIONS);
    expect(text).not.toContain('termhub-credential');
    expect(text).not.toContain('ai-text-run');
  });
});
