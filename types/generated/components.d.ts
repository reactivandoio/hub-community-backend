import type { Schema, Struct } from '@strapi/strapi';

export interface CertificateSignature extends Struct.ComponentSchema {
  collectionName: 'components_certificate_signatures';
  info: {
    description: 'Assinatura (nome, cargo e imagem ou texto cursivo opcional) no certificado';
    displayName: 'Signature';
  };
  attributes: {
    font: Schema.Attribute.Enumeration<
      ['great_vibes', 'allura', 'dancing_script']
    > &
      Schema.Attribute.DefaultTo<'great_vibes'>;
    image: Schema.Attribute.Media<'images'>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    role: Schema.Attribute.String;
    text: Schema.Attribute.String;
  };
}

export interface CertificateSponsor extends Struct.ComponentSchema {
  collectionName: 'components_certificate_sponsors';
  info: {
    description: 'Patrocinador exibido no rodap\u00E9 do certificado';
    displayName: 'Sponsor';
  };
  attributes: {
    logo: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    url: Schema.Attribute.String;
  };
}

export interface FeedbackMealRating extends Struct.ComponentSchema {
  collectionName: 'components_feedback_meal_ratings';
  info: {
    description: 'Rating for a single meal slot during the event';
    displayName: 'Meal Rating';
  };
  attributes: {
    meal_slot: Schema.Attribute.Enumeration<
      [
        'sex_jantar',
        'sab_cafe',
        'sab_almoco',
        'sab_lanche',
        'sab_jantar',
        'dom_cafe',
        'dom_almoco',
        'dom_lanche',
      ]
    > &
      Schema.Attribute.Required;
    quality: Schema.Attribute.Enumeration<
      ['excelente', 'boa', 'regular', 'ruim']
    >;
    quantity: Schema.Attribute.Enumeration<
      ['suficiente', 'pouca', 'exagerada']
    >;
    variety: Schema.Attribute.Enumeration<
      ['excelente', 'boa', 'regular', 'ruim']
    >;
  };
}

export interface ShareArtPhotoArea extends Struct.ComponentSchema {
  collectionName: 'components_share_art_photo_areas';
  info: {
    description: '\u00C1rea da foto do participante na arte, em fra\u00E7\u00F5es da imagem de fundo (0 a 1); radius 0 = canto reto, 1 = c\u00EDrculo';
    displayName: 'Photo Area';
  };
  attributes: {
    height: Schema.Attribute.Float &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 1;
          min: 0;
        },
        number
      >;
    radius: Schema.Attribute.Float &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 1;
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    width: Schema.Attribute.Float &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 1;
          min: 0;
        },
        number
      >;
    x: Schema.Attribute.Float &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 1;
          min: 0;
        },
        number
      >;
    y: Schema.Attribute.Float &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 1;
          min: 0;
        },
        number
      >;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'certificate.signature': CertificateSignature;
      'certificate.sponsor': CertificateSponsor;
      'feedback.meal-rating': FeedbackMealRating;
      'share-art.photo-area': ShareArtPhotoArea;
    }
  }
}
