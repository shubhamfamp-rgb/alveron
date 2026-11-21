export type ProductSource = 'alveron' | 'shopify' | 'amazon' | 'flipkart';

export type Model3DShape =
  | 'headphones'
  | 'watch'
  | 'speaker'
  | 'camera'
  | 'lamp'
  | 'earbuds'
  | 'laptop'
  | 'bottle'
  | 'accessory';

export interface FinishOption {
  name: string;
  hex: string;
  metalness: number;
  roughness: number;
}

export interface Model3DBlueprint {
  shape: Model3DShape;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  finishes: FinishOption[];
  dimensionsLabel: string;
  partsNote: string;
}

export interface Product {
  id: string;
  title: string;
  brand: string;
  category: string;
  price: number;
  originalPrice?: number;
  currency: string;
  source: ProductSource;
  externalUrl?: string;
  externalId?: string;
  images: string[];
  description: string;
  specs: string[];
  keywords: string[];
  stock: number;
  sku: string;
  createdAt: string;
  model3D: Model3DBlueprint;
  rating: number;
  reviewCount: number;
}

export interface AdVariantCopy {
  headline: string;
  subcopy: string;
  cta: string;
}

export interface AdSlot {
  id: string;
  productId: string;
  productTitle: string;
  productImage: string;
  productPrice: number;
  source: ProductSource;
  placement: 'sidebar' | 'feed';
  activeVariant: 'A' | 'B';
  autoOptimize: boolean;
  variantA: AdVariantCopy;
  variantB: AdVariantCopy;
  stats: {
    A: { impressions: number; clicks: number };
    B: { impressions: number; clicks: number };
  };
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  title: string;
  price: number;
  quantity: number;
  finish: string;
  image: string;
}

export interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  status: 'confirmed' | 'synced_to_shopify' | 'pending_sync';
  shopifyOrderId?: string;
  shopifyStoreUrl?: string;
  createdAt: string;
}

export interface ShopifyConfig {
  storeUrl: string;
  connected: boolean;
  hasApiToken: boolean;
  autoSyncCatalog: boolean;
  autoSyncOrders: boolean;
  autoCaptureAds: boolean;
  lastSyncAt: string | null;
  syncedCount: number;
}

export interface PriceAlert {
  id: string;
  productId: string;
  productTitle: string;
  targetPrice: number;
  currentPrice: number;
  email: string;
  triggered: boolean;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  provider: 'email' | 'google' | 'apple' | 'github';
  wishlistIds: string[];
}

export interface LensIdentificationResult {
  title: string;
  brand: string;
  category: string;
  description: string;
  estimatedPrice: number;
  keywords: string[];
  specs: string[];
  model3D: Model3DBlueprint;
  matchedProductIds: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  finish: string;
}
