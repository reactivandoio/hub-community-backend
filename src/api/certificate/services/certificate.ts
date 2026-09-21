/**
 * certificate service
 *
 * create() is idempotent per (event, identifier, category): re-issuing returns the
 * existing non-revoked certificate of that category, so the same person can hold one
 * certificate as participante and another as mentor. delete() soft-deletes via revoked_at.
 */

import { factories } from '@strapi/strapi';
import {
  allocateUniqueCode,
  findActiveCertificate,
  validateIssueInput,
} from './certificate-helpers';

export default factories.createCoreService('api::certificate.certificate', ({ strapi }) => ({
  async create(params: any) {
    const data = params?.data || {};
    const { eventDocumentId, identifier, category } = validateIssueInput(data);

    const existing = await findActiveCertificate(strapi, eventDocumentId, identifier, category);
    if (existing) {
      return existing;
    }

    const code = await allocateUniqueCode(strapi);

    return super.create({
      ...params,
      data: {
        ...data,
        identifier,
        category,
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
