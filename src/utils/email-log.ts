import { randomUUID } from 'crypto';

/**
 * REA-52: every e-mail the Hub sends has a row in `api::email-campaign-delivery` (the same table the
 * bff writes for campaigns and transactional e-mails), so the admin sees a person's whole e-mail
 * history and the daily/monthly quota counts them all. This builds the row of an e-mail Strapi sent
 * itself (e.g. the Startup Weekend form): key `strapi:<kind>:<uuid>`, pseudo campaign
 * `strapi:<kind>`, and the Mailgun message id so its delivery events reach it.
 */

export const DELIVERY_UID = 'api::email-campaign-delivery.email-campaign-delivery';

/** "<abc@mg.x>" → "abc@mg.x": Mailgun's events carry the id without the angle brackets. */
export const normalizeMessageId = (value: unknown): string | null => {
  const id = String(value ?? '').trim().replace(/^<|>$/g, '');
  return id || null;
};

export type StrapiEmailResult = { messageId?: string } | null | undefined;

export const strapiDelivery = ({
  kind, to, subject, result, error, now = new Date(), uuid = randomUUID(),
}: {
  kind: string;
  to: string;
  subject?: string | null;
  result?: StrapiEmailResult;
  error?: unknown;
  now?: Date;
  uuid?: string;
}) => {
  const failed = error !== undefined && error !== null;
  return {
    key: `strapi:${kind}:${uuid}`,
    campaign_document_id: `strapi:${kind}`,
    kind,
    email: String(to || '').trim().toLowerCase(),
    subject: subject ? String(subject).slice(0, 255) : null,
    status: failed ? 'failed' : 'sent',
    error: failed ? String((error as Error)?.message || error) : null,
    message_id: failed ? null : normalizeMessageId(result?.messageId),
    sent_at: now.toISOString(),
  };
};

/** Records it; never fails the caller (a lost row only leaves a gap in the history). */
export const recordStrapiEmail = async (strapi: any, row: ReturnType<typeof strapiDelivery>) => {
  try {
    await strapi.documents(DELIVERY_UID).create({ data: row });
  } catch (err) {
    strapi.log.error(`[email-log] could not record ${row.key}: ${(err as Error).message}`);
  }
};
