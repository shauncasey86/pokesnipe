import { I } from '../../icons';

interface EbayCtaProps {
  ebayUrl: string;
  stale: boolean;
  sellerName: string | null;
  sellerFeedback: number | null;
}

export function EbayCTA({ ebayUrl, stale, sellerName, sellerFeedback }: EbayCtaProps) {
  return (
    <div className="p-6 border-t border-border bg-surface shrink-0">
      {stale && (
        <div className="text-center text-[10px] text-warn bg-warn/10 border border-warn/20 rounded-lg py-1.5 mb-3">
          This listing may no longer be available
        </div>
      )}
      <a
        href={ebayUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full bg-brand hover:bg-brand/90 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] hover:-translate-y-0.5"
        aria-label="Open listing on eBay"
      >
        <I.ExtLink c="w-5 h-5" />SNAG ON EBAY &rarr;
      </a>
      <div className="text-center text-[10px] text-muted mt-2">
        {sellerName}{sellerFeedback != null ? ' \u00b7 ' + sellerFeedback.toLocaleString() + ' feedback' : ''} &middot; Enter &#8629; to open
      </div>
    </div>
  );
}
