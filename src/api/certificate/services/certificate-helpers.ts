/**
 * Pure helpers for the certificate service — kept separate so they can be unit tested
 * without booting Strapi.
 */

export const CODE_PREFIX = 'RCT-';
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const MAX_CODE_ATTEMPTS = 5;

const CERTIFICATE_UID = 'api::certificate.certificate';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Identifier = CPF (digits only) or, when there is no CPF, a normalized e-mail
 * (trimmed, lower-case). The idempotency key is (event, identifier).
 */
export function normalizeIdentifier(value: string): string {
  const raw = value || '';
  if (raw.includes('@')) {
    return raw.trim().toLowerCase();
  }
  return raw.replace(/\D/g, '');
}

export function isEmailIdentifier(value: string): boolean {
  return EMAIL_PATTERN.test(value || '');
}

export function generateCode(random: () => number = Math.random): string {
  let body = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const index = Math.floor(random() * CODE_ALPHABET.length);
    body += CODE_ALPHABET[index];
  }
  return `${CODE_PREFIX}${body}`;
}

export function validateIssueInput(data: {
  event?: any;
  identifier?: string;
}): { eventDocumentId: string; identifier: string } {
  const eventDocumentId =
    typeof data.event === 'string' ? data.event : data.event?.documentId;
  const identifier = normalizeIdentifier(data.identifier);

  if (!eventDocumentId) {
    throw new Error('Evento é obrigatório para emitir um certificado');
  }
  const isCpf = !identifier.includes('@') && identifier.length === 11;
  if (!isCpf && !isEmailIdentifier(identifier)) {
    throw new Error('Identificador inválido: informe um CPF com 11 dígitos ou um e-mail');
  }

  return { eventDocumentId, identifier };
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
