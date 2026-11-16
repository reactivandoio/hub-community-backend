export default [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:'],
          'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', '*'],
          'media-src': ["'self'", 'data:', 'blob:', '*'],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer-when-downgrade' },
      xRobotsTag: false,
    },
  },
  {
    name: 'strapi::cors',
    config: {
      origin: '*',
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  {
    name: 'strapi::body',
    config: {
      multipart: true,
      formidable: {
        maxFileSize: 250 * 1024 * 1024, // 250MB for video uploads
      },
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
  // REA-56: personal fields never leave a read that is not the BFF's (src/middlewares).
  'global::hide-personal-data',
];
