import { useRef, useState } from 'react';
import { Camera, Check, Loader2, Sparkles, Upload, X } from 'lucide-react';
import type { LensIdentificationResult, Product } from '../types.ts';
import { formatINR } from '../utils/currency.ts';
import { Product3DViewer } from './Product3DViewer.tsx';

interface LensSearchModalProps {
  products: Product[];
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  onPublishCatalogItem: (payload: {
    title: string;
    brand: string;
    category: string;
    price: number;
    description: string;
    specs: string[];
    keywords: string[];
    images: string[];
    source: 'shopify' | 'alveron';
    model3D: LensIdentificationResult['model3D'];
  }) => Promise<Product>;
}

export function LensSearchModal({
  products,
  onClose,
  onSelectProduct,
  onPublishCatalogItem,
}: LensSearchModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LensIdentificationResult | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedProduct, setPublishedProduct] = useState<Product | null>(null);

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const analyzeImage = async (dataUrl: string) => {
    setPreviewDataUrl(dataUrl);
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setPublishedProduct(null);
    try {
      const res = await fetch('/api/ai/lens-identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      const json = (await res.json()) as LensIdentificationResult & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Visual identification failed.');
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to analyze product image.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        analyzeImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setError('Camera permission unavailable. Please upload a product photo instead.');
    }
  };

  const captureFrame = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 720;
    canvas.height = videoRef.current.videoHeight || 540;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();
    analyzeImage(dataUrl);
  };

  const handlePublish = async () => {
    if (!result || !previewDataUrl) return;
    setPublishing(true);
    try {
      const created = await onPublishCatalogItem({
        title: result.title,
        brand: result.brand,
        category: result.category,
        price: result.estimatedPrice,
        description: result.description,
        specs: result.specs,
        keywords: result.keywords,
        images: [previewDataUrl],
        source: 'shopify',
        model3D: result.model3D,
      });
      setPublishedProduct(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Catalog publish failed.');
    } finally {
      setPublishing(false);
    }
  };

  const matchedCatalog = result
    ? products.filter((p) => result.matchedProductIds.includes(p.id))
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative my-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-black/[0.08]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] pb-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-[#1D1D1F]">
              Alveron Lens Search & 3D Auto-Catalog
            </h2>
            <p className="mt-1 text-xs text-[#6E6E73]">
              Snap or upload any product photo to search matching inventory and automatically generate a 360° 3D duplicate.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Left: Capture / Upload Zone */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1D1D1F] px-4 py-2.5 text-xs font-medium text-white hover:bg-black transition-colors whitespace-nowrap"
              >
                <Upload className="h-4 w-4" />
                <span>Upload Photo</span>
              </button>
              <button
                type="button"
                onClick={cameraActive ? captureFrame : startCamera}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-2.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors whitespace-nowrap"
              >
                <Camera className="h-4 w-4" />
                <span>{cameraActive ? 'Capture Frame' : 'Use Live Camera'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-black/[0.08] bg-[#F5F5F7] flex items-center justify-center">
              {cameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
              ) : previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="Uploaded product for Lens analysis"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="p-6 text-center text-xs text-[#6E6E73] space-y-2">
                  <Camera className="mx-auto h-7 w-7 text-[#86868B]" />
                  <p>Upload a hardware, wearable, camera, or speaker photo for instant visual recognition.</p>
                </div>
              )}
            </div>

            {analyzing && (
              <div className="flex items-center gap-2.5 rounded-xl bg-[#F5F5F7] px-4 py-3 text-xs font-medium text-[#1D1D1F]">
                <Loader2 className="h-4 w-4 animate-spin text-[#0071E3]" />
                <span>Analyzing product geometry, surface materials, and catalog matches...</span>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Right: Identification Result + Auto 360° 3D Preview */}
          <div className="space-y-4">
            {result ? (
              <>
                <div className="rounded-2xl border border-black/[0.06] bg-[#FAFAFA] p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#6E6E73]">
                    <span>
                      {result.brand} · {result.category}
                    </span>
                    <span className="font-mono-tabular font-semibold text-[#1D1D1F]">
                      Est. {formatINR(result.estimatedPrice)}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-[#1D1D1F]">
                    {result.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-[#424245]">{result.description}</p>
                  <p className="text-[11px] text-[#6E6E73]">
                    Keywords: {result.keywords.join(' · ')}
                  </p>
                </div>

                <Product3DViewer
                  blueprint={result.model3D}
                  productTitle={result.title}
                  compact
                />

                {publishedProduct ? (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-800">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Check className="h-4 w-4" />
                      Cataloged to Alveron & Shopify Feed
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProduct(publishedProduct);
                        handleClose();
                      }}
                      className="font-semibold underline"
                    >
                      Open Product
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={publishing}
                    onClick={handlePublish}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-4 py-3 text-xs font-medium text-white hover:bg-[#0077ED] disabled:opacity-60 transition-colors"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {publishing
                        ? 'Cataloging to Local DB & Ad Slot...'
                        : 'Auto-Catalog to Store + Add 360° 3D Twin'}
                    </span>
                  </button>
                )}

                {matchedCatalog.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-semibold text-[#1D1D1F]">
                      Matching Catalog Products
                    </h4>
                    <div className="space-y-2">
                      {matchedCatalog.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onSelectProduct(m);
                            handleClose();
                          }}
                          className="flex w-full items-center justify-between rounded-xl border border-black/[0.06] bg-white p-2.5 text-left hover:bg-[#F5F5F7] transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={m.images[0]}
                              alt={m.title}
                              referrerPolicy="no-referrer"
                              className="h-10 w-12 rounded-lg object-cover bg-[#F5F5F7]"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-[#1D1D1F]">
                                {m.title}
                              </p>
                              <p className="text-[11px] text-[#6E6E73]">{m.category}</p>
                            </div>
                          </div>
                          <span className="font-mono-tabular text-xs font-medium text-[#1D1D1F]">
                            {formatINR(m.price)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-[#FAFAFA] p-6 text-center text-xs text-[#6E6E73]">
                <p className="font-medium text-[#1D1D1F]">Waiting for product capture</p>
                <p className="mt-1 max-w-xs">
                  Once uploaded, Gemini Vision identifies specs, matches existing inventory, and builds an interactive 360° 3D duplicate.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
