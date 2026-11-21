import { useState } from 'react';
import { CheckCircle2, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type { CartItem, Order, Product } from '../types.ts';
import { formatINR } from '../utils/currency.ts';

interface CartDrawerProps {
  open: boolean;
  items: CartItem[];
  wishlistProducts: Product[];
  shopifyStoreUrl: string;
  userEmail?: string;
  userName?: string;
  onClose: () => void;
  onUpdateQty: (productId: string, finish: string, delta: number) => void;
  onRemoveItem: (productId: string, finish: string) => void;
  onMoveWishlistToBag: (product: Product) => void;
  onCheckout: (payload: {
    customerName: string;
    customerEmail: string;
    shippingAddress: string;
  }) => Promise<Order>;
}

export function CartDrawer({
  open,
  items,
  wishlistProducts,
  shopifyStoreUrl,
  userEmail,
  userName,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onMoveWishlistToBag,
  onCheckout,
}: CartDrawerProps) {
  const [tab, setTab] = useState<'bag' | 'wishlist'>('bag');
  const [customerName, setCustomerName] = useState(userName || '');
  const [customerEmail, setCustomerEmail] = useState(userEmail || '');
  const [shippingAddress, setShippingAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  if (!open) return null;

  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const order = await onCheckout({
        customerName,
        customerEmail,
        shippingAddress,
      });
      setConfirmedOrder(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-l border-black/[0.08]"
      >
        <div className="flex items-center justify-between border-b border-black/[0.08] px-6 py-4">
          <div className="flex items-center gap-1 rounded-lg bg-[#F5F5F7] p-1">
            <button
              type="button"
              onClick={() => {
                setTab('bag');
                setConfirmedOrder(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                tab === 'bag' ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#6E6E73]'
              }`}
            >
              Bag ({items.reduce((s, i) => s + i.quantity, 0)})
            </button>
            <button
              type="button"
              onClick={() => setTab('wishlist')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                tab === 'wishlist' ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#6E6E73]'
              }`}
            >
              Wishlist ({wishlistProducts.length})
            </button>
          </div>
          <button
            type="button"
            aria-label="Close drawer"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F5F7] text-[#1D1D1F]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {confirmedOrder ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-800">
                <CheckCircle2 className="h-6 w-6 shrink-0" />
                <div>
                  <h3 className="font-display text-base font-semibold">
                    Order {confirmedOrder.id} Confirmed
                  </h3>
                  <p className="text-xs">
                    {confirmedOrder.shopifyOrderId
                      ? `Synced directly to Shopify (${confirmedOrder.shopifyOrderId})`
                      : 'Saved locally & queued for Shopify sync'}
                  </p>
                </div>
              </div>
              <div className="border-t border-emerald-200/80 pt-3 space-y-2 text-xs text-[#1D1D1F]">
                <p>
                  Destination store: <span className="font-medium">{shopifyStoreUrl}</span>
                </p>
                <p className="font-mono-tabular font-semibold">
                  Total Paid: {formatINR(confirmedOrder.total)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmedOrder(null);
                  onClose();
                }}
                className="w-full rounded-xl bg-[#1D1D1F] py-2.5 text-xs font-medium text-white"
              >
                Continue Exploring
              </button>
            </div>
          ) : tab === 'wishlist' ? (
            wishlistProducts.length === 0 ? (
              <div className="py-16 text-center text-xs text-[#6E6E73]">
                No saved items in your wishlist yet.
              </div>
            ) : (
              <div className="space-y-4">
                {wishlistProducts.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3.5 rounded-2xl border border-black/[0.06] p-3"
                  >
                    <img
                      src={p.images[0]}
                      alt={p.title}
                      referrerPolicy="no-referrer"
                      className="h-16 w-20 rounded-xl object-cover bg-[#F5F5F7]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-display text-sm font-semibold text-[#1D1D1F]">
                        {p.title}
                      </p>
                      <p className="font-mono-tabular text-xs text-[#6E6E73]">
                        {formatINR(p.price)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onMoveWishlistToBag(p);
                        setTab('bag');
                      }}
                      className="rounded-lg bg-[#0071E3] px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap shrink-0"
                    >
                      Move to Bag
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : items.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <ShoppingBag className="mx-auto h-8 w-8 text-[#86868B]" />
              <p className="font-display text-sm font-semibold text-[#1D1D1F]">Your bag is empty</p>
              <p className="text-xs text-[#6E6E73]">
                Add precision hardware from the storefront to begin checkout.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={`${item.product.id}-${item.finish}`}
                    className="flex gap-3.5 border-b border-black/[0.06] pb-4"
                  >
                    <img
                      src={item.product.images[0]}
                      alt={item.product.title}
                      referrerPolicy="no-referrer"
                      className="h-20 w-24 shrink-0 rounded-xl object-cover bg-[#F5F5F7]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="truncate font-display text-sm font-semibold text-[#1D1D1F]">
                          {item.product.title}
                        </h4>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.product.id, item.finish)}
                          className="text-[#86868B] hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-xs text-[#6E6E73]">{item.finish}</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <div className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-2 py-1">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.product.id, item.finish, -1)}
                            className="text-[#1D1D1F]"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="font-mono-tabular text-xs font-medium w-4 text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.product.id, item.finish, 1)}
                            className="text-[#1D1D1F]"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="font-mono-tabular text-sm font-semibold text-[#1D1D1F]">
                          {formatINR(item.product.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleCheckoutSubmit} className="space-y-3 pt-2">
                <h3 className="font-display text-sm font-semibold text-[#1D1D1F]">
                  Express Checkout & Shopify Order Sync
                </h3>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-xs text-[#1D1D1F]"
                />
                <input
                  type="email"
                  required
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Email for receipt & tracking"
                  className="w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-xs text-[#1D1D1F]"
                />
                <input
                  type="text"
                  required
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Shipping Address, City, Postal Code"
                  className="w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-xs text-[#1D1D1F]"
                />

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex items-center justify-between pt-2 text-sm">
                  <span className="text-[#6E6E73]">Subtotal (Free Delivery)</span>
                  <span className="font-mono-tabular font-semibold text-[#1D1D1F]">
                    {formatINR(subtotal)}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-[#0071E3] py-3.5 text-sm font-medium text-white hover:bg-[#0077ED] disabled:opacity-60 transition-colors"
                >
                  {submitting
                    ? 'Syncing Order to Shopify...'
                    : `Place Order · ${formatINR(subtotal)}`}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
