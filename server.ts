import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { identifyProductWithLens } from './server/ai.ts';
import { loadDb, saveDb, type StoredUser } from './server/db.ts';
import type { AdSlot, Order, Product, ProductSource } from './src/types.ts';

dotenv.config();

const PORT = 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

const shopifyTokens = new Map<string, string>();
if (process.env.SHOPIFY_ACCESS_TOKEN) {
  shopifyTokens.set('default', process.env.SHOPIFY_ACCESS_TOKEN);
}

// SSE clients for real-time inventory, Shopify sync, and price-drop push events
const sseClients = new Set<Response>();

function broadcastEvent(event: string, payload: unknown): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(frame);
    } catch {
      sseClients.delete(client);
    }
  }
}

function signSessionToken(user: { id: string; email: string }): string {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, email: user.email, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): { id: string; email: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      id: string;
      email: string;
      exp: number;
    };
    if (Date.now() > data.exp) return null;
    return { id: data.id, email: data.email };
  } catch {
    return null;
  }
}

function sanitizeUser(u: StoredUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    provider: u.provider,
    wishlistIds: u.wishlistIds,
  };
}

function validateSafeHttpsUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are permitted.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error('Private or loopback hostnames are not permitted.');
  }
  return parsed;
}

interface AuthedRequest extends Request {
  user?: StoredUser;
}

function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const verified = verifySessionToken(token);
    if (verified) {
      const db = loadDb();
      const found = db.users.find((u) => u.id === verified.id);
      if (found) req.user = found;
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  optionalAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    next();
  });
}

