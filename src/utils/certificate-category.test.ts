import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CATEGORY,
  normalizeCategory,
  categoryKey,
  isDefaultCategory,
  categoryFilter,
} from './certificate-category';

describe('normalizeCategory', () => {
  it('keeps the typed label, trimmed', () => {
    expect(normalizeCategory('  Mentor ')).toBe('Mentor');
  });
  it('falls back to the default for empty values', () => {
    expect(normalizeCategory('')).toBe(DEFAULT_CATEGORY);
    expect(normalizeCategory('   ')).toBe(DEFAULT_CATEGORY);
    expect(normalizeCategory(null)).toBe(DEFAULT_CATEGORY);
    expect(normalizeCategory(undefined)).toBe(DEFAULT_CATEGORY);
  });
});

describe('categoryKey', () => {
  it('ignores case, accents and spacing', () => {
    expect(categoryKey('Organizador')).toBe('organizador');
    expect(categoryKey('ORGANIZADOR')).toBe('organizador');
    expect(categoryKey('Voluntário')).toBe('voluntario');
    expect(categoryKey('Equipe de apoio')).toBe('equipe-de-apoio');
  });
  it('maps an empty value to the default category key', () => {
    expect(categoryKey(null)).toBe('participante');
  });
});

describe('isDefaultCategory', () => {
  it('accepts the default label in any casing, and null', () => {
    expect(isDefaultCategory('Participante')).toBe(true);
    expect(isDefaultCategory('participante')).toBe(true);
    expect(isDefaultCategory(null)).toBe(true);
  });
  it('rejects another category', () => {
    expect(isDefaultCategory('Mentor')).toBe(false);
  });
});

describe('categoryFilter', () => {
  it('matches the rows written before the field existed for the default category', () => {
    expect(categoryFilter('Participante')).toEqual({
      $or: [{ category: { $null: true } }, { category: { $eqi: 'Participante' } }],
    });
    expect(categoryFilter(undefined)).toEqual({
      $or: [{ category: { $null: true } }, { category: { $eqi: 'Participante' } }],
    });
  });
  it('matches only the label for any other category', () => {
    expect(categoryFilter(' Mentor ')).toEqual({ category: { $eqi: 'Mentor' } });
  });
});
