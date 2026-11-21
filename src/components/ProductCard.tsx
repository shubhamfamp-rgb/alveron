import { Heart, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import type { Product } from '../types.ts';
import { formatINR } from '../utils/currency.ts';

interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  onSelect: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  onQuickAdd: (product: Product) => void;
}

const SOURCE_LABELS: Record<Product['source'], string> = {
  alveron: 'Alveron Direct',
  shopify: 'Shopify Sync',
  amazon: 'Amazon',
  flipkart: 'Flipkart',
};

export function ProductCard({
  product,
  isWishlisted,
  onSelect,
  onToggleWishlist,
  onQuickAdd,
}: ProductCardProps) {
  const hasDiscount = Boolean(product.originalPrice && product.originalPrice > product.price);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="group relative flex flex-col justify-between rounded-2xl bg-white p-4 border border-black/[0.06] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)]"
    >
      <div>
        <div
          onClick={() => onSelect(product)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(product);
            }
          }}
          className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#F5F5F7] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0071E3]"
        >
          {product.images[0] ? (
            <img
              src={product.images[0]}
              alt={product.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#F5F5F7] to-[#E5E5EA] text-xs text-[#6E6E73]">
              {product.title}
            </div>
          )}

          <button
            type="button"
            aria-label={isWishlisted ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleWishlist(product.id);
            }}
            className={`absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.06] bg-white/90 transition-colors ${
              isWishlisted ? 'text-[#E11D48]' : 'text-[#6E6E73] hover:text-[#1D1D1F]'
            }`}
          >
            <Heart className="h-4 w-4" fill={isWishlisted ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Unboxed clean metadata with typographic separator */}
        <div className="mt-4 flex items-center gap-1.5 text-xs uppercase tracking-wider text-[#6E6E73]">
          <span>{product.category}</span>
          <span aria-hidden="true">·</span>
          <span>{SOURCE_LABELS[product.source]}</span>
          <span aria-hidden="true">·</span>
          <span className="text-[#0071E3] font-medium">360° 3D</span>
        </div>

        <h3
          onClick={() => onSelect(product)}
          className="mt-1.5 font-display text-base font-semibold leading-snug text-[#1D1D1F] cursor-pointer group-hover:text-[#0071E3] transition-colors"
        >
          {product.title}
        </h3>
      </div>

      <div className="mt-4 flex items-center justify-between pt-3 border-t border-black/[0.05]">
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="font-mono-tabular text-[15px] font-medium text-[#1D1D1F]">
            {formatINR(product.price)}
          </span>
          {hasDiscount && product.originalPrice && (
            <span className="font-mono-tabular text-xs text-[#86868B] line-through">
              {formatINR(product.originalPrice)}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onQuickAdd(product)}
          className="flex items-center gap-1 rounded-lg bg-[#F5F5F7] px-3 py-1.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#1D1D1F] hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add</span>
        </button>
      </div>
    </motion.article>
  );
}
