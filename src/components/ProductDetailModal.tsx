import { useMemo, useState } from 'react';
import { Bell, Box, ChevronLeft, ChevronRight, Heart, ShoppingBag, Star, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { Product } from '../types.ts';
import { formatINR } from '../utils/currency.ts';
import { Product3DViewer } from './Product3DViewer.tsx';

interface ProductDetailModalProps {
  product: Product;
  allProducts: Product[];
  isWishlisted: boolean;
  userEmail?: string;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, finish: string) => void;
  onToggleWishlist: (productId: string) => void;
  onCreatePriceAlert: (productId: string, targetPrice: number, email: string) => Promise<void>;
}

export function ProductDetailModal({
  product,
  allProducts,
  isWishlisted,
  userEmail,
  onClose,
  onSelectProduct,
  onAddToCart,
  onToggleWishlist,
  onCreatePriceAlert,
}: ProductDetailModalProps) {
  // Final slide index (product.images.length) is always the 360° 3D Studio Twin
  const totalSlides = product.images.length + 1;
  const [slideIndex, setSlideIndex] = useState(0);
  const [selectedFinish, setSelectedFinish] = useState(
    product.model3D.finishes[0]?.name ?? 'Natural Titanium',
  );
  const [alertOpen, setAlertOpen] = useState(false);
  const [targetPrice, setTargetPrice] = useState(Math.max(10, Math.round(product.price * 0.9)));
  const [alertEmail, setAlertEmail] = useState(userEmail ?? '');
  const [alertSaved, setAlertSaved] = useState(false);

  const is3DSlide = slideIndex === product.images.length;

  const relatedProducts = useMemo(() => {
    const baseKeywords = new Set(product.keywords.map((k) => k.toLowerCase()));
    return allProducts
      .filter((p) => p.id !== product.id)
      .map((p) => {
        const overlap = p.keywords.filter((k) => baseKeywords.has(k.toLowerCase())).length;
        const catBonus = p.category === product.category ? 2 : 0;
        return { product: p, score: overlap + catBonus };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.product);
  }, [product, allProducts]);

  const handleAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }
    await onCreatePriceAlert(product.id, targetPrice, alertEmail || 'alerts@alveron.store');
    setAlertSaved(true);
    setTimeout(() => {
      setAlertOpen(false);
      setAlertSaved(false);
    }, 1400);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="relative my-auto max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl bg-white p-5 sm:p-8 shadow-2xl border border-black/[0.08]"
      >
        <button
          type="button"
          aria-label="Close product details"
          onClick={onClose}
          className="absolute top-5 right-5 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Contiguous 2-column PDP module */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          {/* Left Sticky Gallery + Final 360° 3D Slide */}
          <div className="lg:col-span-7 lg:sticky lg:top-0 space-y-4">
            <div className="relative overflow-hidden rounded-2xl bg-[#F5F5F7]">
              {is3DSlide ? (
                <Product3DViewer
                  blueprint={product.model3D}
                  productTitle={product.title}
                  selectedFinish={selectedFinish}
                  onSelectFinish={setSelectedFinish}
                />
              ) : (
                <div className="relative aspect-[4/3] w-full">
                  <img
                    src={product.images[slideIndex]}
                    alt={`${product.title} view ${slideIndex + 1}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              {/* Carousel arrows */}
              <button
                type="button"
                aria-label="Previous media"
                onClick={() => setSlideIndex((i) => (i - 1 + totalSlides) % totalSlides)}
                className="absolute top-1/2 left-3 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#1D1D1F] shadow-sm hover:bg-white transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next media"
                onClick={() => setSlideIndex((i) => (i + 1) % totalSlides)}
                className="absolute top-1/2 right-3 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#1D1D1F] shadow-sm hover:bg-white transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Thumbnail strip with 360° 3D Twin at the end */}
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {product.images.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  type="button"
                  onClick={() => setSlideIndex(idx)}
                  className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-xl border transition-all ${
                    slideIndex === idx
                      ? 'border-[#0071E3] ring-2 ring-[#0071E3]/25'
                      : 'border-black/10 opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={img}
                    alt={`Thumbnail ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSlideIndex(product.images.length)}
                className={`flex h-16 px-4 shrink-0 items-center gap-2 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap ${
                  is3DSlide
                    ? 'border-[#0071E3] bg-[#0071E3] text-white'
                    : 'border-black/10 bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]'
                }`}
              >
                <Box className="h-4 w-4" />
                <span>360° 3D Twin</span>
              </button>
            </div>
          </div>

          {/* Right Sticky Purchase Module */}
          <div className="lg:col-span-5 space-y-6 pr-2">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[#6E6E73]">
                <span>{product.brand}</span>
                <span aria-hidden="true">·</span>
                <span>{product.category}</span>
                <span aria-hidden="true">·</span>
                <span>{product.sku}</span>
              </div>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#1D1D1F] text-balance">
                {product.title}
              </h2>

              <div className="mt-3 flex items-center gap-4">
                <div className="flex items-baseline gap-2.5 tabular-nums">
                  <span className="font-mono-tabular text-2xl font-semibold text-[#1D1D1F]">
                    {formatINR(product.price)}
                  </span>
                  {product.originalPrice && product.originalPrice > product.price && (
                    <span className="font-mono-tabular text-sm text-[#86868B] line-through">
                      {formatINR(product.originalPrice)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#6E6E73] inline-flex items-center gap-1 tabular-nums">
                  <Star className="h-3.5 w-3.5 fill-[#1D1D1F] text-[#1D1D1F]" />
                  {product.rating.toFixed(1)} ({product.reviewCount})
                </span>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-[#424245]">
              {product.description}
            </p>

            {/* Finish Selector */}
            {product.model3D.finishes.length > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#1D1D1F]">Finish</span>
                  <span className="text-[#6E6E73]">{selectedFinish}</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {product.model3D.finishes.map((f) => {
                    const active = selectedFinish === f.name;
                    return (
                      <button
                        key={f.name}
                        type="button"
                        onClick={() => setSelectedFinish(f.name)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'border-[#0071E3] bg-[#0071E3]/5 text-[#0071E3]'
                            : 'border-black/10 bg-white text-[#1D1D1F] hover:border-black/25'
                        }`}
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full border border-black/20"
                          style={{ backgroundColor: f.hex }}
                        />
                        <span>{f.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Primary Buy CTA & Secondary Actions */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => onAddToCart(product, selectedFinish)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-5 py-3.5 text-sm font-medium text-white hover:bg-[#0077ED] transition-colors"
              >
                <ShoppingBag className="h-4 w-4" />
                <span>Add to Bag — {formatINR(product.price)}</span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onToggleWishlist(product.id)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    isWishlisted
                      ? 'border-[#E11D48]/30 bg-[#E11D48]/5 text-[#E11D48]'
                      : 'border-black/10 bg-white text-[#1D1D1F] hover:bg-[#F5F5F7]'
                  }`}
                >
                  <Heart className="h-4 w-4" fill={isWishlisted ? 'currentColor' : 'none'} />
                  <span>{isWishlisted ? 'Saved in Wishlist' : 'Save to Wishlist'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAlertOpen((o) => !o)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors whitespace-nowrap"
                >
                  <Bell className="h-4 w-4" />
                  <span>Price Drop Alert</span>
                </button>
              </div>
            </div>

            {alertOpen && (
              <form
                onSubmit={handleAlertSubmit}
                className="rounded-2xl border border-black/10 bg-[#F5F5F7] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1D1D1F]">
                    Personalized Push & Email Alert
                  </span>
                  <span className="text-xs text-[#6E6E73] tabular-nums">
                    Current: {formatINR(product.price)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="number"
                    min={1}
                    max={product.price - 1}
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(Number(e.target.value))}
                    placeholder="Target ₹"
                    className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-[#1D1D1F] tabular-nums"
                  />
                  <input
                    type="email"
                    required
                    value={alertEmail}
                    onChange={(e) => setAlertEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-[#1D1D1F]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#1D1D1F] py-2 text-xs font-medium text-white hover:bg-black transition-colors"
                >
                  {alertSaved ? 'Alert Active — Push Enabled' : 'Enable Push Alert'}
                </button>
              </form>
            )}

            {/* Specifications */}
            <div className="border-t border-black/[0.06] pt-5">
              <div className="flex items-center justify-between text-xs">
                <h3 className="font-display font-semibold text-[#1D1D1F]">
                  Technical Specifications
                </h3>
                <span className="text-[#6E6E73] tabular-nums">
                  {product.stock > 0 ? `${product.stock} in stock` : 'Backordered'}
                </span>
              </div>
              <ul className="mt-3 space-y-2 text-xs text-[#424245]">
                {product.specs.map((spec) => (
                  <li key={spec} className="flex items-start gap-2">
                    <span className="text-[#0071E3]">—</span>
                    <span>{spec}</span>
                  </li>
                ))}
              </ul>
              {product.externalUrl && (
                <p className="mt-3 text-xs text-[#6E6E73]">
                  Origin listing: <span className="text-[#1D1D1F]">{product.source.toUpperCase()}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Related Products by Matching Keywords */}
        {relatedProducts.length > 0 && (
          <div className="mt-10 border-t border-black/[0.08] pt-8">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg font-semibold text-[#1D1D1F]">
                Related Products
              </h3>
              <span className="text-xs text-[#6E6E73]">
                Matched by keywords · {product.keywords.slice(0, 3).join(', ')}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {relatedProducts.map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => {
                    setSlideIndex(0);
                    onSelectProduct(rel);
                  }}
                  className="flex items-center gap-3.5 rounded-2xl border border-black/[0.06] bg-[#FAFAFA] p-3 text-left hover:bg-[#F5F5F7] transition-colors"
                >
                  <img
                    src={rel.images[0]}
                    alt={rel.title}
                    referrerPolicy="no-referrer"
                    className="h-16 w-20 shrink-0 rounded-xl object-cover bg-[#F5F5F7]"
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-[#6E6E73]">
                      {rel.category}
                    </p>
                    <p className="truncate font-display text-sm font-semibold text-[#1D1D1F]">
                      {rel.title}
                    </p>
                    <p className="mt-0.5 font-mono-tabular text-xs font-medium text-[#1D1D1F]">
                      {formatINR(rel.price)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
