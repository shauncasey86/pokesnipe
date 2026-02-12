import { useState, useEffect } from 'react';
import { I } from '../../icons';
import { getDealDetail } from '../../api/deals';
import type { Deal, DealDetail as DealDetailType, ConditionCompEntry } from '../../types/deals';

import { DetailHeader } from './DetailHeader';
import { DetailSkeleton } from './DetailSkeleton';
import { PricingSection } from './PricingSection';
import { SignalCards } from './SignalCards';
import { ConditionComps } from './ConditionComps';
import { PriceTrend } from './PriceTrend';
import { MatchReview } from './MatchReview';
import { EbayCTA } from './EbayCTA';
import { Section } from './Section';

interface DetailPanelProps {
  dealSummary: Deal;
  onReviewDeal: (dealId: string, isCorrect: boolean) => void;
  onClose?: () => void;
  mobile?: boolean;
}

export function DetailPanel({ dealSummary, onReviewDeal, onClose, mobile }: DetailPanelProps) {
  const [detail, setDetail] = useState<DealDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailScr, setDetailScr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setDetailScr(false);
    getDealDetail(dealSummary.deal_id).then(d => {
      if (!cancelled) { setDetail(d); setLoading(false); }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [dealSummary.deal_id]);

  const d = detail ?? dealSummary;
  const cardImg = detail?.card_image_url ?? null;
  const ebayImg = d.ebay_image_url;
  const displayImg = detailScr && cardImg ? cardImg : ebayImg;
  const canFlipImg = !!cardImg && !!ebayImg;
  const [mountTime] = useState(Date.now);
  const stale = d.status === 'expired' || d.status === 'sold' || (mountTime - new Date(d.created_at).getTime() > 60 * 60000);
  const rv = d.is_correct_match;

  // Signals from detail
  const confSignals = detail?.match_signals?.confidence ?? null;
  const liqSignals = detail?.match_signals?.liquidity ?? null;

  // Condition comps — prefer deal's condition_comps (GBP-converted), fall back to variant_prices (USD)
  const condComps = detail?.condition_comps;
  const rawComps = detail?.variant_prices;
  const compsGBP: Record<string, { market: number; low: number }> | null =
    condComps ? Object.fromEntries(
      Object.entries(condComps).map(([k, v]: [string, ConditionCompEntry]) => [k, { market: v.marketGBP, low: v.lowGBP }])
    ) : rawComps ?? null;

  // Trends from variant_trends
  const variantTrends = detail?.variant_trends ?? null;

  const wrapperClass = mobile
    ? 'fixed inset-0 bg-surface flex flex-col z-50 drawer-enter'
    : 'hidden lg:flex w-[45%] xl:w-[40%] bg-surface flex-col shadow-[-20px_0_40px_rgba(0,0,0,.3)] z-10';

  return (
    <div className={wrapperClass}>
      {/* Mobile back button */}
      {mobile && onClose && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface shrink-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border bg-obsidian hover:bg-surfaceHover transition-colors"
            aria-label="Back to deal list"
          >
            <I.ArrowLeft s={18} c="text-white" />
          </button>
          <span className="text-sm font-semibold text-white truncate">{d.cardName || d.ebay_title}</span>
        </div>
      )}

      {loading && !detail ? (
        <DetailSkeleton />
      ) : (
        <div key={dealSummary.deal_id} className="detail-enter flex flex-col flex-1 min-h-0">
          <DetailHeader
            d={d}
            detail={detail}
            displayImg={displayImg}
            canFlipImg={canFlipImg}
            detailScr={detailScr}
            onToggleImg={() => setDetailScr(p => !p)}
          />

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Loading indicator for detail enrichment */}
            {loading && (
              <div className="text-center py-2">
                <I.Loader s={16} c="text-brand mx-auto" />
                <p className="text-[10px] text-muted mt-1">Enriching&hellip;</p>
              </div>
            )}

            <Section id="economics" title="Deal Economics" defaultOpen={true}>
              <PricingSection d={d} />
            </Section>

            <Section id="quality" title="Match Quality" defaultOpen={true}>
              <SignalCards d={d} confSignals={confSignals} liqSignals={liqSignals} />
            </Section>

            <Section id="market" title="Market Context" defaultOpen={true}>
              {compsGBP && (
                <ConditionComps compsGBP={compsGBP} activeCondition={d.condition} />
              )}
              <PriceTrend
                trend7d={d.trend_7d}
                trend30d={d.trend_30d}
                variantTrends={variantTrends}
                condition={d.condition}
              />
            </Section>

            <Section id="review" title="Review" defaultOpen={true}>
              <MatchReview
                dealId={dealSummary.deal_id}
                isCorrectMatch={rv}
                incorrectReason={d.incorrect_reason}
                onReviewDeal={onReviewDeal}
                onDetailUpdate={(updates) => {
                  if (detail) {
                    setDetail({ ...detail, ...updates });
                  }
                }}
              />
            </Section>
          </div>

          <EbayCTA
            ebayUrl={d.ebay_url}
            stale={stale}
            sellerName={d.seller_name}
            sellerFeedback={d.seller_feedback}
          />
        </div>
      )}
    </div>
  );
}
