import { describe, expect, it } from 'vitest';
import { extractCondition } from '../../services/extraction/condition-mapper.js';

describe('extractCondition', () => {
  describe('ungraded condition descriptors (numeric IDs)', () => {
    it('maps NM from descriptor 40001/400010', () => {
      expect(
        extractCondition({
          conditionDescriptors: [{ name: '40001', values: ['400010'] }],
        }).condition,
      ).toBe('NM');
    });

    it('maps LP from descriptor 40001/400015', () => {
      expect(
        extractCondition({
          conditionDescriptors: [{ name: '40001', values: ['400015'] }],
        }).condition,
      ).toBe('LP');
    });

    it('maps MP from descriptor 40001/400016', () => {
      expect(
        extractCondition({
          conditionDescriptors: [{ name: '40001', values: ['400016'] }],
        }).condition,
      ).toBe('MP');
    });

    it('maps HP from descriptor 40001/400017', () => {
      expect(
        extractCondition({
          conditionDescriptors: [{ name: '40001', values: ['400017'] }],
        }).condition,
      ).toBe('HP');
    });

    it('returns condition_descriptor as source', () => {
      const result = extractCondition({
        conditionDescriptors: [{ name: '40001', values: ['400010'] }],
      });
      expect(result.source).toBe('condition_descriptor');
      expect(result.isGraded).toBe(false);
    });
  });

  describe('graded cards (numeric IDs)', () => {
    it('extracts PSA grade 10 with cert number', () => {
      const graded = extractCondition({
        conditionDescriptors: [
          { name: '27501', values: ['275010'] }, // PSA
          { name: '27502', values: ['275020'] }, // Grade 10
          { name: '27503', values: ['cert-123'] }, // Cert number
        ],
      });
      expect(graded.isGraded).toBe(true);
      expect(graded.gradingCompany).toBe('PSA');
      expect(graded.grade).toBe('10');
      expect(graded.certNumber).toBe('cert-123');
      expect(graded.condition).toBe('NM');
      expect(graded.source).toBe('condition_descriptor');
    });

    it('extracts CGC grade 9.5', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: '27501', values: ['275015'] }, // CGC
          { name: '27502', values: ['275021'] }, // 9.5
        ],
      });
      expect(result.isGraded).toBe(true);
      expect(result.gradingCompany).toBe('CGC');
      expect(result.grade).toBe('9.5');
      expect(result.certNumber).toBeNull();
    });

    it('extracts BGS grade 9', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: '27501', values: ['275013'] }, // BGS
          { name: '27502', values: ['275022'] }, // 9
        ],
      });
      expect(result.isGraded).toBe(true);
      expect(result.gradingCompany).toBe('BGS');
      expect(result.grade).toBe('9');
    });

    it('extracts Ace Grading', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: '27501', values: ['2750119'] }, // Ace Grading
          { name: '27502', values: ['275020'] }, // 10
          { name: '27503', values: ['833867'] },
        ],
      });
      expect(result.isGraded).toBe(true);
      expect(result.gradingCompany).toBe('Ace Grading');
      expect(result.grade).toBe('10');
      expect(result.certNumber).toBe('833867');
    });

    it('maps Authentic grade', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: '27501', values: ['275010'] }, // PSA
          { name: '27502', values: ['2750219'] }, // Authentic
        ],
      });
      expect(result.isGraded).toBe(true);
      expect(result.grade).toBe('Authentic');
    });

    it('graded cards always map to NM condition', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: '27501', values: ['275016'] }, // SGC
          { name: '27502', values: ['275026'] }, // 7
        ],
      });
      expect(result.condition).toBe('NM');
      expect(result.isGraded).toBe(true);
    });

    it('collects rawDescriptorIds for audit trail', () => {
      const result = extractCondition({
        conditionDescriptors: [
          { name: '27501', values: ['275010'] },
          { name: '27502', values: ['275020'] },
        ],
      });
      expect(result.rawDescriptorIds).toContain('27501');
      expect(result.rawDescriptorIds).toContain('275010');
      expect(result.rawDescriptorIds).toContain('27502');
      expect(result.rawDescriptorIds).toContain('275020');
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

    it('maps Mint to NM', () => {
      const result = extractCondition({
        conditionDescriptors: [],
        localizedAspects: [{ name: 'Card Condition', value: 'Mint' }],
      });
      expect(result.condition).toBe('NM');
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
