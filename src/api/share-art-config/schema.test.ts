import { describe, expect, it } from 'vitest';
import config from './content-types/share-art-config/schema.json';
import event from '../event/content-types/event/schema.json';
import area from '../../components/share-art/photo-area.json';

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