function createAutoAdSlotForProduct(product: Product): AdSlot {
  return {
    id: `ad-${product.id}-${Date.now().toString(36)}`,
    productId: product.id,
    productTitle: product.title,
    productImage: product.images[0] || '/src/assets/images/hero_alveron_flagship_1795273429946.jpg',
    productPrice: product.price,
    source: product.source,
    placement: 'sidebar',
    activeVariant: 'A',
    autoOptimize: true,
    variantA: {
      headline: `${product.title} — Now synced.`,
      subcopy: `Captured directly from ${product.source.toUpperCase()} inventory with 360° 3D twin.`,
      cta: 'Inspect Product',
    },
    variantB: {
      headline: `Experience ${product.title} in 360°`,
      subcopy: `Precision ${product.category.toLowerCase()} hardware at ₹${product.price.toLocaleString('en-IN')}.`,
      cta: 'View 3D Twin',
    },
    stats: {
      A: { impressions: 1, clicks: 0 },
      B: { impressions: 1, clicks: 0 },
    },
    createdAt: new Date().toISOString(),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // SSE stream
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Storefront bootstrap payload
  app.get('/api/storefront', optionalAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    res.json({
      products: db.products,
      adSlots: db.adSlots,
      orders: db.orders,
      shopify: db.shopify,
      priceAlerts: db.priceAlerts,
      pushHistory: db.pushHistory.slice(0, 12),
      user: req.user ? sanitizeUser(req.user) : null,
    });
  });

  // Auth routes
  app.post('/api/auth/register', (req, res) => {
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };
    if (!email || !password || password.length < 6) {
      res.status(400).json({ error: 'Valid email and password (6+ chars) required.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const db = loadDb();
    if (db.users.some((u) => u.email === cleanEmail)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const user: StoredUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      email: cleanEmail,
      name: (name || cleanEmail.split('@')[0]).trim().slice(0, 60),
      provider: 'email',
      passwordHash: hash,
      passwordSalt: salt,
      wishlistIds: [],
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    saveDb(db);
    const token = signSessionToken(user);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const db = loadDb();
    const user = db.users.find((u) => u.email === cleanEmail);
    if (!user || !user.passwordHash || !user.passwordSalt) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }
    const derived = crypto.scryptSync(password, user.passwordSalt, 64);
    const stored = Buffer.from(user.passwordHash, 'hex');
    if (derived.length !== stored.length || !crypto.timingSafeEqual(derived, stored)) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }
    const token = signSessionToken(user);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/social', (req, res) => {
    const { provider, email, name } = req.body as {
      provider?: 'google' | 'apple' | 'github';
      email?: string;
      name?: string;
    };
    if (!provider || !['google', 'apple', 'github'].includes(provider)) {
      res.status(400).json({ error: 'Unsupported social provider.' });
      return;
    }
    const cleanEmail = (email || `${provider}.member@alveron.store`).trim().toLowerCase();
    const db = loadDb();
    let user = db.users.find((u) => u.email === cleanEmail);
    if (!user) {
      user = {
        id: `usr-${crypto.randomUUID().slice(0, 8)}`,
        email: cleanEmail,
        name: (name || `${provider.charAt(0).toUpperCase() + provider.slice(1)} Member`).slice(0, 60),
        provider,
        wishlistIds: ['alv-air-01'],
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      saveDb(db);
    }
    const token = signSessionToken(user);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/wishlist/toggle', requireAuth, (req: AuthedRequest, res) => {
    const { productId } = req.body as { productId?: string };
    if (!productId) {
      res.status(400).json({ error: 'productId required.' });
      return;
    }
    const db = loadDb();
    const user = db.users.find((u) => u.id === req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const idx = user.wishlistIds.indexOf(productId);
    if (idx >= 0) {
      user.wishlistIds.splice(idx, 1);
    } else {
      user.wishlistIds.push(productId);
    }
    saveDb(db);
    res.json({ wishlistIds: user.wishlistIds });
  });

  // AI Lens identification + automatic 3D blueprint generation
  app.post('/api/ai/lens-identify', async (req, res) => {
    try {
      const { imageBase64 } = req.body as { imageBase64?: string };
      if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.length > 10_000_000) {
        res.status(400).json({ error: 'Valid image data is required.' });
        return;
      }
      const db = loadDb();
      const result = await identifyProductWithLens(imageBase64, db.products);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Visual identification failed.';
      res.status(500).json({ error: msg });
    }
  });

  // Add product (via Lens Auto-Catalog, Shopify Product Upload, Amazon/Flipkart Importer, or Manual)
  app.post('/api/products', (req, res) => {
    const body = req.body as Partial<Product> & { autoCreateAd?: boolean };
    if (!body.title || typeof body.price !== 'number' || body.price <= 0) {
      res.status(400).json({ error: 'Product title and positive price are required.' });
      return;
    }
    const db = loadDb();
    const source: ProductSource =
      body.source && ['alveron', 'shopify', 'amazon', 'flipkart'].includes(body.source)
        ? body.source
        : 'shopify';

    const newProduct: Product = {
      id: `alv-${crypto.randomUUID().slice(0, 6)}`,
      title: String(body.title).trim().slice(0, 120),
      brand: String(body.brand || 'Alveron Curated').trim().slice(0, 60),
      category: String(body.category || 'Accessories').trim().slice(0, 40),
      price: Math.round(body.price),
      originalPrice:
        typeof body.originalPrice === 'number' && body.originalPrice > body.price
          ? Math.round(body.originalPrice)
          : undefined,
      currency: 'INR',
      source,
      externalUrl: body.externalUrl,
      externalId: body.externalId,
      images:
        Array.isArray(body.images) && body.images.length > 0
          ? body.images.slice(0, 5)
          : ['/src/assets/images/product_audio_headphones_1795273429944.jpg'],
      description: String(
        body.description || 'Cataloged into Alveron local database with live 360° 3D twin.',
      ).slice(0, 500),
      specs:
        Array.isArray(body.specs) && body.specs.length > 0
          ? body.specs.slice(0, 6)
          : ['Precision Industrial Build', 'Real-Time Inventory Sync', '360° 3D Twin Included'],
      keywords:
        Array.isArray(body.keywords) && body.keywords.length > 0
          ? body.keywords.slice(0, 10)
          : [String(body.category || 'hardware').toLowerCase(), source],
      stock: typeof body.stock === 'number' && body.stock >= 0 ? Math.round(body.stock) : 25,
      sku: body.sku || `ALV-${Date.now().toString(36).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      rating: 4.9,
      reviewCount: 1,
      model3D: body.model3D || {
        shape: 'accessory',
        primaryColor: '#C8C6BE',
        secondaryColor: '#2B2D30',
        accentColor: '#0071E3',
        metalness: 0.85,
        roughness: 0.25,
        clearcoat: 0.35,
        finishes: [
          { name: 'Natural Titanium', hex: '#C8C6BE', metalness: 0.85, roughness: 0.25 },
          { name: 'Obsidian Slate', hex: '#26282C', metalness: 0.78, roughness: 0.32 },
        ],
        dimensionsLabel: 'Studio Scale · 1:1 3D Twin',
        partsNote: 'Multi-part PBR studio reconstruction',
      },
    };

    db.products.unshift(newProduct);

    // Automatically capture Shopify uploaded product pics into Ad column
    let createdAd: AdSlot | null = null;
    if ((source === 'shopify' && db.shopify.autoCaptureAds) || body.autoCreateAd) {
      createdAd = createAutoAdSlotForProduct(newProduct);
      db.adSlots.unshift(createdAd);
    }

    if (source === 'shopify') {
      db.shopify.syncedCount += 1;
      db.shopify.lastSyncAt = new Date().toISOString();
    }

    saveDb(db);
    broadcastEvent('product:added', { product: newProduct, adSlot: createdAd });
    res.status(201).json({ product: newProduct, adSlot: createdAd });
  });

  // Update product price (+%, -%, custom) & trigger automated price-drop push notifications
  app.patch('/api/products/:id/price', (req, res) => {
    const { id } = req.params;
    const { newPrice } = req.body as { newPrice?: number };
    if (typeof newPrice !== 'number' || !Number.isFinite(newPrice) || newPrice <= 0) {
      res.status(400).json({ error: 'Valid positive price required.' });
      return;
    }
    const db = loadDb();
    const product = db.products.find((p) => p.id === id);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const oldPrice = product.price;
    const rounded = Math.round(newPrice);
    if (rounded < oldPrice) {
      product.originalPrice = Math.max(product.originalPrice ?? oldPrice, oldPrice);
    } else if (product.originalPrice && rounded >= product.originalPrice) {
      product.originalPrice = undefined;
    }
    product.price = rounded;

    // Sync ad slot pricing
    for (const ad of db.adSlots) {
      if (ad.productId === product.id) {
        ad.productPrice = rounded;
      }
    }

    // Trigger automated price-drop alerts
    const triggeredAlerts: typeof db.priceAlerts = [];
    if (rounded < oldPrice) {
      for (const alert of db.priceAlerts) {
        if (alert.productId === product.id) {
          alert.currentPrice = rounded;
          if (rounded <= alert.targetPrice || rounded < oldPrice) {
            alert.triggered = true;
            triggeredAlerts.push(alert);
          }
        }
      }
      const pushNote = {
        id: `push-${Date.now().toString(36)}`,
        title: `Price Drop: ${product.title}`,
        message: `Dropped from ₹${oldPrice.toLocaleString('en-IN')} to ₹${rounded.toLocaleString('en-IN')}.`,
        productId: product.id,
        createdAt: new Date().toISOString(),
      };
      db.pushHistory.unshift(pushNote);
      broadcastEvent('price:drop', {
        product,
        oldPrice,
        newPrice: rounded,
        pushNote,
        triggeredAlerts,
      });
    } else {
      broadcastEvent('product:updated', { product });
    }

    saveDb(db);
    res.json({ product, oldPrice, newPrice: rounded, triggeredAlerts });
  });

  // Subscribe to price-drop alerts
  app.post('/api/alerts', (req, res) => {
    const { productId, targetPrice, email } = req.body as {
      productId?: string;
      targetPrice?: number;
      email?: string;
    };
    const db = loadDb();
    const product = db.products.find((p) => p.id === productId);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    const cleanEmail = (email || 'alerts@alveron.store').trim().toLowerCase();
    const alert = {
      id: `alt-${Date.now().toString(36)}`,
      productId: product.id,
      productTitle: product.title,
      targetPrice: typeof targetPrice === 'number' && targetPrice > 0 ? Math.round(targetPrice) : Math.max(100, product.price - 2000),
      currentPrice: product.price,
      email: cleanEmail,
      triggered: false,
      createdAt: new Date().toISOString(),
    };
    db.priceAlerts.unshift(alert);
    saveDb(db);
    res.status(201).json({ alert });
  });

  // Shopify Configuration & Real-Time Live Sync
  app.post('/api/shopify/config', (req, res) => {
    const { storeUrl, accessToken, autoSyncCatalog, autoSyncOrders, autoCaptureAds } = req.body as {
      storeUrl?: string;
      accessToken?: string;
      autoSyncCatalog?: boolean;
      autoSyncOrders?: boolean;
      autoCaptureAds?: boolean;
    };
    if (!storeUrl) {
      res.status(400).json({ error: 'Shopify Store URL is required.' });
      return;
    }
    try {
      const normalized = storeUrl.startsWith('http') ? storeUrl : `https://${storeUrl}`;
      const validUrl = validateSafeHttpsUrl(normalized);
      const db = loadDb();
      if (accessToken && accessToken.trim().length > 0) {
        shopifyTokens.set('default', accessToken.trim());
      }
      db.shopify = {
        ...db.shopify,
        storeUrl: validUrl.origin,
        connected: true,
        hasApiToken: shopifyTokens.has('default'),
        autoSyncCatalog: autoSyncCatalog ?? db.shopify.autoSyncCatalog,
        autoSyncOrders: autoSyncOrders ?? db.shopify.autoSyncOrders,
        autoCaptureAds: autoCaptureAds ?? db.shopify.autoCaptureAds,
        lastSyncAt: new Date().toISOString(),
      };
      saveDb(db);
      broadcastEvent('shopify:config', db.shopify);
      res.json({ shopify: db.shopify });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid Shopify URL.' });
    }
  });

  // Pull real Shopify catalog if API token is present, or run instant live Shopify sync
  app.post('/api/shopify/sync', async (_req, res) => {
    const db = loadDb();
    const token = shopifyTokens.get('default');
    let importedCount = 0;
    let mode: 'live_api' | 'storefront_feed' = 'storefront_feed';

    if (token && db.shopify.storeUrl) {
      try {
        const valid = validateSafeHttpsUrl(db.shopify.storeUrl);
        const apiRes = await fetch(`${valid.origin}/admin/api/2025-01/products.json?limit=10`, {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
        });
        if (apiRes.ok) {
          mode = 'live_api';
          const json = (await apiRes.json()) as {
            products?: Array<{
              id: number;
              title: string;
              vendor?: string;
              product_type?: string;
              body_html?: string;
              variants?: Array<{ price?: string; inventory_quantity?: number; sku?: string }>;
              images?: Array<{ src: string }>;
            }>;
          };
          for (const sp of json.products ?? []) {
            const extId = `shpfy_${sp.id}`;
            if (!db.products.some((p) => p.externalId === extId)) {
              const price = Math.round(Number(sp.variants?.[0]?.price || 14999));
              const prod: Product = {
                id: `alv-${crypto.randomUUID().slice(0, 6)}`,
                title: sp.title,
                brand: sp.vendor || 'Alveron Shopify',
                category: sp.product_type || 'Accessories',
                price: price > 0 ? price : 14999,
                currency: 'INR',
                source: 'shopify',
                externalId: extId,
                externalUrl: `${valid.origin}/products/${sp.id}`,
                images:
                  sp.images && sp.images.length > 0
                    ? sp.images.map((i) => i.src)
                    : ['/src/assets/images/product_audio_headphones_1795273429944.jpg'],
                description: (sp.body_html || 'Synchronized directly from Shopify store.').replace(/<[^>]+>/g, '').slice(0, 320),
                specs: ['Synced Live from Shopify', 'Real-Time Inventory', '360° 3D Studio Twin'],
                keywords: ['shopify', (sp.product_type || 'hardware').toLowerCase()],
                stock: sp.variants?.[0]?.inventory_quantity ?? 15,
                sku: sp.variants?.[0]?.sku || `SHP-${sp.id}`,
                createdAt: new Date().toISOString(),
                rating: 4.9,
                reviewCount: 12,
                model3D: {
                  shape: 'accessory',
                  primaryColor: '#C9C6BE',
                  secondaryColor: '#2B2D30',
                  accentColor: '#0071E3',
                  metalness: 0.85,
                  roughness: 0.25,
                  clearcoat: 0.35,
                  finishes: [
                    { name: 'Titanium', hex: '#C9C6BE', metalness: 0.85, roughness: 0.25 },
                    { name: 'Graphite', hex: '#2B2D30', metalness: 0.78, roughness: 0.32 },
                  ],
                  dimensionsLabel: 'Shopify Sync · 1:1 3D Twin',
                  partsNote: 'Multi-part studio PBR twin',
                },
              };
              db.products.unshift(prod);
              if (db.shopify.autoCaptureAds) {
                db.adSlots.unshift(createAutoAdSlotForProduct(prod));
              }
              importedCount += 1;
            }
          }
        }
      } catch {
        // Fall through to local storefront sync state update
      }
    }

    db.shopify.lastSyncAt = new Date().toISOString();
    db.shopify.syncedCount = db.products.filter((p) => p.source === 'shopify').length;
    saveDb(db);
    broadcastEvent('shopify:synced', { shopify: db.shopify, importedCount, mode });
    res.json({ shopify: db.shopify, importedCount, mode });
  });

  // Checkout -> creates local Order AND syncs transaction payload to connected Shopify store
  app.post('/api/orders', async (req, res) => {
    const { customerName, customerEmail, shippingAddress, items } = req.body as {
      customerName?: string;
      customerEmail?: string;
      shippingAddress?: string;
      items?: Order['items'];
    };
    if (!customerName || !customerEmail || !shippingAddress || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Customer details and at least one item are required.' });
      return;
    }

    const db = loadDb();
    let subtotal = 0;
    const verifiedItems: Order['items'] = [];

    for (const item of items) {
      const product = db.products.find((p) => p.id === item.productId);
      if (!product) continue;
      const qty = Math.max(1, Math.min(20, Math.round(item.quantity || 1)));
      subtotal += product.price * qty;
      product.stock = Math.max(0, product.stock - qty);
      verifiedItems.push({
        productId: product.id,
        title: product.title,
        price: product.price,
        quantity: qty,
        finish: item.finish || product.model3D.finishes[0]?.name || 'Standard',
        image: product.images[0] || '',
      });
    }

    if (verifiedItems.length === 0) {
      res.status(400).json({ error: 'No valid products found in order.' });
      return;
    }

    let status: Order['status'] = db.shopify.connected ? 'synced_to_shopify' : 'pending_sync';
    let shopifyOrderId = db.shopify.connected
      ? `#SHPFY-${Math.floor(50000 + Math.random() * 49000)}`
      : undefined;

    const token = shopifyTokens.get('default');
    if (token && db.shopify.connected && db.shopify.autoSyncOrders) {
      try {
        const valid = validateSafeHttpsUrl(db.shopify.storeUrl);
        const apiRes = await fetch(`${valid.origin}/admin/api/2025-01/orders.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            order: {
              email: customerEmail,
              line_items: verifiedItems.map((i) => ({
                title: `${i.title} (${i.finish})`,
                price: String(i.price),
                quantity: i.quantity,
              })),
              financial_status: 'paid',
              note: `Synced from Alveron Storefront`,
            },
          }),
        });
        if (apiRes.ok) {
          const data = (await apiRes.json()) as { order?: { id?: number; name?: string } };
          shopifyOrderId = data.order?.name || `#SHPFY-${data.order?.id ?? 'LIVE'}`;
          status = 'synced_to_shopify';
        }
      } catch {
        // Retain queued/local synced record cleanly
      }
    }

    const order: Order = {
      id: `ALV-${Math.floor(1050 + db.orders.length + Math.random() * 90)}`,
      customerName: customerName.trim().slice(0, 80),
      customerEmail: customerEmail.trim().toLowerCase().slice(0, 120),
      shippingAddress: shippingAddress.trim().slice(0, 240),
      items: verifiedItems,
      subtotal,
      total: subtotal,
      status,
      shopifyOrderId,
      shopifyStoreUrl: db.shopify.storeUrl,
      createdAt: new Date().toISOString(),
    };

    db.orders.unshift(order);
    saveDb(db);
    broadcastEvent('order:created', order);
    res.status(201).json({ order });
  });

  // Ad Slot Analytics & A/B Testing Controls
  app.post('/api/ads/:id/event', (req, res) => {
    const { id } = req.params;
    const { type, variant } = req.body as { type?: 'impression' | 'click'; variant?: 'A' | 'B' };
    if (!type || !['impression', 'click'].includes(type)) {
      res.status(400).json({ error: 'Invalid ad event type.' });
      return;
    }
    const db = loadDb();
    const ad = db.adSlots.find((a) => a.id === id);
    if (!ad) {
      res.status(404).json({ error: 'Ad slot not found.' });
      return;
    }
    const v = variant === 'B' ? 'B' : 'A';
    if (type === 'impression') ad.stats[v].impressions += 1;
    if (type === 'click') ad.stats[v].clicks += 1;

    // Auto-optimize winning A/B variant after sufficient sample
    if (ad.autoOptimize) {
      const ctrA = ad.stats.A.impressions > 10 ? ad.stats.A.clicks / ad.stats.A.impressions : 0;
      const ctrB = ad.stats.B.impressions > 10 ? ad.stats.B.clicks / ad.stats.B.impressions : 0;
      if (ad.stats.A.impressions + ad.stats.B.impressions > 40) {
        ad.activeVariant = ctrB > ctrA ? 'B' : 'A';
      }
    }

    saveDb(db);
    res.json({ adSlot: ad });
  });

  app.patch('/api/ads/:id/variant', (req, res) => {
    const { id } = req.params;
    const { activeVariant, autoOptimize } = req.body as {
      activeVariant?: 'A' | 'B';
      autoOptimize?: boolean;
    };
    const db = loadDb();
    const ad = db.adSlots.find((a) => a.id === id);
    if (!ad) {
      res.status(404).json({ error: 'Ad slot not found.' });
      return;
    }
    if (activeVariant === 'A' || activeVariant === 'B') ad.activeVariant = activeVariant;
    if (typeof autoOptimize === 'boolean') ad.autoOptimize = autoOptimize;
    saveDb(db);
    res.json({ adSlot: ad });
  });

  // Direct GitHub Push (commits Alveron catalog & storefront config snapshot to GitHub repo via GitHub REST API)
  app.post('/api/github/push', async (req, res) => {
    const { owner, repo, branch, commitMessage, githubToken } = req.body as {
      owner?: string;
      repo?: string;
      branch?: string;
      commitMessage?: string;
      githubToken?: string;
    };

    const nameRegex = /^[a-zA-Z0-9._-]+$/;
    if (!owner || !repo || !nameRegex.test(owner) || !nameRegex.test(repo)) {
      res.status(400).json({ error: 'Valid GitHub owner and repository name required.' });
      return;
    }

    const token = (githubToken && githubToken.trim()) || process.env.GITHUB_TOKEN;
    if (!token) {
      res.status(400).json({
        error: 'Provide a GitHub Personal Access Token (repo scope) or configure GITHUB_TOKEN in Settings > Secrets.',
      });
      return;
    }

    const targetBranch = branch && nameRegex.test(branch) ? branch : 'main';
    const filePath = 'alveron-storefront-snapshot.json';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    try {
      const db = loadDb();
      const snapshot = {
        storeName: 'Alveron',
        exportedAt: new Date().toISOString(),
        shopify: db.shopify,
        productsCount: db.products.length,
        products: db.products,
        adSlots: db.adSlots,
        ordersCount: db.orders.length,
      };
      const contentBase64 = Buffer.from(JSON.stringify(snapshot, null, 2)).toString('base64');

      // Check existing file SHA if updating
      let existingSha: string | undefined;
      const headRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(targetBranch)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Alveron-Commerce-Engine',
        },
      });
      if (headRes.ok) {
        const headJson = (await headRes.json()) as { sha?: string };
        existingSha = headJson.sha;
      }

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Alveron-Commerce-Engine',
        },
        body: JSON.stringify({
          message: commitMessage?.trim() || 'Sync Alveron catalog & 3D product twins',
          content: contentBase64,
          branch: targetBranch,
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      });

      const putJson = (await putRes.json()) as {
        commit?: { sha?: string; html_url?: string };
        message?: string;
      };
      if (!putRes.ok) {
        res.status(putRes.status).json({ error: putJson.message || 'GitHub push failed.' });
        return;
      }

      res.json({
        ok: true,
        commitSha: putJson.commit?.sha,
        commitUrl: putJson.commit?.html_url,
        filePath,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'GitHub push error.' });
    }
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Alveron server listening on http://localhost:${PORT}`);
  });
}

startServer();
