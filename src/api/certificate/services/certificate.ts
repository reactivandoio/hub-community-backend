/**
 * certificate service
 *
 * create() is idempotent per (event, identifier): re-issuing returns the existing
 * non-revoked certificate. delete() soft-deletes via revoked_at.
 */

import { factories } from '@strapi/strapi';
import {
  allocateUniqueCode,
  findActiveCertificate,
  normalizeIdentifier,
} from './certificate-helpers';

export default factories.createCoreService('api::certificate.certificate', ({ strapi }) => ({
  async create(params: any) {
    const data = params?.data || {};
    const identifier = normalizeIdentifier(data.identifier);
    const eventDocumentId = typeof data.event === 'string' ? data.event : data.event?.documentId;

    if (!eventDocumentId) {
      throw new Error('Evento é obrigatório para emitir um certificado');
    }
    if (identifier.length !== 11) {
      throw new Error('CPF inválido: informe 11 dígitos');
    }

    const existing = await findActiveCertificate(strapi, eventDocumentId, identifier);
    if (existing) {
      return existing;
    }

    const code = await allocateUniqueCode(strapi);

    return super.create({
      ...params,
      data: {
        ...data,
        identifier,
        code,
        issued_at: data.issued_at || new Date(),
      },
    });
  },

  async delete(documentId: string, params: any) {
    return super.update(documentId, {
      ...params,
      data: {
        ...params?.data,
        revoked_at: new Date(),
      },
    });
  },
}));
