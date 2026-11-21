import { useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  Download,
  GitBranch,
  Globe,
  Loader2,
  PackagePlus,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
} from 'lucide-react';
import type {
  AdSlot,
  LensIdentificationResult,
  Order,
  PriceAlert,
  Product,
  ProductSource,
  ShopifyConfig,
} from '../types.ts';
import { formatINR } from '../utils/currency.ts';

interface MerchantHubProps {
  activeTab: 'shopify' | 'catalog' | 'analytics' | 'github';
  onTabChange: (tab: 'shopify' | 'catalog' | 'analytics' | 'github') => void;
  products: Product[];
  adSlots: AdSlot[];
  orders: Order[];
  priceAlerts: PriceAlert[];
  shopify: ShopifyConfig;
  onSaveShopifyConfig: (cfg: {
    storeUrl: string;
    accessToken?: string;
    autoSyncCatalog: boolean;
    autoSyncOrders: boolean;
    autoCaptureAds: boolean;
  }) => Promise<void>;
  onRunShopifySync: () => Promise<{ importedCount: number; mode: string }>;
  onAddProduct: (payload: {
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
  }) => Promise<Product>;
  onUpdatePrice: (productId: string, newPrice: number) => Promise<void>;
  onUpdateAdVariant: (adId: string, activeVariant: 'A' | 'B', autoOptimize: boolean) => Promise<void>;
}

