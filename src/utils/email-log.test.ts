import { describe, expect, it, vi } from 'vitest';

import { normalizeMessageId, recordStrapiEmail, strapiDelivery } from './email-log';

const NOW = new Date('2026-11-16T03:00:00.000Z');

describe('strapiDelivery (REA-52)', () => {
  it('records a sent e-mail with its Mailgun id, without the brackets', () => {
    expect(strapiDelivery({
      kind: 'sw-form', to: ' Ana@X.io ', subject: 'Inscrição recebida', result: { messageId: '<abc@mg.hub>' }, now: NOW, uuid: 'u1',
    })).toEqual({
      key: 'strapi:sw-form:u1',
      campaign_document_id: 'strapi:sw-form',
      kind: 'sw-form',
      email: 'ana@x.io',
      subject: 'Inscrição recebida',
      status: 'sent',
      error: null,
      message_id: 'abc@mg.hub',
      sent_at: NOW.toISOString(),
    });
  });

  it('records a refused one with the error', () => {
    const row = strapiDelivery({ kind: 'sw-form', to: 'a@x.io', error: new Error('421 limit'), now: NOW, uuid: 'u2' });
    expect(row).toMatchObject({ status: 'failed', error: '421 limit', message_id: null });
  });

  it('normalizes message ids', () => {
    expect(normalizeMessageId('<a@b>')).toBe('a@b');
    expect(normalizeMessageId('a@b')).toBe('a@b');
    expect(normalizeMessageId('')).toBeNull();
    expect(normalizeMessageId(undefined)).toBeNull();
  });
});

describe('recordStrapiEmail', () => {
  it('never throws', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const strapi = { documents: () => ({ create }), log: { error: vi.fn() } };
    const row = strapiDelivery({ kind: 'sw-form', to: 'a@x.io', now: NOW, uuid: 'u3' });
    await expect(recordStrapiEmail(strapi, row)).resolves.toBeUndefined();
    expect(strapi.log.error).toHaveBeenCalled();
  });
});
