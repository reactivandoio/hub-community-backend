/**
 * ai-text-run service — read and written by the bff only (integration API token), REA-51
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::ai-text-run.ai-text-run' as any);
