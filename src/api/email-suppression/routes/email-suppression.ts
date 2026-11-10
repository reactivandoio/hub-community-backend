/**
 * email-suppression route — read and written by the bff only (integration API token), REA-29
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::email-suppression.email-suppression' as any);
