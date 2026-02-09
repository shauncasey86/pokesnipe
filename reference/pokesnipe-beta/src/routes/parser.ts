// src/routes/parser.ts

import { Router, Request, Response } from 'express';
import { titleParser } from '../services/parser/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Parse a Single Title
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/parser/parse
router.post('/parse', (req: Request, res: Response) => {
  const { title } = req.body;

  if (!title || typeof title !== 'string') {
    res.status(400).json({
      status: 'error',
      message: 'Missing or invalid "title" in request body',
    });
    return;
  }

  const result = titleParser.parse(title);

  res.json({
    status: 'ok',
    data: result,
  });
});

// GET /api/parser/parse?title=...
router.get('/parse', (req: Request, res: Response) => {
  const title = req.query.title as string;

  if (!title) {
    res.status(400).json({
      status: 'error',
      message: 'Missing "title" query parameter',
    });
    return;
  }

  const result = titleParser.parse(title);

  res.json({
    status: 'ok',
    data: result,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Parse Multiple Titles (Batch)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/parser/batch
router.post('/batch', (req: Request, res: Response) => {
  const { titles } = req.body;

  if (!Array.isArray(titles)) {
    res.status(400).json({
      status: 'error',
      message: 'Expected "titles" to be an array of strings',
    });
    return;
  }

  const results = titles.map((title: string) => titleParser.parse(title));

  // Calculate stats
  const stats = {
    total: results.length,
    perfect: results.filter((r) => r.confidence === 'PERFECT').length,
    high: results.filter((r) => r.confidence === 'HIGH').length,
    medium: results.filter((r) => r.confidence === 'MEDIUM').length,
    low: results.filter((r) => r.confidence === 'LOW').length,
    avgScore: results.reduce((sum, r) => sum + r.confidenceScore, 0) / results.length,
    withCardNumber: results.filter((r) => r.cardNumber !== null).length,
    withSetName: results.filter((r) => r.setName !== null).length,
    graded: results.filter((r) => r.isGraded).length,
  };

  res.json({
    status: 'ok',
    stats,
    data: results,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite - Run Pre-defined Test Cases
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/parser/test
router.get('/test', (_req: Request, res: Response) => {
  const testCases = [
    // Standard format
    'Pokemon TCG Charizard Base Set 4/102 Holo Rare',
    'Charizard 4/102 Base Set Holo',
    'Pikachu 58/102 Base Set',

    // Modern format
    'Charizard VMAX 020/189 Darkness Ablaze',
    'Pikachu V 043/185 Vivid Voltage Full Art',

    // Graded cards
    'PSA 10 Charizard Base Set 4/102',
    'CGC 9.5 Pikachu VMAX Secret Rare',
    'BGS 10 Black Label Charizard',

    // Japanese
    'Japanese Charizard 006/165 Pokemon 151',
    'ポケモンカード リザードン',

    // Promos
    'Charizard SWSH066 Promo',
    'Pikachu Black Star Promo 1',

    // Edge cases
    'Pokemon Cards Bundle Lot',
    'Mystery Box Pokemon',
    'Custom Charizard Proxy Card',
  ];

  const results = testCases.map((title) => {
    const parsed = titleParser.parse(title);
    return {
      title,
      output: {
        cardName: parsed.cardName,
        cardNumber: parsed.cardNumber,
        setName: parsed.setName,
        graded: parsed.isGraded ? `${parsed.gradingCompany} ${parsed.grade}` : null,
        variant: parsed.variant.variantName,
        confidence: parsed.confidence,
        score: parsed.confidenceScore,
      },
    };
  });

  // Calculate success rate
  const successThreshold = 60;
  const successCount = results.filter((r) => r.output.score >= successThreshold).length;
  const successRate = ((successCount / results.length) * 100).toFixed(1);

  // Count by confidence
  const byConfidence = {
    PERFECT: results.filter((r) => r.output.confidence === 'PERFECT').length,
    HIGH: results.filter((r) => r.output.confidence === 'HIGH').length,
    MEDIUM: results.filter((r) => r.output.confidence === 'MEDIUM').length,
    LOW: results.filter((r) => r.output.confidence === 'LOW').length,
  };

  logger.info(`Parser test: ${successRate}% success rate (${successCount}/${results.length})`);

  res.json({
    status: 'ok',
    summary: {
      total: results.length,
      successRate: `${successRate}%`,
      byConfidence,
      threshold: 'MEDIUM (score >= 60)',
    },
    results,
  });
});

export default router;