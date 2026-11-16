/**
 * termhub-credential controller — read and written by the bff only (integration API token), REA-51
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::termhub-credential.termhub-credential' as any);
