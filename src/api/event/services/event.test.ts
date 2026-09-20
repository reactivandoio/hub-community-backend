/**
 * Tests for event service slug generation
 *
 * These drive `src/utils/slug.ts`, the module both the event and the community
 * service use — the file used to carry its own copy of the logic, so it kept
 * passing while the real behaviour drifted away from it.
 */

import { describe, it, expect, vi } from 'vitest';

import { MAX_SLUG_LENGTH, generateUniqueSlug } from '../../../utils/slug';

// Mock Strapi instance
const createMockStrapi = () => ({
	entityService: {
		findMany: vi.fn()
	}
});

const slugFor = (strapi: any, title: string, eventId?: string) =>
	generateUniqueSlug(strapi, 'api::event.event', title, eventId);

describe('Event Service - Slug Generation', () => {
	describe('Special Characters', () => {
		it('should handle accents and convert to basic characters', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			const slug = await slugFor(strapi, 'Café com Código');
			expect(slug).toBe('cafe-com-codigo');
		});

		it('should handle symbols and remove them', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			const slug = await slugFor(strapi, 'Dev@Fest 2024 #Tech');
			expect(slug).toBe('devfest-2024-tech');
		});

		it('should handle multiple spaces and convert to single hyphen', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			const slug = await slugFor(
				strapi,
				'Workshop    Python   Advanced'
			);
			expect(slug).toBe('workshop-python-advanced');
		});

		it('should handle special unicode characters', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			const slug = await slugFor(
				strapi,
				'Conferência de Tecnologia™ & Inovação®'
			);
			expect(slug).toBe('conferencia-de-tecnologia-inovacao');
		});
	});

	describe('Long Titles', () => {
		it('should truncate titles longer than 100 characters', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			const longTitle =
				'This is a very long event title that exceeds one hundred characters and should be truncated to fit within the maximum allowed length for slugs';
			const slug = await slugFor(strapi, longTitle);

			// A hard cut at the limit, not at a word boundary.
			expect(slug).toHaveLength(MAX_SLUG_LENGTH);
			expect(slug).toMatch(
				/^this-is-a-very-long-event-title-that-exceeds-one-hundred-characters/
			);
			expect(slug).not.toMatch(/-$/);
		});

		it('should remove trailing hyphen after truncation', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			// Title that would end with hyphen after truncation at 100 chars
			const title = 'A'.repeat(95) + ' Test';
			const slug = await slugFor(strapi, title);

			expect(slug).not.toMatch(/-$/);
			expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
		});
	});

	describe('Duplicate Event Names', () => {
		it('should add -2 suffix for first duplicate', async () => {
			const strapi = createMockStrapi();

			// First call: slug exists
			// Second call: slug-2 doesn't exist
			strapi.entityService.findMany
				.mockResolvedValueOnce([{ id: '1', slug: 'devfest-2024' }])
				.mockResolvedValueOnce([]);

			const slug = await slugFor(strapi, 'DevFest 2024');
			expect(slug).toBe('devfest-2024-2');
		});

		it('should increment suffix for multiple duplicates', async () => {
			const strapi = createMockStrapi();

			// Slug exists, -2 exists, -3 exists, -4 doesn't exist
			strapi.entityService.findMany
				.mockResolvedValueOnce([{ id: '1' }])
				.mockResolvedValueOnce([{ id: '2' }])
				.mockResolvedValueOnce([{ id: '3' }])
				.mockResolvedValueOnce([]);

			const slug = await slugFor(strapi, 'Popular Event');
			expect(slug).toBe('popular-event-4');
		});

		it('should exclude current event ID when updating', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			const eventId = 'current-event-id';
			await slugFor(strapi, 'Updated Title', eventId);

			expect(strapi.entityService.findMany).toHaveBeenCalledWith(
				'api::event.event',
				expect.objectContaining({
					filters: expect.objectContaining({
						documentId: { $ne: eventId }
					})
				})
			);
		});

		it('should handle long titles with duplicate suffixes', async () => {
			const strapi = createMockStrapi();

			const longTitle = 'A'.repeat(98) + ' B';

			// Base slug exists
			strapi.entityService.findMany
				.mockResolvedValueOnce([{ id: '1' }])
				.mockResolvedValueOnce([]);

			const slug = await slugFor(strapi, longTitle);

			// Should truncate base and add -2
			expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
			expect(slug).toMatch(/-2$/);
		});
	});

	describe('Uniqueness Constraint', () => {
		it('should check uniqueness against database', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			await slugFor(strapi, 'Test Event');

			expect(strapi.entityService.findMany).toHaveBeenCalledWith(
				'api::event.event',
				expect.objectContaining({
					filters: { slug: { $eq: 'test-event' } },
					limit: 1
				})
			);
		});

		it('should return unique slug when no conflicts', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			const slug = await slugFor(strapi, 'Unique Event Name');
			expect(slug).toBe('unique-event-name');
		});
	});

	describe('Edge Cases', () => {
		it('should throw error for empty title', async () => {
			const strapi = createMockStrapi();

			await expect(slugFor(strapi, '')).rejects.toThrow(
				'Title is required to generate slug'
			);
		});

		it('should throw error for null title', async () => {
			const strapi = createMockStrapi();

			await expect(slugFor(strapi, null as any)).rejects.toThrow(
				'Title is required to generate slug'
			);
		});

		it('should throw error for undefined title', async () => {
			const strapi = createMockStrapi();

			await expect(
				slugFor(strapi, undefined as any)
			).rejects.toThrow('Title is required to generate slug');
		});

		it('should handle title with only special characters', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			const slug = await slugFor(strapi, '@@@ ### $$$');

			// slugify with strict mode should remove all special chars
			// Result might be empty or have minimal content
			expect(typeof slug).toBe('string');
		});

		it('should handle numeric-only titles', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			const slug = await slugFor(strapi, '2024');
			expect(slug).toBe('2024');
		});

		it('should handle mixed case properly', async () => {
			const strapi = createMockStrapi();
			strapi.entityService.findMany.mockResolvedValue([]);

			const slug = await slugFor(strapi, 'CamelCaseEvent');
			expect(slug).toBe('camelcaseevent');
		});
	});
});
