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

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'certificate.signature': CertificateSignature;
      'certificate.sponsor': CertificateSponsor;
      'feedback.meal-rating': FeedbackMealRating;
    }
  }
}
