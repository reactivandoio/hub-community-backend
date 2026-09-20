/**
 * event service
 */

import { factories } from "@strapi/strapi";

import { generateUniqueSlug } from "../../../utils/slug";

export default factories.createCoreService(
  "api::event.event",
  ({ strapi }) => ({
    async create(params: any) {
      // Generate slug before create if not provided
      if (params.data.title && !params.data.slug) {
        params.data.slug = await generateUniqueSlug(
          strapi,
          "api::event.event",
          params.data.title,
        );
      }

      return super.create(params);
    },

    async update(documentId: string, params: any) {
      // Regenerate slug if title changed and slug not explicitly set
      if (params.data.title && !params.data.slug) {
        params.data.slug = await generateUniqueSlug(
          strapi,
          "api::event.event",
          params.data.title,
          documentId,
        );
      }

      return super.update(documentId, params);
    },

    async delete(documentId: string, params: any) {
      return super.update(documentId, {
        ...params,
        data: {
          ...params?.data,
          deleted_at: new Date(),
        },
      });
    },
  }),
);
