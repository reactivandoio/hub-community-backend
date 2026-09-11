import { describe, it, expect, vi } from 'vitest';
import {
  CODE_ALPHABET,
  CODE_PREFIX,
  normalizeIdentifier,
  generateCode,
  findActiveCertificate,
  allocateUniqueCode,
  validateIssueInput,
} from './certificate-helpers';

const createMockStrapi = (findFirst = vi.fn()) => ({
  documents: vi.fn(() => ({ findFirst })),
  findFirst,
});

describe('normalizeIdentifier', () => {
  it('keeps only digits', () => {
    expect(normalizeIdentifier('123.456.789-09')).toBe('12345678909');
  });
  it('handles empty and undefined', () => {
    expect(normalizeIdentifier('')).toBe('');
    expect(normalizeIdentifier(undefined as any)).toBe('');
  });
});

describe('generateCode', () => {
  it('has prefix and 8 chars from the alphabet', () => {
    const code = generateCode();
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    const body = code.slice(CODE_PREFIX.length);
    expect(body).toHaveLength(8);
    for (const ch of body) expect(CODE_ALPHABET).toContain(ch);
  });
  it('never contains ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).not.toMatch(/[0O1I]/);
    }
  });
  it('is deterministic given the random source', () => {
    const zero = () => 0;
    expect(generateCode(zero)).toBe('RCT-AAAAAAAA');
  });
});

describe('validateIssueInput', () => {
  it('resolves eventDocumentId and identifier when event is a string', () => {
    const result = validateIssueInput({ event: 'ev1', identifier: '12345678909' });
    expect(result).toEqual({ eventDocumentId: 'ev1', identifier: '12345678909' });
  });

  it('resolves eventDocumentId from an object and normalizes a masked CPF', () => {
    const result = validateIssueInput({
      event: { documentId: 'ev1' },
      identifier: '123.456.789-09',
    });
    expect(result).toEqual({ eventDocumentId: 'ev1', identifier: '12345678909' });
  });

  it('throws the event error when event is missing', () => {
    expect(() => validateIssueInput({ identifier: '12345678909' })).toThrow(
      'Evento é obrigatório para emitir um certificado',
    );
  });

  it('throws the CPF error for 10 digits', () => {
    expect(() => validateIssueInput({ event: 'ev1', identifier: '1234567890' })).toThrow(
      'CPF inválido: informe 11 dígitos',
    );
  });

  it('throws the CPF error for a masked value that normalizes to fewer than 11 digits', () => {
    expect(() => validateIssueInput({ event: 'ev1', identifier: '123.456.789' })).toThrow(
      'CPF inválido: informe 11 dígitos',
    );
  });
});

describe('findActiveCertificate', () => {
  it('queries by event documentId, normalized identifier and revoked_at null', async () => {
    const strapi = createMockStrapi(vi.fn().mockResolvedValue({ documentId: 'c1' }));
    const result = await findActiveCertificate(strapi, 'ev1', '123.456.789-09');
    expect(result).toEqual({ documentId: 'c1' });
    expect(strapi.documents).toHaveBeenCalledWith('api::certificate.certificate');
    expect(strapi.findFirst).toHaveBeenCalledWith({
      filters: {
        event: { documentId: { $eq: 'ev1' } },
        identifier: { $eq: '12345678909' },
        revoked_at: { $null: true },
      },
      populate: ['event'],
    });
  });
  it('returns null when nothing found', async () => {
    const strapi = createMockStrapi(vi.fn().mockResolvedValue(null));
    expect(await findActiveCertificate(strapi, 'ev1', '1')).toBeNull();
  });
});

describe('allocateUniqueCode', () => {
  it('returns the first free code', async () => {
    const strapi = createMockStrapi(vi.fn().mockResolvedValue(null));
    const code = await allocateUniqueCode(strapi, () => 0);
    expect(code).toBe('RCT-AAAAAAAA');
    expect(strapi.findFirst).toHaveBeenCalledWith({ filters: { code: { $eq: 'RCT-AAAAAAAA' } } });
  });
  it('retries on collision', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ documentId: 'taken' })
      .mockResolvedValueOnce(null);
    const strapi = createMockStrapi(findFirst);
    const code = await allocateUniqueCode(strapi);
    expect(code).toMatch(/^RCT-[A-Z2-9]{8}$/);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
  it('throws after 5 collisions', async () => {
    const strapi = createMockStrapi(vi.fn().mockResolvedValue({ documentId: 'taken' }));
    await expect(allocateUniqueCode(strapi)).rejects.toThrow(
      'Não foi possível gerar um código único para o certificado',
    );
    expect(strapi.findFirst).toHaveBeenCalledTimes(5);
  });
});
