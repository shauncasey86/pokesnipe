import { describe, expect, it } from 'vitest';
import { extractCondition } from '../../services/extraction/condition-mapper.js';

describe('extractCondition', () => {
  describe('condition descriptors — real eBay format (highest priority)', () => {
    it('maps NM from "Near Mint or Better" content', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: 'Card Condition', values: [{ content: 'Near Mint or Better' }] },
        ],
      });
      expect(result.condition).toBe('NM');
      expect(result.source).toBe('condition_descriptor');
      expect(result.isGraded).toBe(false);
    });

    it('maps LP from "Lightly played (Excellent)" content', () => {
      const result = extractCondition({
        conditionDescriptors: [
          {
            name: 'Card Condition',
            values: [{
              content: 'Lightly played (Excellent)',
              additionalInfo: ['Moderate surface scuffing', 'Fuzzy corners'],
            }],
          },
        ],
      });
      expect(result.condition).toBe('LP');
      expect(result.source).toBe('condition_descriptor');
    });

    it('maps MP from "Moderately Played (Very Good)" content', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: 'Card Condition', values: [{ content: 'Moderately Played (Very Good)' }] },
        ],
      });
      expect(result.condition).toBe('MP');
    });

    it('maps HP from "Heavily Played (Poor)" content', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: 'Card Condition', values: [{ content: 'Heavily Played (Poor)' }] },
        ],
      });
      expect(result.condition).toBe('HP');
    });
  });

  describe('graded cards', () => {
    it('detects PSA graded card from descriptor content', () => {
      const graded = extractCondition({
        conditionDescriptors: [
          { name: 'Grading Company', values: [{ content: 'PSA' }] },
          { name: 'Grade', values: [{ content: '10' }] },
          { name: 'Certification Number', values: [{ content: 'cert-123' }] },
        ],
      });
      expect(graded.isGraded).toBe(true);
      expect(graded.gradingCompany).toBe('PSA');
      expect(graded.grade).toBe('10');
      expect(graded.condition).toBe('NM');
      expect(graded.source).toBe('condition_descriptor');
    });

    it('detects CGC 9.5 grading', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: 'Grading Company', values: [{ content: 'CGC' }] },
          { name: 'Grade', values: [{ content: '9.5' }] },
        ],
      });
      expect(result.isGraded).toBe(true);
      expect(result.gradingCompany).toBe('CGC');
      expect(result.grade).toBe('9.5');
    });

    it('detects BGS grading without cert number', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: 'Grading Company', values: [{ content: 'BGS' }] },
          { name: 'Grade', values: [{ content: '9' }] },
        ],
      });
      expect(result.isGraded).toBe(true);
      expect(result.gradingCompany).toBe('BGS');
      expect(result.grade).toBe('9');
      expect(result.certNumber).toBeNull();
    });
  });

  describe('localizedAspects fallback', () => {
    it('maps Near Mint from aspects', () => {
      const result = extractCondition({
        conditionDescriptors: [],
        localizedAspects: [{ name: 'Card Condition', value: 'Near Mint' }],
      });
      expect(result.condition).toBe('NM');
      expect(result.source).toBe('localized_aspects');
    });

    it('maps Excellent to LP', () => {
      const result = extractCondition({
        conditionDescriptors: [],
        localizedAspects: [{ name: 'Card Condition', value: 'Excellent' }],
      });
      expect(result.condition).toBe('LP');
    });

    it('maps Good to MP', () => {
      const result = extractCondition({
        conditionDescriptors: [],
        localizedAspects: [{ name: 'Card Condition', value: 'Good' }],
      });
      expect(result.condition).toBe('MP');
    });
  });

  describe('title fallback', () => {
    it('extracts NM from title', () => {
      const result = extractCondition({
        conditionDescriptors: [],
        title: 'near mint charizard',
      });
      expect(result.condition).toBe('NM');
      expect(result.source).toBe('title');
    });

    it('extracts LP from title abbreviation', () => {
      const result = extractCondition({
        conditionDescriptors: [],
        title: 'charizard lp condition',
      });
      expect(result.condition).toBe('LP');
      expect(result.source).toBe('title');
    });

    it('does not false positive on hp inside words', () => {
      const result = extractCondition({
        conditionDescriptors: [],
        title: 'shipping fast charizard',
        localizedAspects: null,
      });
      expect(result.condition).toBe('LP');
      expect(result.source).toBe('default');
    });
  });

  describe('default fallback', () => {
    it('defaults to LP when nothing matches', () => {
      const fallback = extractCondition({
        conditionDescriptors: [],
        title: 'charizard ex',
        localizedAspects: null,
      });
      expect(fallback.condition).toBe('LP');
      expect(fallback.source).toBe('default');
      expect(fallback.isGraded).toBe(false);
      expect(fallback.gradingCompany).toBeNull();
      expect(fallback.grade).toBeNull();
      expect(fallback.certNumber).toBeNull();
    });

    it('defaults when no data provided', () => {
      const result = extractCondition({});
      expect(result.condition).toBe('LP');
      expect(result.source).toBe('default');
    });
  });
});
