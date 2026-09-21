/**
 * certificate-request-form service
 *
 * The slug is what the public link carries (/certificado/solicitar/<slug>), so it is
 * derived from the event and the category and kept unique, the same way events do it.
 */

import { factories } from '@strapi/strapi';

import { generateUniqueSlug } from '../../../utils/slug';
import { normalizeCategory } from '../../../utils/certificate-category';

const UID = 'api::certificate-request-form.certificate-request-form';

const slugSeed = (data: any, event: any) => {
  const eventPart = event?.slug || event?.title || '';
  return `${eventPart} ${normalizeCategory(data?.category)}`.trim();
};

const loadEvent = async (strapi: any, data: any) => {
  const documentId = typeof data?.event === 'string' ? data.event : data?.event?.documentId;
  if (!documentId) return null;
  return strapi.documents('api::event.event').findOne({ documentId });
};

export default factories.createCoreService(UID, ({ strapi }) => ({
  async create(params: any) {
    const data = { ...(params?.data || {}) };
    data.category = normalizeCategory(data.category);
    if (!data.slug) {
      const event = await loadEvent(strapi, data);
      data.slug = await generateUniqueSlug(strapi, UID, slugSeed(data, event));
    }
    return super.create({ ...params, data });
  },

  async update(documentId: string, params: any) {
    const data = { ...(params?.data || {}) };
    if (data.category !== undefined) data.category = normalizeCategory(data.category);
    return super.update(documentId, { ...params, data });
  },
}));