export function MerchantHub({
  activeTab,
  onTabChange,
  products,
  adSlots,
  orders,
  priceAlerts,
  shopify,
  onSaveShopifyConfig,
  onRunShopifySync,
  onAddProduct,
  onUpdatePrice,
  onUpdateAdVariant,
}: MerchantHubProps) {
  // Shopify state
  const [storeUrl, setStoreUrl] = useState(shopify.storeUrl);
  const [shopifyToken, setShopifyToken] = useState('');
  const [autoSyncCatalog, setAutoSyncCatalog] = useState(shopify.autoSyncCatalog);
  const [autoSyncOrders, setAutoSyncOrders] = useState(shopify.autoSyncOrders);
  const [autoCaptureAds, setAutoCaptureAds] = useState(shopify.autoCaptureAds);
  const [syncing, setSyncing] = useState(false);
  const [shopifyMessage, setShopifyMessage] = useState<string | null>(null);

  // Add Product / Amazon / Flipkart / Shopify Upload + Auto 3D Twin
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [newSource, setNewSource] = useState<ProductSource>('shopify');
  const [newTitle, setNewTitle] = useState('');
  const [newBrand, setNewBrand] = useState('Alveron Curated');
  const [newCategory, setNewCategory] = useState('Audio');
  const [newPrice, setNewPrice] = useState('24999');
  const [markupPct, setMarkupPct] = useState('0');
  const [newExternalUrl, setNewExternalUrl] = useState('');
  const [newImage, setNewImage] = useState('');
  const [analyzingUpload, setAnalyzingUpload] = useState(false);
  const [aiBlueprint, setAiBlueprint] = useState<LensIdentificationResult['model3D'] | undefined>();
  const [newKeywords, setNewKeywords] = useState<string[]>(['minimalist', 'hardware']);
  const [newSpecs, setNewSpecs] = useState<string[]>([
    'Precision Industrial Chassis',
    'AI-Generated 360° 3D Twin',
  ]);
  const [newDesc, setNewDesc] = useState('');
  const [addingProduct, setAddingProduct] = useState(false);
  const [productAddedMsg, setProductAddedMsg] = useState<string | null>(null);

  // Price editing state
  const [customPrices, setCustomPrices] = useState<Record<string, string>>({});

  // GitHub Push state
  const [ghOwner, setGhOwner] = useState('');
  const [ghRepo, setGhRepo] = useState('');
  const [ghBranch, setGhBranch] = useState('main');
  const [ghMessage, setGhMessage] = useState('Publish Alveron storefront catalog & 3D twins');
  const [ghToken, setGhToken] = useState('');
  const [ghPushing, setGhPushing] = useState(false);
  const [ghResult, setGhResult] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  const handleShopifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSyncing(true);
    setShopifyMessage(null);
    try {
      await onSaveShopifyConfig({
        storeUrl,
        accessToken: shopifyToken || undefined,
        autoSyncCatalog,
        autoSyncOrders,
        autoCaptureAds,
      });
      const res = await onRunShopifySync();
      setShopifyMessage(
        `Connected to ${storeUrl}. Sync mode: ${
          res.mode === 'live_api' ? 'Shopify Admin API' : 'Live Storefront Sync'
        } (${res.importedCount} new items).`,
      );
      setShopifyToken('');
    } catch (err) {
      setShopifyMessage(err instanceof Error ? err.message : 'Shopify connection failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      const dataUrl = reader.result;
      setNewImage(dataUrl);
      setAnalyzingUpload(true);
      try {
        const res = await fetch('/api/ai/lens-identify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: dataUrl }),
        });
        if (res.ok) {
          const ai = (await res.json()) as LensIdentificationResult;
          if (!newTitle) setNewTitle(ai.title);
          setNewBrand(ai.brand);
          setNewCategory(ai.category);
          setNewPrice(String(ai.estimatedPrice));
          setNewDesc(ai.description);
          setNewKeywords(ai.keywords);
          setNewSpecs(ai.specs);
          setAiBlueprint(ai.model3D);
        }
      } catch {
        // User can still enter fields manually
      } finally {
        setAnalyzingUpload(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingProduct(true);
    setProductAddedMsg(null);
    try {
      const base = Math.max(1, Number(newPrice) || 14999);
      const pct = Number(markupPct) || 0;
      const finalPrice = Math.max(1, Math.round(base * (1 + pct / 100)));
      const created = await onAddProduct({
        title: newTitle.trim(),
        brand: newBrand.trim() || 'Alveron Curated',
        category: newCategory,
        price: finalPrice,
        description:
          newDesc.trim() ||
          `${newTitle} imported via ${newSource.toUpperCase()} with automatic 360° 3D studio twin.`,
        specs: newSpecs,
        keywords: newKeywords,
        images: [
          newImage || '/src/assets/images/product_audio_headphones_1795273429944.jpg',
        ],
        source: newSource,
        externalUrl: newExternalUrl.trim() || undefined,
        model3D: aiBlueprint,
      });
      setProductAddedMsg(`Added "${created.title}" to local DB & live storefront feed.`);
      setNewTitle('');
      setNewExternalUrl('');
      setNewImage('');
      setAiBlueprint(undefined);
    } catch (err) {
      setProductAddedMsg(err instanceof Error ? err.message : 'Unable to add product.');
    } finally {
      setAddingProduct(false);
    }
  };

  const handleGitHubPush = async (e: React.FormEvent) => {
    e.preventDefault();
    setGhPushing(true);
    setGhResult(null);
    try {
      const res = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: ghOwner.trim(),
          repo: ghRepo.trim(),
          branch: ghBranch.trim() || 'main',
          commitMessage: ghMessage.trim(),
          githubToken: ghToken.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        commitSha?: string;
        commitUrl?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'GitHub push failed.');
      setGhResult({
        ok: true,
        text: `Pushed commit ${json.commitSha?.slice(0, 7) ?? 'done'} to ${ghOwner}/${ghRepo}.`,
        url: json.commitUrl,
      });
      setGhToken('');
    } catch (err) {
      setGhResult({
        ok: false,
        text: err instanceof Error ? err.message : 'GitHub push failed.',
      });
    } finally {
      setGhPushing(false);
    }
  };

  const downloadBundleSnapshot = () => {
    const payload = {
      storeName: 'Alveron',
      exportedAt: new Date().toISOString(),
      shopify,
      products,
      adSlots,
      orders,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alveron-storefront-snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalImpressions = adSlots.reduce(
    (s, ad) => s + ad.stats.A.impressions + ad.stats.B.impressions,
    0,
  );
  const totalClicks = adSlots.reduce((s, ad) => s + ad.stats.A.clicks + ad.stats.B.clicks, 0);
  const blendedCtr =
    totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';

  return (
    <section
      id="merchant-hub"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 border-t border-black/[0.08]"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[#6E6E73]">
            Commerce Operations
          </p>
          <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#1D1D1F]">
            Alveron Merchant & Sync Console
          </h2>
        </div>

        {/* Segmented Control Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#EFEFF2] p-1">
          {(
            [
              { id: 'shopify', label: 'Shopify & Orders', icon: Globe },
              { id: 'catalog', label: 'Catalog & Pricing', icon: PackagePlus },
              { id: 'analytics', label: 'Ad A/B Analytics', icon: BarChart3 },
              { id: 'github', label: 'GitHub Push', icon: GitBranch },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-[#1D1D1F] shadow-sm'
                    : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: SHOPIFY LINKING & ORDERS SYNC */}
      {activeTab === 'shopify' && (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <form
            onSubmit={handleShopifySubmit}
            className="lg:col-span-5 rounded-2xl border border-black/[0.06] bg-white p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#1D1D1F]">
                Shopify Official Store Link
              </h3>
              <span className="text-xs font-medium text-[#0071E3]">
                {shopify.connected ? 'Linked' : 'Ready to link'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1D1D1F]">
                Official Store URL
              </label>
              <input
                type="text"
                required
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="https://alveron.myshopify.com"
                className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-xs text-[#1D1D1F]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1D1D1F]">
                Shopify Admin API Token (Optional)
              </label>
              <input
                type="password"
                value={shopifyToken}
                onChange={(e) => setShopifyToken(e.target.value)}
                placeholder="shpat_... (stored in server memory)"
                className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-xs text-[#1D1D1F]"
              />
            </div>

            <div className="space-y-2.5 pt-1 text-xs text-[#1D1D1F]">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSyncCatalog}
                  onChange={(e) => setAutoSyncCatalog(e.target.checked)}
                  className="accent-[#0071E3]"
                />
                <span>Auto-import new Shopify products to local DB</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSyncOrders}
                  onChange={(e) => setAutoSyncOrders(e.target.checked)}
                  className="accent-[#0071E3]"
                />
                <span>Forward all Alveron checkout orders to Shopify dashboard</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCaptureAds}
                  onChange={(e) => setAutoCaptureAds(e.target.checked)}
                  className="accent-[#0071E3]"
                />
                <span>Auto-capture Shopify product images into Partner Spotlight ads</span>
              </label>
            </div>

            {shopifyMessage && (
              <p className="rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-xs text-[#1D1D1F]">
                {shopifyMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={syncing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071E3] py-3 text-xs font-medium text-white hover:bg-[#0077ED] disabled:opacity-60 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing Storefront...' : 'Save & Sync Shopify Inventory'}</span>
            </button>
          </form>

          {/* Synced Orders Ledger */}
          <div className="lg:col-span-7 rounded-2xl border border-black/[0.06] bg-white p-6">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-[#1D1D1F]">
                  Orders Synced to Shopify
                </h3>
                <p className="text-xs text-[#6E6E73]">
                  Live order ledger flowing to {shopify.storeUrl}
                </p>
              </div>
              <span className="font-mono-tabular text-xs font-medium text-[#1D1D1F]">
                {orders.length} Orders
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-black/[0.06] text-[#6E6E73]">
                    <th className="py-2.5 pr-4 font-medium">Order</th>
                    <th className="py-2.5 pr-4 font-medium">Customer</th>
                    <th className="py-2.5 pr-4 font-medium">Items</th>
                    <th className="py-2.5 pr-4 font-medium">Shopify Ref</th>
                    <th className="py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {orders.map((ord) => (
                    <tr key={ord.id}>
                      <td className="py-3 pr-4 font-mono-tabular font-medium text-[#1D1D1F]">
                        {ord.id}
                      </td>
                      <td className="py-3 pr-4 text-[#424245]">
                        <div className="font-medium text-[#1D1D1F]">{ord.customerName}</div>
                        <div className="text-[11px] text-[#6E6E73]">{ord.customerEmail}</div>
                      </td>
                      <td className="py-3 pr-4 text-[#424245] tabular-nums">
                        {ord.items.reduce((s, i) => s + i.quantity, 0)} item(s)
                      </td>
                      <td className="py-3 pr-4 font-mono-tabular text-[#0071E3]">
                        {ord.shopifyOrderId || 'Queued'}
                      </td>
                      <td className="py-3 text-right font-mono-tabular font-semibold text-[#1D1D1F]">
                        {formatINR(ord.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CATALOG, AMAZON/FLIPKART IMPORTER, AI 3D TWIN & PRICE EDITOR */}
      {activeTab === 'catalog' && (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left: Multi-Source Product Uploader + AI 3D Twin Generator */}
          <form
            onSubmit={handleCreateProduct}
            className="lg:col-span-5 rounded-2xl border border-black/[0.06] bg-white p-6 space-y-4"
          >
            <div>
              <h3 className="font-display text-base font-semibold text-[#1D1D1F]">
                Add from Shopify, Amazon, or Flipkart
              </h3>
              <p className="mt-0.5 text-xs text-[#6E6E73]">
                Upload a product picture to auto-fill details and generate a 360° 3D duplicate automatically.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-1 rounded-xl bg-[#F5F5F7] p-1">
              {(['shopify', 'amazon', 'flipkart', 'alveron'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setNewSource(src)}
                  className={`rounded-lg py-1.5 text-xs font-medium capitalize transition-colors ${
                    newSource === src
                      ? 'bg-white text-[#1D1D1F] shadow-sm'
                      : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>

            <div>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                onChange={handleProductImageUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 bg-[#FAFAFA] py-3.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors"
              >
                {analyzingUpload ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-[#0071E3]" />
                    <span>Gemini Vision extracting specs & 3D twin...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 text-[#0071E3]" />
                    <span>
                      {newImage
                        ? 'Image uploaded · 3D Twin ready (click to replace)'
                        : 'Upload Product Photo (Auto-Generates 360° 3D Twin)'}
                    </span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#1D1D1F]">Product Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Sony WH-1000XM6 Titanium"
                  className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1D1D1F]">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs"
                >
                  <option value="Audio">Audio</option>
                  <option value="Wearables">Wearables</option>
                  <option value="Workspace">Workspace</option>
                  <option value="Home">Home</option>
                  <option value="Accessories">Accessories</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1D1D1F]">Base Price (₹)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-xs tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1D1D1F]">
                  Price Markup / Drop (%)
                </label>
                <input
                  type="number"
                  value={markupPct}
                  onChange={(e) => setMarkupPct(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-xs tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1D1D1F]">
                  Source URL / ASIN / FSN
                </label>
                <input
                  type="text"
                  value={newExternalUrl}
                  onChange={(e) => setNewExternalUrl(e.target.value)}
                  placeholder="Optional marketplace link"
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-xs"
                />
              </div>
            </div>

            {productAddedMsg && (
              <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>{productAddedMsg}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={addingProduct}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D1D1F] py-3 text-xs font-medium text-white hover:bg-black disabled:opacity-60 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {addingProduct
                  ? 'Publishing to Local DB...'
                  : 'Add to Local DB & Generate 360° 3D'}
              </span>
            </button>
          </form>

          {/* Right: Live Price Controls & Price-Drop Push Triggers */}
          <div className="lg:col-span-7 rounded-2xl border border-black/[0.06] bg-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-[#1D1D1F]">
                  Inventory Price Control & Push Alert Triggers
                </h3>
                <p className="text-xs text-[#6E6E73]">
                  Increase or drop prices in one click. Lowering a price dispatches push notifications ({priceAlerts.length} active alerts).
                </p>
              </div>
            </div>

            <div className="divide-y divide-black/[0.05]">
              {products.map((p) => {
                const draft = customPrices[p.id] ?? String(p.price);
                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={p.images[0]}
                        alt={p.title}
                        referrerPolicy="no-referrer"
                        className="h-11 w-14 shrink-0 rounded-lg object-cover bg-[#F5F5F7]"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-display text-xs font-semibold text-[#1D1D1F]">
                          {p.title}
                        </p>
                        <p className="text-[11px] text-[#6E6E73] tabular-nums">
                          {p.source.toUpperCase()} · Current{' '}
                          <span className="font-mono-tabular font-semibold text-[#1D1D1F]">
                            {formatINR(p.price)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onUpdatePrice(p.id, Math.max(1, Math.round(p.price * 0.9)))}
                        className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-[#FAFAFA] px-2.5 py-1.5 text-[11px] font-medium text-[#1D1D1F] hover:bg-[#F5F5F7]"
                      >
                        <TrendingDown className="h-3 w-3 text-[#0071E3]" />
                        <span>-10%</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdatePrice(p.id, Math.round(p.price * 1.1))}
                        className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-[#FAFAFA] px-2.5 py-1.5 text-[11px] font-medium text-[#1D1D1F] hover:bg-[#F5F5F7]"
                      >
                        <TrendingUp className="h-3 w-3 text-[#6E6E73]" />
                        <span>+10%</span>
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={draft}
                        onChange={(e) =>
                          setCustomPrices((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        className="w-20 rounded-lg border border-black/15 px-2.5 py-1.5 text-xs font-mono-tabular"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = Number(draft);
                          if (val > 0) onUpdatePrice(p.id, val);
                        }}
                        className="rounded-lg bg-[#1D1D1F] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-black"
                      >
                        Set
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: REAL-TIME AD ANALYTICS & A/B TESTING */}
      {activeTab === 'analytics' && (
        <div id="analytics" className="mt-8 space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Total Impressions', value: totalImpressions.toLocaleString() },
              { label: 'Total Ad Clicks', value: totalClicks.toLocaleString() },
              { label: 'Blended CTR', value: `${blendedCtr}%` },
              { label: 'Active Shopify Slots', value: String(adSlots.length) },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-2xl border border-black/[0.06] bg-white p-5"
              >
                <p className="text-xs text-[#6E6E73]">{kpi.label}</p>
                <p className="mt-2 font-mono-tabular text-2xl font-semibold text-[#1D1D1F]">
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {adSlots.map((slot) => {
              const ctrA =
                slot.stats.A.impressions > 0
                  ? (slot.stats.A.clicks / slot.stats.A.impressions) * 100
                  : 0;
              const ctrB =
                slot.stats.B.impressions > 0
                  ? (slot.stats.B.clicks / slot.stats.B.impressions) * 100
                  : 0;
              const winner = ctrB > ctrA ? 'B' : 'A';

              return (
                <div
                  key={slot.id}
                  className="rounded-2xl border border-black/[0.06] bg-white p-6 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={slot.productImage}
                        alt={slot.productTitle}
                        referrerPolicy="no-referrer"
                        className="h-12 w-14 rounded-xl object-cover bg-[#F5F5F7]"
                      />
                      <div>
                        <h4 className="font-display text-sm font-semibold text-[#1D1D1F]">
                          {slot.productTitle}
                        </h4>
                        <p className="text-xs text-[#6E6E73]">
                          Auto-captured · Leading: Variant {winner}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 rounded-lg bg-[#F5F5F7] p-1">
                      {(['A', 'B'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => onUpdateAdVariant(slot.id, v, slot.autoOptimize)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                            slot.activeVariant === v
                              ? 'bg-white text-[#1D1D1F] shadow-sm'
                              : 'text-[#6E6E73]'
                          }`}
                        >
                          Var {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Variant A vs B performance bars */}
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="font-medium text-[#1D1D1F]">
                          Variant A: {slot.variantA.headline}
                        </span>
                        <span className="font-mono-tabular text-[#6E6E73]">
                          {slot.stats.A.clicks}/{slot.stats.A.impressions} ({ctrA.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#F5F5F7]">
                        <div
                          className="h-full rounded-full bg-[#1D1D1F]"
                          style={{ width: `${Math.min(100, ctrA * 8)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="font-medium text-[#1D1D1F]">
                          Variant B: {slot.variantB.headline}
                        </span>
                        <span className="font-mono-tabular text-[#6E6E73]">
                          {slot.stats.B.clicks}/{slot.stats.B.impressions} ({ctrB.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#F5F5F7]">
                        <div
                          className="h-full rounded-full bg-[#0071E3]"
                          style={{ width: `${Math.min(100, ctrB * 8)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: DIRECT GITHUB PUSH */}
      {activeTab === 'github' && (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <form
            onSubmit={handleGitHubPush}
            className="lg:col-span-6 rounded-2xl border border-black/[0.06] bg-white p-6 space-y-4"
          >
            <div>
              <h3 className="font-display text-base font-semibold text-[#1D1D1F]">
                Push Alveron Storefront Directly to GitHub
              </h3>
              <p className="mt-0.5 text-xs text-[#6E6E73]">
                Commits your live Alveron catalog, Shopify sync settings, and 360° 3D twins to your repository.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#1D1D1F]">GitHub Owner</label>
                <input
                  type="text"
                  required
                  value={ghOwner}
                  onChange={(e) => setGhOwner(e.target.value)}
                  placeholder="username-or-org"
                  className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1D1D1F]">Repository</label>
                <input
                  type="text"
                  required
                  value={ghRepo}
                  onChange={(e) => setGhRepo(e.target.value)}
                  placeholder="alveron-storefront"
                  className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1D1D1F]">Branch</label>
                <input
                  type="text"
                  value={ghBranch}
                  onChange={(e) => setGhBranch(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1D1D1F]">
                  GitHub Token (repo scope)
                </label>
                <input
                  type="password"
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  placeholder="Optional if GITHUB_TOKEN is set"
                  className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#1D1D1F]">Commit Message</label>
                <input
                  type="text"
                  value={ghMessage}
                  onChange={(e) => setGhMessage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/15 px-3.5 py-2.5 text-xs"
                />
              </div>
            </div>

            {ghResult && (
              <div
                className={`rounded-xl px-4 py-3 text-xs ${
                  ghResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
                }`}
              >
                <p>{ghResult.text}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={ghPushing}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1D1D1F] px-4 py-3 text-xs font-medium text-white hover:bg-black disabled:opacity-60 transition-colors"
              >
                <GitBranch className="h-4 w-4" />
                <span>{ghPushing ? 'Pushing Commit...' : 'Push to GitHub'}</span>
              </button>
              <button
                type="button"
                onClick={downloadBundleSnapshot}
                className="inline-flex items-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-3 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Export JSON</span>
              </button>
            </div>
          </form>

          <div className="lg:col-span-6 rounded-2xl border border-black/[0.06] bg-white p-6 space-y-4">
            <h3 className="font-display text-base font-semibold text-[#1D1D1F]">
              Repository Payload Preview
            </h3>
            <p className="text-xs text-[#6E6E73]">
              Every GitHub push writes <code className="font-mono-tabular">alveron-storefront-snapshot.json</code> containing your synced inventory, 3D blueprints, and Shopify config.
            </p>
            <div className="rounded-xl bg-[#F5F5F7] p-4 font-mono-tabular text-[11px] text-[#1D1D1F] overflow-x-auto max-h-64 overflow-y-auto">
              <pre>
                {JSON.stringify(
                  {
                    storeName: 'Alveron',
                    shopifyStoreUrl: shopify.storeUrl,
                    productsCount: products.length,
                    adSlotsCount: adSlots.length,
                    ordersSynced: orders.length,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
