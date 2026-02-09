// src/routes/expansion.ts

import { Router, Request, Response } from 'express';
import { expansionService } from '../services/expansion/index.js';
import { titleParser } from '../services/parser/index.js';
import { logger } from '../utils/logger.js';
import type { CachedExpansion, ExpansionMatch } from '../services/expansion/types.js';

const router = Router();

router.get('/stats', (_req: Request, res: Response): void => {
  const stats = expansionService.getStats();
  res.json({ status: 'ok', data: stats });
});

router.get('/list', (req: Request, res: Response): void => {
  const language = (req.query.language as string)?.toUpperCase() || null;
  const series = req.query.series as string | undefined;

  let expansions = expansionService.getAll();

  if (language) {
    expansions = expansions.filter((e: CachedExpansion) => e.languageCode === language);
  }

  if (series) {
    const normalizedSeries = series.toLowerCase();
    expansions = expansions.filter((e: CachedExpansion) => e.series.toLowerCase().includes(normalizedSeries));
  }

  res.json({
    status: 'ok',
    total: expansions.length,
    data: expansions.map((e: CachedExpansion) => ({
      id: e.id,
      name: e.name,
      series: e.series,
      code: e.code,
      total: e.total,
      language: e.languageCode,
      releaseDate: e.releaseDate,
    })),
  });
});

router.get('/match', (req: Request, res: Response): void => {
  const query = req.query.q as string;

  if (!query) {
    res.status(400).json({ status: 'error', message: 'Missing "q" query parameter' });
    return;
  }

  const result = expansionService.match(query);

  logger.info(`Expansion match: "${query}" -> ${result.success ? result.match?.expansion.id : 'no match'}`);

  res.json({
    status: 'ok',
    data: {
      success: result.success,
      query: result.query,
      match: result.match
        ? {
            id: result.match.expansion.id,
            name: result.match.expansion.name,
            series: result.match.expansion.series,
            code: result.match.expansion.code,
            score: result.match.matchScore,
            matchType: result.match.matchType,
            matchedOn: result.match.matchedOn,
          }
        : null,
      alternates: result.alternates.map((alt: ExpansionMatch) => ({
        id: alt.expansion.id,
        name: alt.expansion.name,
        score: alt.matchScore,
        matchType: alt.matchType,
      })),
    },
  });
});

router.get('/parse', (req: Request, res: Response): void => {
  const title = req.query.title as string;

  if (!title) {
    res.status(400).json({ status: 'error', message: 'Missing "title" query parameter' });
    return;
  }

  const parsed = titleParser.parse(title);
  const expansionMatch = parsed.setName ? expansionService.match(parsed.setName) : null;

  let scrydexQuery: string | null = null;
  if (expansionMatch?.success && parsed.cardNumber) {
    scrydexQuery = `expansion.id:${expansionMatch.match!.expansion.id} number:${parsed.cardNumber}`;
  } else if (parsed.cardName && parsed.cardNumber) {
    scrydexQuery = `name:${parsed.cardName} number:${parsed.cardNumber}`;
  } else if (parsed.cardName) {
    scrydexQuery = `name:${parsed.cardName}`;
  }

  res.json({
    status: 'ok',
    data: {
      parsed: {
        cardName: parsed.cardName,
        cardNumber: parsed.cardNumber,
        setName: parsed.setName,
        isGraded: parsed.isGraded,
        gradingCompany: parsed.gradingCompany,
        grade: parsed.grade,
        condition: parsed.condition,
        confidence: parsed.confidence,
        score: parsed.confidenceScore,
      },
      expansion: expansionMatch?.success
        ? {
            id: expansionMatch.match!.expansion.id,
            name: expansionMatch.match!.expansion.name,
            code: expansionMatch.match!.expansion.code,
            matchScore: expansionMatch.match!.matchScore,
            matchType: expansionMatch.match!.matchType,
          }
        : null,
      scrydexQuery,
      canQueryScrydex: scrydexQuery !== null && parsed.confidence !== 'LOW',
    },
  });
});

router.post('/batch', (req: Request, res: Response): void => {
  const { titles } = req.body;

  if (!Array.isArray(titles)) {
    res.status(400).json({ status: 'error', message: 'Expected "titles" to be an array of strings' });
    return;
  }

  const results = titles.map((title: string) => {
    const parsed = titleParser.parse(title);
    const expansionMatch = parsed.setName ? expansionService.match(parsed.setName) : null;

    let scrydexQuery: string | null = null;
    if (expansionMatch?.success && parsed.cardNumber) {
      scrydexQuery = `expansion.id:${expansionMatch.match!.expansion.id} number:${parsed.cardNumber}`;
    }

    return {
      title,
      cardName: parsed.cardName,
      cardNumber: parsed.cardNumber,
      setName: parsed.setName,
      expansionId: expansionMatch?.match?.expansion.id || null,
      expansionName: expansionMatch?.match?.expansion.name || null,
      matchScore: expansionMatch?.match?.matchScore || 0,
      matchType: expansionMatch?.match?.matchType || null,
      scrydexQuery,
      canQuery: scrydexQuery !== null && parsed.confidence !== 'LOW',
      confidence: parsed.confidence,
    };
  });

  const stats = {
    total: results.length,
    matched: results.filter((r) => r.expansionId !== null).length,
    queryable: results.filter((r) => r.canQuery).length,
    byMatchType: {
      exact: results.filter((r) => r.matchType === 'exact').length,
      alias: results.filter((r) => r.matchType === 'alias').length,
      code: results.filter((r) => r.matchType === 'code').length,
      fuzzy: results.filter((r) => r.matchType === 'fuzzy').length,
      partial: results.filter((r) => r.matchType === 'partial').length,
      none: results.filter((r) => r.matchType === null).length,
    },
  };

  res.json({ status: 'ok', stats, data: results });
});

router.get('/test', (_req: Request, res: Response): void => {
  const testCases = [
    { input: 'Base Set', expectedId: 'base1' },
    { input: 'Jungle', expectedId: 'base2' },
    { input: 'Vivid Voltage', expectedId: 'swsh4' },
    { input: 'VV', expectedId: 'swsh4' },
    { input: 'SV1', expectedId: 'sv1' },
  ];

  const results = testCases.map((tc) => {
    const match = expansionService.match(tc.input);
    const passed = match.match?.expansion.id === tc.expectedId;

    return {
      input: tc.input,
      expected: tc.expectedId,
      actual: match.match?.expansion.id || null,
      matchType: match.match?.matchType || null,
      score: match.match?.matchScore || 0,
      passed,
    };
  });

  const passRate = (results.filter((r) => r.passed).length / results.length) * 100;

  res.json({
    status: 'ok',
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      passRate: `${passRate.toFixed(1)}%`,
    },
    results,
  });
});

export default router;