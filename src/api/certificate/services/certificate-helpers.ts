/**
 * Pure helpers for the certificate service — kept separate so they can be unit tested
 * without booting Strapi.
 */

export const CODE_PREFIX = 'RCT-';
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const MAX_CODE_ATTEMPTS = 5;

const CERTIFICATE_UID = 'api::certificate.certificate';

export function normalizeIdentifier(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function generateCode(random: () => number = Math.random): string {
  let body = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const index = Math.floor(random() * CODE_ALPHABET.length);
    body += CODE_ALPHABET[index];
  }
  return `${CODE_PREFIX}${body}`;
}

export async function findActiveCertificate(
  strapi: any,
  eventDocumentId: string,
  identifier: string,
): Promise<any | null> {
  const existing = await strapi.documents(CERTIFICATE_UID).findFirst({
    filters: {
      event: { documentId: { $eq: eventDocumentId } },
      identifier: { $eq: normalizeIdentifier(identifier) },
      revoked_at: { $null: true },
    },
    populate: ['event'],
  });
  return existing || null;
}

export async function allocateUniqueCode(
  strapi: any,
  random: () => number = Math.random,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateCode(random);
    const taken = await strapi.documents(CERTIFICATE_UID).findFirst({
      filters: { code: { $eq: code } },
    });
    if (!taken) return code;
  }
  throw new Error('Não foi possível gerar um código único para o certificado');
}
