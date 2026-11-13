import { describe, expect, it } from 'vitest';
import config from './content-types/share-art-config/schema.json';
import event from '../event/content-types/event/schema.json';
import area from '../../components/share-art/photo-area.json';
import text from '../../components/share-art/text-area.json';
import productRole from '../../components/share-art/product-role.json';

// REA-43: arte "eu vou" personalizada. Strapi only fails at boot when a relation side is missing,
// so the shape the bff relies on is pinned here.
describe('share-art-config schema', () => {
  it('is a one-to-one with the event on both sides', () => {
    expect(config.attributes.event).toMatchObject({
      relation: 'oneToOne',
      target: 'api::event.event',
      inversedBy: 'share_art_config',
    });
    expect((event.attributes as Record<string, unknown>).share_art_config).toMatchObject({
      relation: 'oneToOne',
      target: 'api::share-art-config.share-art-config',
      mappedBy: 'event',
    });
  });

  it('has one image background and one photo area per format', () => {
    for (const format of ['story', 'feed'] as const) {
      expect(config.attributes[`${format}_background`]).toMatchObject({
        type: 'media',
        multiple: false,
        allowedTypes: ['images'],
      });
      expect(config.attributes[`${format}_photo_area`]).toMatchObject({
        type: 'component',
        repeatable: false,
        component: 'share-art.photo-area',
      });
    }
  });

  // `float` (double), not `decimal`: Strapi creates decimal columns as decimal(10,2), which would
  // round 0.123 to 0.12 and move the area by a few pixels on a 1080px image.
  it('keeps the photo area in fractions of the image (0 to 1), never pixels', () => {
    for (const key of ['x', 'y', 'width', 'height', 'radius'] as const) {
      expect(area.attributes[key]).toMatchObject({ type: 'float', required: true, min: 0, max: 1 });
    }
  });
});

// REA-45: the organizer opens the art to people who are not signed up. Off unless set, so every
// existing event keeps the art for its signups only.
describe('event.share_art_open', () => {
  it('is a boolean that defaults to false', () => {
    expect((event.attributes as Record<string, unknown>).share_art_open).toEqual({
      type: 'boolean',
      default: false,
    });
  });
});

// REA-47: the name and the role of the person on the art, and the role per product of the Eventando.
describe('share-art-config texts and roles', () => {
  it('has one name area and one role area per format, both optional', () => {
    for (const format of ['story', 'feed'] as const) {
      for (const kind of ['name', 'role'] as const) {
        expect((config.attributes as Record<string, unknown>)[`${format}_${kind}_text`]).toEqual({
          type: 'component',
          repeatable: false,
          component: 'share-art.text-area',
        });
      }
    }
  });

  it('keeps the text area in fractions of the image (float, 0 to 1) like the photo area', () => {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(text.attributes[key]).toMatchObject({ type: 'float', required: true, min: 0, max: 1 });
    }
    // The size is a fraction of the image width, so it does not depend on the resolution either.
    expect(text.attributes.size).toMatchObject({ type: 'float', required: true, min: 0.01, max: 0.2 });
  });

  it('limits font, color and alignment to what the art draws', () => {
    expect(text.attributes.font.enum).toEqual([
      'inter', 'inter_bold', 'serif', 'serif_bold', 'dancing_script', 'great_vibes', 'allura',
    ]);
    expect(text.attributes.align.enum).toEqual(['left', 'center', 'right']);
    const color = new RegExp(text.attributes.color.regex);
    expect(color.test('#ffffff')).toBe(true);
    expect(color.test('#FF00aa')).toBe(true);
    expect(color.test('red')).toBe(false);
    expect(color.test('#fff')).toBe(false);
  });

  it('maps products to roles, with "Participante" as the default role', () => {
    expect((config.attributes as Record<string, unknown>).product_roles).toEqual({
      type: 'component',
      repeatable: true,
      component: 'share-art.product-role',
    });
    expect(productRole.attributes.product_id).toMatchObject({ type: 'string', required: true });
    expect(productRole.attributes.role).toMatchObject({ type: 'string', required: true, maxLength: 40 });
    expect((config.attributes as Record<string, unknown>).default_role).toEqual({
      type: 'string',
      maxLength: 40,
      default: 'Participante',
    });
  });
});
