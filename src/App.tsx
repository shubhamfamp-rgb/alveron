import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Camera,
  Heart,
  Mic,
  MicOff,
  Search,
  ShoppingBag,
  User,
  X,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { AdColumn } from './components/AdColumn.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { LensSearchModal } from './components/LensSearchModal.tsx';
import { LiveScrollBackground } from './components/LiveScrollBackground.tsx';
import { MerchantHub } from './components/MerchantHub.tsx';
import { Product3DViewer } from './components/Product3DViewer.tsx';
import { ProductCard } from './components/ProductCard.tsx';
import { ProductDetailModal } from './components/ProductDetailModal.tsx';
import type {
  AdSlot,
  CartItem,
  LensIdentificationResult,
  Order,
  PriceAlert,
  Product,
  ProductSource,
  ShopifyConfig,
  UserProfile,
} from './types.ts';
import { ALVERON_LOGO_URL, formatINR } from './utils/currency.ts';

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [adSlots, setAdSlots] = useState<AdSlot[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [shopify, setShopify] = useState<ShopifyConfig>({
    storeUrl: 'https://alveron.myshopify.com',
    connected: true,
    hasApiToken: false,
    autoSyncCatalog: true,
    autoSyncOrders: true,
    autoCaptureAds: true,
    lastSyncAt: null,
    syncedCount: 0,
  });

  // Auth & Wishlist state (session token stored strictly in React memory)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [guestWishlist, setGuestWishlist] = useState<string[]>(['alv-air-01']);
  const [authOpen, setAuthOpen] = useState(false);

  // Cart & Modals
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [lensOpen, setLensOpen] = useState(false);
  const [studioProductId, setStudioProductId] = useState<string>('alv-air-01');
  const [merchantTab, setMerchantTab] = useState<
    'shopify' | 'catalog' | 'analytics' | 'github'
  >('shopify');

  // Search & Filter Controls
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [sourceFilter, setSourceFilter] = useState<'all' | ProductSource>('all');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc'>('featured');
  const [listeningVoice, setListeningVoice] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Live toast notifications
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  const showToast = useCallback((title: string, body: string) => {
    setToast({ title, body });
    setTimeout(() => {
      setToast((prev) => (prev?.title === title ? null : prev));
    }, 4500);
  }, []);

  // Load initial storefront data
  useEffect(() => {
    fetch('/api/storefront')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.products)) setProducts(data.products);
        if (Array.isArray(data.adSlots)) setAdSlots(data.adSlots);
        if (Array.isArray(data.orders)) setOrders(data.orders);
        if (Array.isArray(data.priceAlerts)) setPriceAlerts(data.priceAlerts);
        if (data.shopify) setShopify(data.shopify);
      })
      .catch(() => {});
  }, []);

  // Subscribe to SSE real-time Shopify sync & price drop push alerts
  useEffect(() => {
    const es = new EventSource('/api/events');

    es.addEventListener('product:added', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        product: Product;
        adSlot?: AdSlot | null;
      };
      setProducts((prev) =>
        prev.some((p) => p.id === data.product.id) ? prev : [data.product, ...prev],
      );
      if (data.adSlot) {
        setAdSlots((prev) =>
          prev.some((a) => a.id === data.adSlot!.id) ? prev : [data.adSlot!, ...prev],
        );
      }
      showToast('New Catalog Sync', `${data.product.title} added to Alveron feed.`);
    });

    es.addEventListener('product:updated', (ev) => {
      const { product } = JSON.parse((ev as MessageEvent).data) as { product: Product };
      setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
    });

    es.addEventListener('price:drop', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        product: Product;
        oldPrice: number;
        newPrice: number;
      };
      setProducts((prev) =>
        prev.map((p) => (p.id === data.product.id ? data.product : p)),
      );
      setAdSlots((prev) =>
        prev.map((a) =>
          a.productId === data.product.id ? { ...a, productPrice: data.newPrice } : a,
        ),
      );
      const msg = `${data.product.title} dropped from ${formatINR(data.oldPrice)} to ${formatINR(data.newPrice)}.`;
      showToast('Price Drop Alert', msg);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Alveron Price Drop Alert', { body: msg });
      }
    });

    es.addEventListener('order:created', (ev) => {
      const order = JSON.parse((ev as MessageEvent).data) as Order;
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [order, ...prev]));
    });

    es.addEventListener('shopify:config', (ev) => {
      const cfg = JSON.parse((ev as MessageEvent).data) as ShopifyConfig;
      setShopify(cfg);
    });

    return () => es.close();
  }, [showToast]);

  const activeWishlistIds = user ? user.wishlistIds : guestWishlist;

  const categories = useMemo(() => {
    const set = new Set(['All']);
    for (const p of products) set.add(p.category);
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = products.filter((p) => {
      if (category !== 'All' && p.category !== category) return false;
      if (sourceFilter !== 'all' && p.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
    if (sortBy === 'price-asc') return [...list].sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [products, query, category, sourceFilter, sortBy]);

  const wishlistProducts = useMemo(
    () => products.filter((p) => activeWishlistIds.includes(p.id)),
    [products, activeWishlistIds],
  );

  const studioProduct = useMemo(
    () => products.find((p) => p.id === studioProductId) ?? products[0] ?? null,
    [products, studioProductId],
  );

  const toggleVoiceSearch = () => {
    if (listeningVoice) {
      recognitionRef.current?.stop();
      setListeningVoice(false);
      return;
    }
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
        .webkitSpeechRecognition;

    if (!SpeechRec) {
      showToast(
        'Voice Search',
        'Browser speech recognition is unavailable here. Type keywords or use Lens Camera Search.',
      );
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      if (transcript) {
        setQuery(transcript);
        showToast('Voice Search', `Showing matches for "${transcript}"`);
      }
      setListeningVoice(false);
    };
    rec.onerror = () => setListeningVoice(false);
    rec.onend = () => setListeningVoice(false);
    recognitionRef.current = rec;
    setListeningVoice(true);
    rec.start();
  };

  const handleToggleWishlist = async (productId: string) => {
    if (authToken && user) {
      const res = await fetch('/api/wishlist/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ productId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { wishlistIds: string[] };
        setUser({ ...user, wishlistIds: data.wishlistIds });
      }
      return;
    }
    setGuestWishlist((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    );
  };

  const handleAddToCart = (product: Product, finish?: string) => {
    const chosenFinish = finish || product.model3D.finishes[0]?.name || 'Standard';
    setCart((prev) => {
      const idx = prev.findIndex(
        (i) => i.product.id === product.id && i.finish === chosenFinish,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1, finish: chosenFinish }];
    });
    setCartOpen(true);
  };

  const handleUpdateQty = (productId: string, finish: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId && item.finish === finish
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const handleRemoveCartItem = (productId: string, finish: string) => {
    setCart((prev) =>
      prev.filter((item) => !(item.product.id === productId && item.finish === finish)),
    );
  };

  const handleCheckout = async (payload: {
    customerName: string;
    customerEmail: string;
    shippingAddress: string;
  }) => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        items: cart.map((c) => ({
          productId: c.product.id,
          title: c.product.title,
          price: c.product.price,
          quantity: c.quantity,
          finish: c.finish,
          image: c.product.images[0] || '',
        })),
      }),
    });
    const json = (await res.json()) as { order?: Order; error?: string };
    if (!res.ok || !json.order) throw new Error(json.error || 'Checkout failed.');
    setCart([]);
    setOrders((prev) =>
      prev.some((o) => o.id === json.order!.id) ? prev : [json.order!, ...prev],
    );
    return json.order;
  };

  const handleAddProduct = async (payload: {
    title: string;
    brand: string;
    category: string;
    price: number;
    description: string;
    specs: string[];
    keywords: string[];
    images: string[];
    source: ProductSource;
    externalUrl?: string;
    externalId?: string;
    model3D?: LensIdentificationResult['model3D'];
  }) => {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as {
      product?: Product;
      adSlot?: AdSlot | null;
      error?: string;
    };
    if (!res.ok || !json.product) throw new Error(json.error || 'Failed to add product.');
    setProducts((prev) =>
      prev.some((p) => p.id === json.product!.id) ? prev : [json.product!, ...prev],
    );
    if (json.adSlot) {
      setAdSlots((prev) =>
        prev.some((a) => a.id === json.adSlot!.id) ? prev : [json.adSlot!, ...prev],
      );
    }
    return json.product;
  };

  const handleUpdatePrice = async (productId: string, newPrice: number) => {
    const res = await fetch(`/api/products/${productId}/price`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPrice }),
    });
    if (res.ok) {
      const json = (await res.json()) as { product: Product };
      setProducts((prev) =>
        prev.map((p) => (p.id === json.product.id ? json.product : p)),
      );
    }
  };

  const handleCreatePriceAlert = async (
    productId: string,
    targetPrice: number,
    email: string,
  ) => {
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, targetPrice, email }),
    });
    if (res.ok) {
      const json = (await res.json()) as { alert: PriceAlert };
      setPriceAlerts((prev) => [json.alert, ...prev]);
      showToast('Price Alert Active', `Monitoring ${json.alert.productTitle} for drops.`);
    }
  };

  const handleTrackAdEvent = useCallback(
    async (adId: string, type: 'impression' | 'click', variant: 'A' | 'B') => {
      try {
        const res = await fetch(`/api/ads/${adId}/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, variant }),
        });
        if (res.ok) {
          const json = (await res.json()) as { adSlot: AdSlot };
          setAdSlots((prev) =>
            prev.map((a) => (a.id === json.adSlot.id ? json.adSlot : a)),
          );
        }
      } catch {
        // Non-blocking analytics call
      }
    },
    [],
  );

  const handleUpdateAdVariant = async (
    adId: string,
    activeVariant: 'A' | 'B',
    autoOptimize: boolean,
  ) => {
    const res = await fetch(`/api/ads/${adId}/variant`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeVariant, autoOptimize }),
    });
    if (res.ok) {
      const json = (await res.json()) as { adSlot: AdSlot };
      setAdSlots((prev) => prev.map((a) => (a.id === json.adSlot.id ? json.adSlot : a)));
    }
  };

  const bagCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="relative min-h-screen text-[#1D1D1F]">
      <LiveScrollBackground />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-[#FAFAFA]/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8 py-3.5">
          {/* Zone 1: Brand Title & Crest Logo */}
          <a
            href="#store"
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0"
          >
            <img
              src={ALVERON_LOGO_URL}
              alt="Alveron Premiums"
              className="h-9 w-9 rounded-lg border border-black/[0.08] object-cover"
            />
            <span className="font-display text-lg font-semibold tracking-tight text-[#1D1D1F]">
              Alveron
            </span>
          </a>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-[#424245]">
            <a
              href="#store"
              className="hover:text-[#1D1D1F] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Store
            </a>
            <a
              href="#catalog"
              className="hover:text-[#1D1D1F] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Catalog
            </a>
            <a
              href="#studio-3d"
              className="hover:text-[#1D1D1F] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              3D Studio
            </a>
            <a
              href="#merchant-hub"
              onClick={() => setMerchantTab('shopify')}
              className="hover:text-[#1D1D1F] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Merchant Hub
            </a>
            <a
              href="#merchant-hub"
              onClick={() => setMerchantTab('analytics')}
              className="hover:text-[#1D1D1F] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Analytics
            </a>
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#1D1D1F] px-4 py-2 text-xs font-medium text-white hover:bg-black transition-colors whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span className="tabular-nums">Bag ({bagCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Live Push / Sync Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl border border-black/10 bg-white px-4 py-3.5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Bell className="mt-0.5 h-4 w-4 text-[#0071E3] shrink-0" />
              <div>
                <p className="font-display text-xs font-semibold text-[#1D1D1F]">
                  {toast.title}
                </p>
                <p className="mt-0.5 text-xs text-[#6E6E73]">{toast.body}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-[#86868B] hover:text-[#1D1D1F]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* HERO SHOWCASE */}
      <section
        id="store"
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-12"
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-stretch rounded-3xl border border-black/[0.06] bg-white p-6 sm:p-10 shadow-[0_8px_30px_rgba(0,0,0,0.03)]">
          <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
            <div>
              <p className="text-xs font-medium text-[#6E6E73]">
                Alveron Flagship · Synced with {shopify.storeUrl.replace(/^https?:\/\//, '')}
              </p>
              <h1 className="mt-3 font-display text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.08] text-[#1D1D1F] text-balance">
                Precision hardware, inspected in 360°.
              </h1>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#424245]">
                Explore minimalist acoustic, wearable, and studio objects synchronized in real time from Shopify, Amazon, and Flipkart—complete with AI Lens search and interactive 3D product twins.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#catalog"
                className="inline-flex items-center justify-center rounded-xl bg-[#0071E3] px-5 py-3 text-sm font-medium text-white hover:bg-[#0077ED] transition-colors whitespace-nowrap"
              >
                Explore Collection
              </a>
              <button
                type="button"
                onClick={() => setLensOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-3 text-sm font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors whitespace-nowrap"
              >
                <Camera className="h-4 w-4 text-[#0071E3]" />
                <span>Lens Search</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 overflow-hidden rounded-2xl bg-[#F5F5F7]">
            <img
              src="/src/assets/images/hero_alveron_flagship_1795273429946.jpg"
              alt="Alveron Flagship Reference Headphones and Monolith Acoustic Speaker"
              referrerPolicy="no-referrer"
              className="h-full min-h-[260px] w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* CATALOG SEARCH, VOICE, LENS, FILTERS & ACCOUNT BAR */}
      <section id="catalog" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16">
        <div className="rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search + Voice + Google Lens */}
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-black/10 bg-[#F5F5F7] px-3.5 py-2">
              <Search className="h-4 w-4 text-[#6E6E73] shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search hardware, titanium, camera, speaker..."
                className="w-full bg-transparent text-sm text-[#1D1D1F] placeholder:text-[#86868B] focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-[#86868B] hover:text-[#1D1D1F]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                title="Voice search"
                onClick={toggleVoiceSearch}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  listeningVoice
                    ? 'bg-[#0071E3] text-white'
                    : 'text-[#424245] hover:bg-black/5'
                }`}
              >
                {listeningVoice ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="button"
                title="Lens visual search & auto-catalog"
                onClick={() => setLensOpen(true)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-[#1D1D1F] border border-black/10 hover:bg-[#FAFAFA] transition-colors whitespace-nowrap"
              >
                <Camera className="h-3.5 w-3.5 text-[#0071E3]" />
                <span className="hidden sm:inline">Lens</span>
              </button>
            </div>

            {/* Account, Wishlist & Marketplace Source Filter */}
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Filter by source marketplace"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as 'all' | ProductSource)}
                className="rounded-xl border border-black/10 bg-[#F5F5F7] px-3 py-2 text-xs font-medium text-[#1D1D1F]"
              >
                <option value="all">All Marketplaces</option>
                <option value="shopify">Shopify</option>
                <option value="alveron">Alveron Direct</option>
                <option value="amazon">Amazon</option>
                <option value="flipkart">Flipkart</option>
              </select>

              <select
                aria-label="Sort products"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'featured' | 'price-asc' | 'price-desc')
                }
                className="rounded-xl border border-black/10 bg-[#F5F5F7] px-3 py-2 text-xs font-medium text-[#1D1D1F]"
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>

              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] whitespace-nowrap"
              >
                <Heart className="h-3.5 w-3.5 text-[#E11D48]" />
                <span className="tabular-nums">Wishlist ({wishlistProducts.length})</span>
              </button>

              <button
                type="button"
                onClick={() => (user ? setUser(null) : setAuthOpen(true))}
                className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] whitespace-nowrap"
              >
                <User className="h-3.5 w-3.5" />
                <span>{user ? `${user.name} (Sign out)` : 'Sign In'}</span>
              </button>
            </div>
          </div>

          {/* Interactive Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {categories.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#1D1D1F] text-white'
                      : 'bg-[#F5F5F7] text-[#424245] hover:text-[#1D1D1F]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Storefront Grid (Left 9 Cols) + Editorial Ad Column (Right 3 Cols) */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          <div className="lg:col-span-9">
            {filteredProducts.length === 0 ? (
              <div className="rounded-2xl border border-black/[0.06] bg-white p-12 text-center space-y-2">
                <p className="font-display text-base font-semibold text-[#1D1D1F]">
                  No matching hardware found
                </p>
                <p className="text-xs text-[#6E6E73]">
                  Clear filters or use Alveron Lens to identify and catalog a new product.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isWishlisted={activeWishlistIds.includes(product.id)}
                    onSelect={setSelectedProduct}
                    onToggleWishlist={handleToggleWishlist}
                    onQuickAdd={(p) => handleAddToCart(p)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-3 lg:sticky lg:top-20">
            <AdColumn
              adSlots={adSlots}
              products={products}
              onSelectProduct={setSelectedProduct}
              onTrackEvent={handleTrackAdEvent}
            />
          </div>
        </div>
      </section>

      {/* INTERACTIVE 360° 3D STUDIO SECTION */}
      {studioProduct && (
        <section
          id="studio-3d"
          className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 border-t border-black/[0.08]"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-[#6E6E73]">
                AI-Generated 3D Product Twins
              </p>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#1D1D1F]">
                Inspect every surface in 360°
              </h2>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {products.slice(0, 5).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setStudioProductId(p.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    studioProduct.id === p.id
                      ? 'bg-[#1D1D1F] text-white'
                      : 'bg-white border border-black/10 text-[#424245] hover:text-[#1D1D1F]'
                  }`}
                >
                  {p.title.replace('Alveron ', '')}
                </button>
              ))}
            </div>
          </div>

          <Product3DViewer
            blueprint={studioProduct.model3D}
            productTitle={studioProduct.title}
          />
        </section>
      )}

      {/* MERCHANT HUB: SHOPIFY SYNC, AMAZON/FLIPKART IMPORTER, AD A/B ANALYTICS, GITHUB PUSH */}
      <MerchantHub
        activeTab={merchantTab}
        onTabChange={setMerchantTab}
        products={products}
        adSlots={adSlots}
        orders={orders}
        priceAlerts={priceAlerts}
        shopify={shopify}
        onSaveShopifyConfig={async (cfg) => {
          const res = await fetch('/api/shopify/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg),
          });
          const json = (await res.json()) as { shopify?: ShopifyConfig; error?: string };
          if (!res.ok || !json.shopify) throw new Error(json.error || 'Config failed.');
          setShopify(json.shopify);
        }}
        onRunShopifySync={async () => {
          const res = await fetch('/api/shopify/sync', { method: 'POST' });
          const json = (await res.json()) as {
            shopify: ShopifyConfig;
            importedCount: number;
            mode: string;
          };
          setShopify(json.shopify);
          return { importedCount: json.importedCount, mode: json.mode };
        }}
        onAddProduct={handleAddProduct}
        onUpdatePrice={handleUpdatePrice}
        onUpdateAdVariant={handleUpdateAdVariant}
      />

      {/* CLEAN EDITORIAL FOOTER */}
      <footer className="border-t border-black/[0.08] bg-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:px-6 lg:px-8 py-8 sm:flex-row sm:items-center sm:justify-between text-xs text-[#6E6E73]">
          <div className="flex items-center gap-3">
            <img
              src={ALVERON_LOGO_URL}
              alt="Alveron Premiums"
              className="h-8 w-8 rounded-lg border border-black/[0.06] object-cover"
            />
            <p>© 2026 Alveron Premiums. All prices in INR (₹).</p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <a href="#store" className="hover:text-[#1D1D1F]">
              Storefront
            </a>
            <a href="#catalog" className="hover:text-[#1D1D1F]">
              Catalog
            </a>
            <a
              href="#merchant-hub"
              onClick={() => setMerchantTab('shopify')}
              className="hover:text-[#1D1D1F]"
            >
              Shopify Sync
            </a>
            <a
              href="#merchant-hub"
              onClick={() => setMerchantTab('github')}
              className="hover:text-[#1D1D1F]"
            >
              GitHub Publish
            </a>
          </div>
        </div>
      </footer>

      {/* SEAMLESS EXPANDING PRODUCT DETAIL MODAL */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductDetailModal
            product={selectedProduct}
            allProducts={products}
            isWishlisted={activeWishlistIds.includes(selectedProduct.id)}
            userEmail={user?.email}
            onClose={() => setSelectedProduct(null)}
            onSelectProduct={(p) => setSelectedProduct(p)}
            onAddToCart={(p, finish) => handleAddToCart(p, finish)}
            onToggleWishlist={handleToggleWishlist}
            onCreatePriceAlert={handleCreatePriceAlert}
          />
        )}
      </AnimatePresence>

      {/* LENS VISUAL SEARCH & AUTO-3D CATALOG MODAL */}
      {lensOpen && (
        <LensSearchModal
          products={products}
          onClose={() => setLensOpen(false)}
          onSelectProduct={(p) => setSelectedProduct(p)}
          onPublishCatalogItem={async (payload) => handleAddProduct(payload)}
        />
      )}

      {/* EMAIL / PASSWORD & SOCIAL AUTH MODAL */}
      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onAuthenticated={(token, profile) => {
            setAuthToken(token);
            setUser(profile);
            showToast('Signed In', `Welcome back, ${profile.name}.`);
          }}
        />
      )}

      {/* SLIDE-OVER CART & WISHLIST DRAWER */}
      <CartDrawer
        open={cartOpen}
        items={cart}
        wishlistProducts={wishlistProducts}
        shopifyStoreUrl={shopify.storeUrl}
        userEmail={user?.email}
        userName={user?.name}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveCartItem}
        onMoveWishlistToBag={(p) => handleAddToCart(p)}
        onCheckout={handleCheckout}
      />
    </div>
  );
}
