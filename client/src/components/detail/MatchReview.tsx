import { useState, useRef } from 'react';
import { I } from '../../icons';
import { reviewDeal, searchCards } from '../../api/deals';
import type { CardSearchResult } from '../../api/deals';

interface MatchReviewProps {
  dealId: string;
  isCorrectMatch: boolean | null;
  incorrectReason: string | null;
  onReviewDeal: (dealId: string, isCorrect: boolean) => void;
  onDetailUpdate: (updates: { is_correct_match: boolean; reviewed_at: string; incorrect_reason: string | null }) => void;
}

const REASON_LABELS: Record<string, string> = {
  wrong_card: 'Wrong card',
  wrong_set: 'Wrong set',
  wrong_condition: 'Wrong condition',
  wrong_variant: 'Wrong variant',
  wrong_price: 'Wrong price',
  bad_image: 'Bad image',
  junk_listing: 'Junk listing',
};

const REASONS = [
  ['wrong_card', 'Wrong Card', 'Matched a completely different card'],
  ['wrong_set', 'Wrong Set', 'Right card, wrong expansion'],
  ['wrong_variant', 'Wrong Variant', 'Right card, wrong variant (holo/reverse/etc)'],
  ['wrong_condition', 'Wrong Condition', 'Condition was misidentified'],
  ['wrong_price', 'Wrong Price', 'Market price was inaccurate'],
  ['bad_image', 'Bad Image', 'Image doesn\'t match listing'],
] as const;

const CORRECTION_REASONS = ['wrong_card', 'wrong_set', 'wrong_variant'];

