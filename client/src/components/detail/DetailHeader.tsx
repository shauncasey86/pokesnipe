import { I } from '../../icons';
import { Tier } from '../shared';
import { timeAgo, fmtListedTime } from '../../data/mock';
import type { Deal, DealDetail } from '../../types/deals';

interface DetailHeaderProps {
  d: Deal;
  detail: DealDetail | null;
  displayImg: string | null;
  canFlipImg: boolean;
  detailScr: boolean;
  onToggleImg: () => void;
}

export function DetailHeader({ d, detail, displayImg, canFlipImg, detailScr, onToggleImg }: DetailHeaderProps) {
  return (
    <div className="p-6 border-b border-border shrink-0 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand rounded-full blur-[100px] opacity-10 pointer-events-none" />

      {/* Top row: badges */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Tier t={d.tier} />
        <span className="text-[10px] font-mono text-muted bg-surfaceHover px-2 py-0.5 rounded border border-border">
          {d.condition}{d.is_graded ? ' \u00b7 ' + d.grading_company + ' ' + d.grade : ''}
        </span>
        {detail?.variant_name && (
          <span className="text-[10px] font-mono text-brand/80 bg-brand/10 px-2 py-0.5 rounded border border-brand/20">
            <I.Tag s={10} c="inline-block mr-1 -mt-px" />{detail.variant_name}
          </span>
        )}
      </div>

      {/* Image + info row */}
      <div className="flex gap-5 items-start">
        {/* Card image — larger with tilt */}
        <div
          className="card-tilt shrink-0"
          onClick={() => { if (canFlipImg) onToggleImg(); }}
          style={{ cursor: canFlipImg ? 'pointer' : 'default' }}
        >
          <div className="w-36 h-52 rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-obsidian relative image-glow card-tilt-inner">
            {displayImg ? (
              <img src={displayImg} alt={d.cardName || d.ebay_title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><I.Search s={28} c="text-muted/30" /></div>
            )}
            <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/10 to-transparent opacity-50 mix-blend-overlay pointer-events-none" />
            {canFlipImg && (
              <button
                className={'absolute bottom-1.5 left-1.5 text-[8px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ' + (detailScr ? 'bg-brand/90 text-white' : 'bg-white/80 text-obsidian')}
                aria-label={'Showing ' + (detailScr ? 'Scrydex' : 'eBay') + ' image. Click to toggle.'}
              >
                {detailScr ? 'Scrydex' : 'eBay'}
              </button>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 pt-1">
          {/* Title */}
          <h2 className="text-xl font-bold text-white leading-tight mb-2 line-clamp-2">{d.cardName || d.ebay_title}</h2>

          {/* Card Identity */}
          <div className="mb-3 space-y-1.5">
            <p className="text-sm text-muted font-mono">{d.card_number ?? '?'}</p>
            {detail?.expansion_name && (
              <div className="flex items-center gap-2 bg-obsidian rounded-lg px-2.5 py-1.5 border border-border/50">
                {detail.expansion_logo && (
                  <img
                    src={detail.expansion_logo}
                    alt={detail.expansion_name}
                    className="w-5 h-5 object-contain shrink-0 opacity-80"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-white truncate">{detail.expansion_name}</div>
                  <div className="text-[9px] text-muted font-mono truncate">
                    {detail.expansion_series}
                    {detail.expansion_card_count ? ' \u00b7 ' + detail.expansion_card_count + ' cards' : ''}
                    {detail.expansion_release_date ? ' \u00b7 ' + new Date(detail.expansion_release_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Listing source */}
          <div className="flex items-center gap-3 text-xs text-muted pt-1 border-t border-border/30">
            {d.seller_name && (
              <div className="flex items-center gap-1.5">
                <I.Store s={13} c="w-3.5 h-3.5 shrink-0" />
                <span>{d.seller_name}</span>
                {d.seller_feedback != null && <span className="text-white/70">({d.seller_feedback.toLocaleString()})</span>}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <I.Clock s={13} c="w-3.5 h-3.5 shrink-0" />
              <span title={fmtListedTime(d.created_at)}>{timeAgo(d.created_at)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
