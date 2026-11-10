/**
 * email-campaign controller — read and written by the bff only (integration API token), REA-29
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::email-campaign.email-campaign' as any);
