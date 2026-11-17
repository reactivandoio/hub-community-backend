/**
 * user-merge controller (REA-96)
 *
 * Called only by the bff (integration API token), after it checked the request user is an admin.
 */

import { MergeRefusedError } from '../../../utils/user-merge';

const idOf = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const pairOf = (source: any) => ({
  keepId: idOf(source?.keep),
  dropId: idOf(source?.drop),
  actorId: idOf(source?.actor),
});

const service = () => strapi.service('api::user-merge.user-merge');

export default {
  async duplicates(ctx: any) {
    ctx.body = await service().duplicates();
  },

  async preview(ctx: any) {
    const { keepId, dropId, actorId } = pairOf(ctx.query);
    if (!keepId || !dropId) return ctx.badRequest('keep e drop são obrigatórios');
    ctx.body = await service().preview({ keepId, dropId, actorId });
  },

  async merge(ctx: any) {
    const { keepId, dropId, actorId } = pairOf(ctx.request.body);
    if (!keepId || !dropId) return ctx.badRequest('keep e drop são obrigatórios');
    try {
      ctx.body = await service().merge({ keepId, dropId, actorId });
    } catch (err) {
      if (err instanceof MergeRefusedError) return ctx.badRequest(err.message, { reasons: err.reasons });
      throw err;
    }
  },
};
