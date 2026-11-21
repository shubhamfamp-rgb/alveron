import { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { AdSlot, Product } from '../types.ts';
import { formatINR } from '../utils/currency.ts';

interface AdColumnProps {
  adSlots: AdSlot[];
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onTrackEvent: (adId: string, type: 'impression' | 'click', variant: 'A' | 'B') => void;
}

export function AdColumn({
  adSlots,
  products,
  onSelectProduct,
  onTrackEvent,
}: AdColumnProps) {
  const trackedImpressions = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const slot of adSlots.slice(0, 3)) {
      const key = `${slot.id}-${slot.activeVariant}`;
      if (!trackedImpressions.current.has(key)) {
        trackedImpressions.current.add(key);
        onTrackEvent(slot.id, 'impression', slot.activeVariant);
      }
    }
  }, [adSlots, onTrackEvent]);

  return (
    <aside aria-label="Partner Spotlight" className="space-y-6">
      <div className="flex items-baseline justify-between border-b border-black/[0.08] pb-3">
        <h2 className="font-display text-sm font-semibold text-[#1D1D1F]">
          Partner Spotlight
        </h2>
        <span className="text-xs text-[#6E6E73]">Shopify Capture</span>
      </div>

      <div className="space-y-5">
        {adSlots.slice(0, 3).map((slot) => {
          const copy = slot.activeVariant === 'B' ? slot.variantB : slot.variantA;
          const matchedProduct = products.find((p) => p.id === slot.productId);
          const stats = slot.stats[slot.activeVariant];
          const ctr =
            stats.impressions > 0
              ? ((stats.clicks / stats.impressions) * 100).toFixed(1)
              : '0.0';

          return (
            <div
              key={slot.id}
              className="group overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-center justify-between text-xs text-[#6E6E73]">
                <span>Sponsored · Variant {slot.activeVariant}</span>
                <span className="font-mono-tabular">{ctr}% CTR</span>
              </div>

              <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#F5F5F7]">
                <img
                  src={slot.productImage}
                  alt={slot.productTitle}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>

              <h3 className="mt-3.5 font-display text-sm font-semibold text-[#1D1D1F] leading-snug">
                {copy.headline}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[#6E6E73]">
                {copy.subcopy}
              </p>

              <div className="mt-3.5 flex items-center justify-between pt-3 border-t border-black/[0.05]">
                <span className="font-mono-tabular text-sm font-medium text-[#1D1D1F]">
                  {formatINR(slot.productPrice)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onTrackEvent(slot.id, 'click', slot.activeVariant);
                    if (matchedProduct) onSelectProduct(matchedProduct);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0071E3] hover:underline whitespace-nowrap shrink-0"
                >
                  <span>{copy.cta}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