export function MatchReview({ dealId, isCorrectMatch: rv, incorrectReason, onReviewDeal, onDetailUpdate }: MatchReviewProps) {
  const [reviewLoading, setReviewLoading] = useState(false);
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [pendingReason, setPendingReason] = useState<string | null>(null);
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState<CardSearchResult[]>([]);
  const [cardSearchLoading, setCardSearchLoading] = useState(false);
  const [selectedCorrectCard, setSelectedCorrectCard] = useState<CardSearchResult | null>(null);
  const cardSearchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const handleReview = async (isCorrect: boolean, reason?: string, correctCardId?: string) => {
    setReviewLoading(true);
    try {
      await reviewDeal(dealId, isCorrect, reason, correctCardId);
      onDetailUpdate({
        is_correct_match: isCorrect,
        reviewed_at: new Date().toISOString(),
        incorrect_reason: reason || null,
      });
      onReviewDeal(dealId, isCorrect);
      setShowReasonPicker(false);
      setPendingReason(null);
      setSelectedCorrectCard(null);
      setCardSearchQuery('');
      setCardSearchResults([]);
    } catch { /* ignore */ }
    setReviewLoading(false);
  };

  const handleCardSearch = (query: string) => {
    setCardSearchQuery(query);
    if (cardSearchTimer.current) clearTimeout(cardSearchTimer.current);
    if (query.trim().length < 2) { setCardSearchResults([]); return; }
    setCardSearchLoading(true);
    cardSearchTimer.current = setTimeout(async () => {
      try {
        const res = await searchCards(query.trim(), 8);
        setCardSearchResults(res.data);
      } catch { setCardSearchResults([]); }
      setCardSearchLoading(false);
    }, 300);
  };

  return (
    <>
      <div className={'bg-obsidian border rounded-xl p-4 ' + (rv === true ? 'border-profit/30' : rv === false ? 'border-risk/30' : 'border-border')}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Match Review</div>
            {rv != null ? (
              <div className={'text-[11px] mt-1 font-semibold ' + (rv ? 'text-profit' : 'text-risk')}>
                Marked as {rv ? 'correct' : 'incorrect'}
                {incorrectReason ? ` \u2014 ${REASON_LABELS[incorrectReason] || incorrectReason}` : ''}
              </div>
            ) : showReasonPicker ? (
              <div className="text-[11px] text-muted mt-1">What was wrong?</div>
            ) : (
              <div className="text-[11px] text-muted mt-1">Was this card match correct?</div>
            )}
          </div>
          {!showReasonPicker && (
            <div className="flex gap-2">
              <button
                onClick={() => handleReview(true)}
                disabled={reviewLoading}
                className={'p-2 rounded-lg border transition-all ' + (rv === true ? 'bg-profit/20 border-profit/40 text-profit' : 'border-border bg-surface hover:bg-profit/10 hover:border-profit/30 hover:text-profit text-muted')}
                title="Correct match"
                aria-label="Mark as correct match"
              >
                {rv === true ? <I.Check s={16} c="w-4 h-4" /> : <I.Up s={16} c="w-4 h-4" />}
              </button>
              <button
                onClick={() => { if (rv == null) setShowReasonPicker(true); else handleReview(false); }}
                disabled={reviewLoading}
                className={'p-2 rounded-lg border transition-all ' + (rv === false ? 'bg-risk/20 border-risk/40 text-risk' : 'border-border bg-surface hover:bg-risk/10 hover:border-risk/30 hover:text-risk text-muted')}
                title="Incorrect match"
                aria-label="Mark as incorrect match"
              >
                {rv === false ? <I.X s={16} c="w-4 h-4" /> : <I.Down s={16} c="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {/* Reason picker */}
        {showReasonPicker && rv == null && !pendingReason && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              {REASONS.map(([value, label, desc]) => (
                <button
                  key={value}
                  onClick={() => {
                    if (CORRECTION_REASONS.includes(value)) {
                      setPendingReason(value);
                    } else {
                      handleReview(false, value);
                    }
                  }}
                  disabled={reviewLoading}
                  className="text-left p-2.5 rounded-lg border border-border bg-surface hover:bg-risk/10 hover:border-risk/30 transition-all group"
                >
                  <div className="text-[11px] font-semibold text-white/80 group-hover:text-risk">{label}</div>
                  <div className="text-[9px] text-muted mt-0.5 leading-tight">{desc}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowReasonPicker(false)}
              className="w-full text-[10px] text-muted hover:text-white/60 py-1 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Card search for correction */}
        {pendingReason && rv == null && (
          <div className="mt-3 space-y-2">
            <div className="text-[10px] text-muted mb-1">Know the correct card? Search below, or skip to submit.</div>
            <div className="relative">
              <I.Search c="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <input
                type="text"
                value={cardSearchQuery}
                onChange={e => handleCardSearch(e.target.value)}
                placeholder="Search card name or number..."
                autoFocus
                className="w-full bg-obsidian border border-border rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand placeholder:text-muted/50"
              />
              {cardSearchLoading && <I.Loader s={14} c="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand" />}
            </div>
            {selectedCorrectCard && (
              <div className="flex items-center gap-2 p-2 rounded-lg border border-profit/30 bg-profit/5">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-profit truncate">{selectedCorrectCard.name}</div>
                  <div className="text-[9px] text-muted font-mono">{selectedCorrectCard.number} &middot; {selectedCorrectCard.expansion_name}</div>
                </div>
                <button onClick={() => setSelectedCorrectCard(null)} className="text-muted hover:text-white shrink-0"><I.X s={14} c="w-3.5 h-3.5" /></button>
              </div>
            )}
            {!selectedCorrectCard && cardSearchResults.length > 0 && (
              <div className="max-h-36 overflow-y-auto space-y-0.5 border border-border rounded-lg">
                {cardSearchResults.map(card => (
                  <button
                    key={card.scrydex_card_id}
                    onClick={() => { setSelectedCorrectCard(card); setCardSearchResults([]); setCardSearchQuery(''); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface/80 transition-colors flex items-center gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-white truncate">{card.name}</div>
                      <div className="text-[9px] text-muted font-mono">{card.number} &middot; {card.expansion_name}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => handleReview(false, pendingReason, selectedCorrectCard?.scrydex_card_id)}
                disabled={reviewLoading}
                className="flex-1 py-2 text-[11px] font-semibold rounded-lg bg-risk/20 border border-risk/40 text-risk hover:bg-risk/30 transition-all disabled:opacity-50"
              >
                {reviewLoading ? 'Submitting...' : selectedCorrectCard ? 'Submit with correction' : 'Submit without correction'}
              </button>
              <button
                onClick={() => { setPendingReason(null); setSelectedCorrectCard(null); setCardSearchQuery(''); setCardSearchResults([]); }}
                className="px-3 py-2 text-[10px] text-muted hover:text-white/60 border border-border rounded-lg transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Report Junk — separate from match review */}
      {rv == null && !showReasonPicker && (
        <button
          onClick={() => handleReview(false, 'junk_listing')}
          disabled={reviewLoading}
          className="w-full flex items-center gap-2.5 p-3 rounded-xl border border-warn/20 bg-warn/5 hover:bg-warn/10 hover:border-warn/40 transition-all group disabled:opacity-50"
        >
          <I.ShieldOff s={14} c="text-warn shrink-0" />
          <div className="text-left flex-1">
            <div className="text-[11px] font-semibold text-warn/80 group-hover:text-warn">Report Junk</div>
            <div className="text-[9px] text-muted leading-tight">Fake, fan art, proxy, or not a real card</div>
          </div>
        </button>
      )}
      {incorrectReason === 'junk_listing' && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl border border-warn/30 bg-warn/5">
          <I.ShieldOff s={14} c="text-warn shrink-0" />
          <div className="text-[11px] font-semibold text-warn">Reported as junk listing</div>
        </div>
      )}
    </>
  );
}
