/**
 * REA-56: takes the personal fields out of content-API reads that are not the BFF's.
 * The rule and the list of fields are in src/utils/personal-data.
 */
import { isPlainObject, shouldHidePersonalData, stripPersonalData } from '../utils/personal-data';

export default () => async (ctx: any, next: () => Promise<void>) => {
  await next();
  if (shouldHidePersonalData(ctx) && (Array.isArray(ctx.body) || isPlainObject(ctx.body))) {
    ctx.body = stripPersonalData(ctx.body);
  }
};
