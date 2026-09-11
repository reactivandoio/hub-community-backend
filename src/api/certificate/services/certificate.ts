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
  validateIssueInput,
} from './certificate-helpers';

export default factories.createCoreService('api::certificate.certificate', ({ strapi }) => ({
  async create(params: any) {
    const data = params?.data || {};
    const { eventDocumentId, identifier } = validateIssueInput(data);

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
