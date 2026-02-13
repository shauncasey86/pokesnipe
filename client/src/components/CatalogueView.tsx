import { useState, useEffect, useCallback } from 'react';
import { I } from '../icons';
import {
  getExpansions,
  getExpansionDetail,
  getCardDetail,
  type Expansion,
  type CardSummary,
  type ExpansionDetail,
  type CardDetail,
  type Variant,
} from '../api/catalog';

// ── Types ────────────────────────────────────────────────────────────

type Mode = 'list' | 'expansion' | 'card';

interface ExpansionListState {
  data: Expansion[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
}

interface ExpansionViewState {
  expansion: ExpansionDetail | null;
  cards: CardSummary[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
}

interface CardViewState {
  card: CardDetail | null;
  expansion: { id: string; name: string; code: string; series: string; logo: string | null } | null;
  variants: Variant[];
  variantIdx: number;
  loading: boolean;
  error: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatPrice(val: number | undefined | null): string {
  if (val == null) return '-';
  return `$${val.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ── Sub-components ───────────────────────────────────────────────────

const Loader = () => (
  <div className="flex flex-col items-center justify-center py-20">
    <I.Loader s={32} c="text-dexRed" />
    <div className="mt-4 font-mono text-xs text-gray-500 uppercase tracking-widest animate-pulse">
      Loading data...
    </div>
  </div>
);

const ErrorBanner = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <I.Zap s={32} c="text-dexRed mb-3" />
    <div className="text-sm text-dexRed font-mono mb-2">Error</div>
    <div className="text-xs text-gray-400 max-w-sm mb-4">{message}</div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-panel border border-border rounded text-xs font-mono text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
      >
        Retry
      </button>
    )}
  </div>
);

const Pagination = ({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
}) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;

  const pages: (number | string)[] = [];
  const maxVisible = 7;

  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1.5 mt-8">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 rounded text-xs font-mono border border-border bg-panel text-gray-400 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Prev
      </button>
      {pages.map((p, i) =>
        typeof p === 'string' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-gray-600 text-xs font-mono">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`w-8 h-8 rounded text-xs font-mono border transition-colors ${
              p === page
                ? 'bg-dexBlue/20 border-dexBlue text-dexBlue font-bold'
                : 'border-border bg-panel text-gray-400 hover:text-white hover:border-gray-500'
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded text-xs font-mono border border-border bg-panel text-gray-400 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
};

// Flip card image with 3D perspective effect
const FlipCardImage = ({ src, alt }: { src: string | null; alt: string }) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="relative w-full aspect-[2.5/3.5] bg-black rounded-lg shadow-2xl cursor-pointer group shrink-0"
      style={{ perspective: '1000px' }}
      onClick={() => setFlipped(!flipped)}
    >
      <div
        className="relative w-full h-full transition-transform duration-700"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 border border-gray-800 rounded-lg overflow-hidden bg-gray-900"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {src ? (
            <img
              src={src}
              alt={alt}
              className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <I.Box s={48} c="text-gray-700" />
            </div>
          )}
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 border border-dexBlue/30 rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="text-center p-4 relative z-10">
            <div className="text-dexBlue font-bold text-lg mb-2">Back View</div>
            <div className="text-xs text-gray-400">Card Back / Condition Check</div>
          </div>
          {src && (
            <img
              src={src}
              alt=""
              className="w-full h-full object-cover absolute inset-0 opacity-20 blur-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Inline pricing matrix for a variant
const InlinePricing = ({ variant }: { variant: Variant }) => {
  const priceEntries = Object.entries(variant.prices);
  const gradedEntries = Object.entries(variant.gradedPrices);

  if (priceEntries.length === 0 && gradedEntries.length === 0) {
    return (
      <div className="mt-4 text-center py-8 text-gray-600 text-xs font-mono">
        No pricing data available for this variant.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Raw Condition Prices */}
      {priceEntries.length > 0 && (
        <div>
          <h4 className="text-xs uppercase font-bold text-dexBlue tracking-wider mb-3 flex items-center gap-2">
            <I.Box s={14} /> Raw Condition
          </h4>
          <div className="bg-charcoal/50 rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm font-mono text-gray-300">
              <thead className="bg-black/30">
                <tr className="text-gray-500 text-[10px] uppercase">
                  <th className="text-left py-2 px-4">Condition</th>
                  <th className="text-right py-2 px-4">Low</th>
                  <th className="text-right py-2 px-4">Market</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {priceEntries.map(([condition, prices]) => (
                  <tr key={condition} className="hover:bg-white/5 transition-colors">
                    <td className="py-2 px-4 font-bold text-white">{condition}</td>
                    <td className="text-right px-4 text-gray-400">{formatPrice(prices.low)}</td>
                    <td className="text-right px-4 text-dexGreen">{formatPrice(prices.market)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Graded Prices */}
      {gradedEntries.length > 0 && (
        <div>
          <h4 className="text-xs uppercase font-bold text-dexYellow tracking-wider mb-3 flex items-center gap-2">
            <I.Zap s={14} /> Graded Population
          </h4>
          <div className="bg-charcoal/50 rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs font-mono text-gray-300">
              <thead className="bg-black/30">
                <tr className="text-gray-500 text-[10px] uppercase">
                  <th className="text-left py-2 px-4">Grade</th>
                  <th className="text-right py-2 px-4">Low</th>
                  <th className="text-right py-2 px-4">Market</th>
                  <th className="text-right py-2 px-4">Mid</th>
                  <th className="text-right py-2 px-4">High</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {gradedEntries.map(([grade, prices]) => (
                  <tr key={grade} className="hover:bg-white/5 transition-colors">
                    <td className="py-2 px-4 font-bold text-white bg-black/20">{grade}</td>
                    <td className="text-right px-4 text-gray-400">{formatPrice(prices.low)}</td>
                    <td className="text-right px-4 text-dexGreen">{formatPrice(prices.market)}</td>
                    <td className="text-right px-4 text-gray-400">{formatPrice(prices.mid)}</td>
                    <td className="text-right px-4 text-gray-400">{formatPrice(prices.high)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trends */}
      {variant.trends && Object.keys(variant.trends).length > 0 && (
        <div>
          <h4 className="text-xs uppercase font-bold text-dexGreen tracking-wider mb-3 flex items-center gap-2">
            <I.Activity s={14} /> Price Trends
          </h4>
          <div className="bg-charcoal/50 rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs font-mono text-gray-300">
              <thead className="bg-black/30">
                <tr className="text-gray-500 text-[10px] uppercase">
                  <th className="text-left py-2 px-4">Condition</th>
                  <th className="text-left py-2 px-4">Period</th>
                  <th className="text-right py-2 px-4">Change</th>
                  <th className="text-right py-2 px-4">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {Object.entries(variant.trends).map(([condition, periods]) =>
                  Object.entries(periods).map(([period, trend], i) => (
                    <tr key={`${condition}-${period}`} className="hover:bg-white/5 transition-colors">
                      {i === 0 && (
                        <td
                          className="py-2 px-4 font-bold text-white bg-black/20"
                          rowSpan={Object.keys(periods).length}
                        >
                          {condition}
                        </td>
                      )}
                      <td className="py-2 px-4 text-gray-400">{period}</td>
                      <td
                        className={`text-right px-4 ${
                          (trend.price_change ?? 0) >= 0 ? 'text-dexGreen' : 'text-dexRed'
                        }`}
                      >
                        {trend.price_change != null
                          ? `${trend.price_change >= 0 ? '+' : ''}${formatPrice(trend.price_change)}`
                          : '-'}
                      </td>
                      <td
                        className={`text-right px-4 ${
                          (trend.percent_change ?? 0) >= 0 ? 'text-dexGreen' : 'text-dexRed'
                        }`}
                      >
                        {trend.percent_change != null
                          ? `${trend.percent_change >= 0 ? '+' : ''}${trend.percent_change.toFixed(1)}%`
                          : '-'}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────

const CatalogueView = () => {
  // Navigation
  const [mode, setMode] = useState<Mode>('list');
  const [expansionId, setExpansionId] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);

  // Expansion List state
  const [expList, setExpList] = useState<ExpansionListState>({
    data: [],
    total: 0,
    page: 1,
    limit: 24,
    loading: false,
    error: null,
  });

  // Expansion Detail state
  const [expView, setExpView] = useState<ExpansionViewState>({
    expansion: null,
    cards: [],
    total: 0,
    page: 1,
    limit: 24,
    loading: false,
    error: null,
  });

  // Card Detail state
  const [cardView, setCardView] = useState<CardViewState>({
    card: null,
    expansion: null,
    variants: [],
    variantIdx: 0,
    loading: false,
    error: null,
  });

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // ── Data Fetching ─────────────────────────────────────────────────

  const fetchExpansions = useCallback(async (page: number) => {
    setExpList((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await getExpansions({ page, limit: 24, sort: '-releaseDate' });
      setExpList({
        data: res.data,
        total: res.total,
        page: res.page,
        limit: res.limit,
        loading: false,
        error: null,
      });
    } catch (err) {
      setExpList((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load expansions',
      }));
    }
  }, []);

  const fetchExpansionDetail = useCallback(async (id: string, page: number) => {
    setExpView((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await getExpansionDetail(id, { page, limit: 24 });
      setExpView({
        expansion: res.expansion,
        cards: res.cards.data,
        total: res.cards.total,
        page: res.cards.page,
        limit: res.cards.limit,
        loading: false,
        error: null,
      });
    } catch (err) {
      setExpView((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load expansion details',
      }));
    }
  }, []);

  const fetchCardDetail = useCallback(async (id: string) => {
    setCardView((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await getCardDetail(id);
      setCardView({
        card: res.card,
        expansion: res.expansion,
        variants: res.variants,
        variantIdx: 0,
        loading: false,
        error: null,
      });
    } catch (err) {
      setCardView((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load card details',
      }));
    }
  }, []);

  // ── Effects ───────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === 'list') {
      fetchExpansions(expList.page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode === 'expansion' && expansionId) {
      fetchExpansionDetail(expansionId, expView.page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, expansionId]);

  useEffect(() => {
    if (mode === 'card' && cardId) {
      fetchCardDetail(cardId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cardId]);

  // ── Navigation handlers ───────────────────────────────────────────

  const handleExpansionClick = useCallback((id: string) => {
    setExpansionId(id);
    setExpView((prev) => ({ ...prev, page: 1 }));
    setMode('expansion');
  }, []);

  const handleCardClick = useCallback(
    (id: string) => {
      setCardId(id);
      setMode('card');
    },
    [],
  );

  const goBack = useCallback(() => {
    if (mode === 'card') {
      setMode('expansion');
    } else if (mode === 'expansion') {
      setMode('list');
      setExpansionId(null);
    }
  }, [mode]);

  const handleExpListPage = useCallback(
    (page: number) => {
      setExpList((prev) => ({ ...prev, page }));
      fetchExpansions(page);
    },
    [fetchExpansions],
  );

  const handleExpDetailPage = useCallback(
    (page: number) => {
      if (!expansionId) return;
      setExpView((prev) => ({ ...prev, page }));
      fetchExpansionDetail(expansionId, page);
    },
    [expansionId, fetchExpansionDetail],
  );

  // ── Filtered expansions (client-side search) ──────────────────────

  const filteredExpansions = searchQuery.trim()
    ? expList.data.filter(
        (e) =>
          e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.series.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : expList.data;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-obsidian">
      {/* Breadcrumb Header */}
      {mode !== 'list' && (
        <div className="h-14 border-b border-border flex items-center px-6 bg-charcoal/50 shrink-0">
          <button
            onClick={goBack}
            className="text-gray-400 hover:text-white flex items-center gap-2 text-xs font-mono uppercase tracking-wider transition-colors"
          >
            <I.ArrowLeft s={14} /> Back
          </button>
          <div className="h-4 w-px bg-border mx-4" />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Catalogue</span>
            <span className="text-gray-600">/</span>
            {mode === 'expansion' && (
              <span className="text-white font-bold">{expView.expansion?.name ?? '...'}</span>
            )}
            {mode === 'card' && (
              <>
                <button
                  onClick={() => setMode('expansion')}
                  className="text-gray-400 hover:text-dexBlue transition-colors"
                >
                  {cardView.expansion?.name ?? '...'}
                </button>
                <span className="text-gray-600">/</span>
                <span className="text-white font-bold">{cardView.card?.name ?? '...'}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* ── Expansion List ──────────────────────────────────────── */}
        {mode === 'list' && (
          <div className="animate-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <I.Book s={24} c="text-dexRed" />
                <h2 className="text-2xl font-bold text-white font-sans">Expansion Catalogue</h2>
              </div>

              {/* Search */}
              <div className="relative">
                <I.Search s={14} c="text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search expansions..."
                  className="pl-9 pr-4 py-2 bg-panel border border-border rounded-lg text-xs font-mono text-gray-300 placeholder-gray-600 focus:border-dexBlue focus:outline-none w-64 transition-colors"
                />
              </div>
            </div>

            {/* Loading */}
            {expList.loading && <Loader />}

            {/* Error */}
            {expList.error && (
              <ErrorBanner
                message={expList.error}
                onRetry={() => fetchExpansions(expList.page)}
              />
            )}

            {/* Grid */}
            {!expList.loading && !expList.error && (
              <>
                {filteredExpansions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <I.Search s={40} c="text-gray-700 mb-3" />
                    <div className="text-sm text-gray-500">No expansions found.</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {filteredExpansions.map((exp) => (
                      <div
                        key={exp.id}
                        onClick={() => handleExpansionClick(exp.id)}
                        className="bg-panel border border-border rounded-xl p-6 group hover:border-dexBlue transition-all cursor-pointer relative overflow-hidden flex flex-col items-center text-center"
                      >
                        {/* Logo */}
                        <div className="w-20 h-20 mb-4 relative z-10 flex items-center justify-center">
                          {exp.logo ? (
                            <img
                              src={exp.logo}
                              alt={exp.code}
                              className="w-full h-full object-contain drop-shadow-[0_0_10px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <I.Box s={40} c="text-gray-600" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="relative z-10">
                          <h3 className="text-white font-bold text-lg mb-1 leading-tight group-hover:text-dexBlue transition-colors">
                            {exp.name}
                          </h3>
                          <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-2">
                            {exp.series}
                          </div>
                          <div className="inline-flex items-center gap-2 bg-charcoal border border-border px-2 py-1 rounded text-[10px] font-mono text-gray-400">
                            {exp.symbol && (
                              <img
                                src={exp.symbol}
                                className="w-3 h-3 grayscale"
                                alt=""
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                            <span>{exp.code}</span>
                            <span className="w-px h-3 bg-border" />
                            <span>{exp.cardCount} Cards</span>
                          </div>
                          <div className="text-[9px] text-gray-600 font-mono mt-2">
                            {formatDate(exp.releaseDate)}
                          </div>
                        </div>

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-dexBlue/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination (only when not searching) */}
                {!searchQuery.trim() && (
                  <Pagination
                    page={expList.page}
                    total={expList.total}
                    limit={expList.limit}
                    onPage={handleExpListPage}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* ── Expansion Detail ────────────────────────────────────── */}
        {mode === 'expansion' && (
          <div className="animate-in">
            {expView.loading && <Loader />}
            {expView.error && (
              <ErrorBanner
                message={expView.error}
                onRetry={() => expansionId && fetchExpansionDetail(expansionId, expView.page)}
              />
            )}

            {!expView.loading && !expView.error && expView.expansion && (
              <>
                {/* Expansion Header */}
                <div className="flex justify-between items-end mb-6 pb-6 border-b border-border/50">
                  <div className="flex items-center gap-6">
                    <div className="w-32 h-20 flex items-center justify-center bg-charcoal/50 rounded-lg p-2 border border-border">
                      {expView.expansion.logo ? (
                        <img
                          src={expView.expansion.logo}
                          alt="Logo"
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <I.Box s={32} c="text-gray-600" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold text-white font-sans">
                        {expView.expansion.name}
                      </h2>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="px-2 py-0.5 bg-panel border border-border rounded text-xs font-mono text-gray-400">
                          {expView.expansion.series}
                        </span>
                        <span className="text-gray-500 text-sm">&bull;</span>
                        <span className="text-gray-400 text-sm font-mono">
                          {expView.expansion.code}
                        </span>
                        <span className="text-gray-500 text-sm">&bull;</span>
                        <span className="text-gray-400 text-sm font-mono">
                          Released {formatDate(expView.expansion.releaseDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white font-mono">
                      {expView.expansion.printedTotal}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                      Printed Total
                    </div>
                    {expView.expansion.total !== expView.expansion.printedTotal && (
                      <div className="text-[9px] text-gray-600 font-mono mt-0.5">
                        {expView.expansion.total} total (incl. secrets)
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Grid */}
                {expView.cards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <I.Box s={40} c="text-gray-700 mb-3" />
                    <div className="text-sm text-gray-500">No cards found in this expansion.</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {expView.cards.map((card) => (
                      <div
                        key={card.id}
                        onClick={() => handleCardClick(card.id)}
                        className="bg-panel border border-border rounded-lg p-3 hover:border-gray-500 cursor-pointer group transition-all"
                      >
                        <div className="aspect-[2.5/3.5] bg-black rounded overflow-hidden mb-3 relative">
                          {card.image ? (
                            <img
                              src={card.image}
                              alt={card.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <I.Box s={24} c="text-gray-700" />
                            </div>
                          )}
                          {/* Rarity indicator */}
                          {card.rarity && (
                            <div className="absolute top-1.5 right-1.5">
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase bg-black/70 text-gray-300 border border-border/50">
                                {card.rarity}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-xs font-bold text-gray-200 truncate">{card.name}</div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-[10px] text-gray-500 font-mono">#{card.number}</span>
                          {card.nmPrice != null && (
                            <span className="text-[10px] text-dexGreen font-mono font-bold">
                              ${card.nmPrice.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                <Pagination
                  page={expView.page}
                  total={expView.total}
                  limit={expView.limit}
                  onPage={handleExpDetailPage}
                />
              </>
            )}
          </div>
        )}

        {/* ── Card Detail ─────────────────────────────────────────── */}
        {mode === 'card' && (
          <div className="animate-in">
            {cardView.loading && <Loader />}
            {cardView.error && (
              <ErrorBanner
                message={cardView.error}
                onRetry={() => cardId && fetchCardDetail(cardId)}
              />
            )}

            {!cardView.loading && !cardView.error && cardView.card && (
              <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-12 gap-8">
                  {/* Left: Card Image & Quick Stats */}
                  <div className="col-span-12 md:col-span-4 lg:col-span-3">
                    <FlipCardImage
                      src={cardView.card.imageLarge || cardView.card.image}
                      alt={cardView.card.name}
                    />

                    {/* Quick Stats */}
                    <div className="mt-4 bg-panel border border-border rounded-xl p-4 space-y-3">
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">
                          Artist
                        </div>
                        <div className="text-sm text-white font-mono">
                          {cardView.card.artist || 'Unknown'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">
                          Rarity
                        </div>
                        <div className="text-sm text-white font-mono">
                          {cardView.card.rarity || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">
                          Supertype
                        </div>
                        <div className="text-sm text-white font-mono">
                          {cardView.card.supertype || 'N/A'}
                        </div>
                      </div>
                      {cardView.card.subtypes && cardView.card.subtypes.length > 0 && (
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">
                            Subtypes
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {cardView.card.subtypes.map((st) => (
                              <span
                                key={st}
                                className="px-2 py-0.5 bg-charcoal border border-border text-white font-mono text-[10px] rounded"
                              >
                                {st}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {cardView.card.marketPrice != null && (
                        <div className="pt-2 border-t border-border/50">
                          <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">
                            Market Price
                          </div>
                          <div className="text-lg text-dexGreen font-mono font-bold">
                            ${cardView.card.marketPrice.toFixed(2)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle: Card Info */}
                  <div className="col-span-12 md:col-span-8 lg:col-span-5 space-y-6">
                    {/* Title */}
                    <div>
                      <h2 className="text-4xl font-bold text-white mb-2 font-sans">
                        {cardView.card.name}
                      </h2>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-gray-400 font-mono text-sm">
                          {cardView.card.supertype}
                          {cardView.card.subtypes.length > 0 &&
                            ` \u2022 ${cardView.card.subtypes.join(', ')}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Set info */}
                        {cardView.expansion && (
                          <div className="flex items-center gap-2 bg-charcoal border border-border px-3 py-1.5 rounded">
                            {cardView.expansion.logo && (
                              <img
                                src={cardView.expansion.logo}
                                alt=""
                                className="h-4 object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                            <span className="text-xs font-mono text-gray-300">
                              {cardView.expansion.name}
                            </span>
                            <span className="text-[10px] text-gray-500 font-mono">
                              ({cardView.expansion.code})
                            </span>
                          </div>
                        )}
                        <span className="px-2 py-1 bg-panel border border-border rounded text-xs font-mono text-gray-400">
                          #{cardView.card.number}
                        </span>
                      </div>
                    </div>

                    {/* Card Image (large, for wider screens) */}
                    {cardView.card.imageLarge && (
                      <div className="hidden lg:block">
                        <div className="bg-charcoal p-3 rounded-lg border border-border/50 italic text-gray-400 text-xs border-l-2 border-l-dexBlue">
                          <span className="text-dexBlue font-bold not-italic">Tip:</span> Click the
                          card image on the left to flip it.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Variant Pricing */}
                  <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-panel border border-border rounded-xl p-6">
                      <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                        <I.Box s={14} /> Variant Pricing
                      </h3>

                      {/* Variant Selector Tabs */}
                      {cardView.variants.length > 0 ? (
                        <>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {cardView.variants.map((v, i) => (
                              <button
                                key={i}
                                onClick={() =>
                                  setCardView((prev) => ({ ...prev, variantIdx: i }))
                                }
                                className={`px-3 py-1.5 rounded text-xs font-mono transition-all border ${
                                  cardView.variantIdx === i
                                    ? 'bg-dexBlue/20 border-dexBlue text-dexBlue font-bold'
                                    : 'bg-charcoal border-border text-gray-400 hover:border-gray-500'
                                }`}
                              >
                                {v.name}
                              </button>
                            ))}
                          </div>

                          {/* Variant image */}
                          {cardView.variants[cardView.variantIdx]?.image && (
                            <div className="mb-4">
                              <img
                                src={cardView.variants[cardView.variantIdx].image!}
                                alt={cardView.variants[cardView.variantIdx].name}
                                className="w-full max-w-[200px] mx-auto rounded-lg border border-border"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          )}

                          {/* Inline Pricing */}
                          <InlinePricing variant={cardView.variants[cardView.variantIdx]} />
                        </>
                      ) : (
                        <div className="text-center py-8 text-gray-600 text-xs font-mono">
                          No variant data available.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CatalogueView;
