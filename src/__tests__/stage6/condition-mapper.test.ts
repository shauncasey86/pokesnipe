import { describe, expect, it } from 'vitest';
import { extractCondition } from '../../services/extraction/condition-mapper.js';

describe('extractCondition', () => {
  describe('condition descriptors (highest priority)', () => {
    it('maps NM from ungraded descriptor', () => {
      const result = extractCondition({
        conditionDescriptors: [{ name: '40001', values: ['400010'] }],
      });
      expect(result.condition).toBe('NM');
      expect(result.source).toBe('condition_descriptor');
      expect(result.isGraded).toBe(false);
    });

    it('maps LP from ungraded descriptor', () => {
      expect(
        extractCondition({
          conditionDescriptors: [{ name: '40001', values: ['400015'] }],
        }).condition,
      ).toBe('LP');
    });

    it('maps MP from ungraded descriptor', () => {
      expect(
        extractCondition({
          conditionDescriptors: [{ name: '40001', values: ['400016'] }],
        }).condition,
      ).toBe('MP');
    });

    it('maps HP from ungraded descriptor', () => {
      expect(
        extractCondition({
          conditionDescriptors: [{ name: '40001', values: ['400017'] }],
        }).condition,
      ).toBe('HP');
    });
  });

  describe('graded cards', () => {
    it('extracts full graded card info', () => {
      const graded = extractCondition({
        conditionDescriptors: [
          { name: '27501', values: ['275010'] },
          { name: '27502', values: ['275020'] },
          { name: '27503', values: ['cert-123'] },
        ],
      });
      expect(graded.isGraded).toBe(true);
      expect(graded.gradingCompany).toBe('PSA');
      expect(graded.grade).toBe('10');
      expect(graded.certNumber).toBe('cert-123');
      expect(graded.condition).toBe('NM');
      expect(graded.source).toBe('condition_descriptor');
    });

    it('handles CGC grading', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: '27501', values: ['275015'] },
          { name: '27502', values: ['275021'] },
        ],
      });
      expect(result.gradingCompany).toBe('CGC');
      expect(result.grade).toBe('9.5');
    });

    it('handles graded card without cert number', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: '27501', values: ['275013'] },
          { name: '27502', values: ['275022'] },
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
