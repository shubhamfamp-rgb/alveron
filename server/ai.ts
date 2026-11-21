import { GoogleGenAI, Type } from '@google/genai';
import type { LensIdentificationResult, Model3DBlueprint, Product } from '../src/types.ts';

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseBase64DataUrl(input: string): { mimeType: string; data: string } {
  const match = input.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: 'image/jpeg', data: input };
}

const blueprintSchema = {
  type: Type.OBJECT,
  properties: {
    shape: {
      type: Type.STRING,
      description:
        'Closest 3D silhouette archetype: one of headphones, watch, speaker, camera, lamp, earbuds, laptop, bottle, accessory',
    },
    primaryColor: { type: Type.STRING, description: 'Hex color string like #C8C6BE' },
    secondaryColor: { type: Type.STRING, description: 'Hex color string like #2B2D30' },
    accentColor: { type: Type.STRING, description: 'Hex color string like #0071E3' },
    metalness: { type: Type.NUMBER, description: '0.0 to 1.0 PBR metalness' },
    roughness: { type: Type.NUMBER, description: '0.05 to 1.0 PBR roughness' },
    clearcoat: { type: Type.NUMBER, description: '0.0 to 1.0 PBR clearcoat' },
    dimensionsLabel: { type: Type.STRING, description: 'Estimated size & weight label' },
    partsNote: { type: Type.STRING, description: 'Short summary of multi-part 3D geometry' },
  },
};

export async function identifyProductWithLens(
  imageBase64: string,
  catalog: Product[],
): Promise<LensIdentificationResult> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }

  const { mimeType, data } = parseBase64DataUrl(imageBase64);
  const catalogSummary = catalog
    .map((p) => `${p.id}: ${p.title} (${p.category}, keywords: ${p.keywords.join(', ')})`)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data,
          },
        },
        {
          text: `You are Alveron's Google Lens visual product cataloger and 3D digital-twin architect.
Analyze the uploaded product photo carefully and output structured JSON identifying:
1) title, brand, category (one of: Audio, Wearables, Workspace, Home, Accessories), concise Apple-editorial description, estimatedPrice (Indian Rupees INR integer, e.g. 24999), 5-7 keywords, 4 concise technical specs.
2) model3D blueprint that replicates the photographed product's materials, exact surface colors, finish sheen, and closest silhouette shape (headphones, watch, speaker, camera, lamp, earbuds, laptop, bottle, or accessory).
3) matchedProductIds: up to 3 IDs from the existing store catalog below that match the photographed item's category, form, or keywords:
${catalogSummary}`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          brand: { type: Type.STRING },
          category: { type: Type.STRING },
          description: { type: Type.STRING },
          estimatedPrice: { type: Type.NUMBER },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          specs: { type: Type.ARRAY, items: { type: Type.STRING } },
          matchedProductIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          model3D: blueprintSchema,
        },
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<LensIdentificationResult>;
  const rawModel = (parsed.model3D ?? {}) as Partial<Model3DBlueprint>;

  const validShapes = [
    'headphones',
    'watch',
    'speaker',
    'camera',
    'lamp',
    'earbuds',
    'laptop',
    'bottle',
    'accessory',
  ] as const;
  const shape = validShapes.includes(rawModel.shape as (typeof validShapes)[number])
    ? (rawModel.shape as (typeof validShapes)[number])
    : 'accessory';

  const primaryColor = /^#[0-9a-fA-F]{6}$/.test(rawModel.primaryColor ?? '')
    ? (rawModel.primaryColor as string)
    : '#C7C6C1';
  const secondaryColor = /^#[0-9a-fA-F]{6}$/.test(rawModel.secondaryColor ?? '')
    ? (rawModel.secondaryColor as string)
    : '#2B2D30';
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(rawModel.accentColor ?? '')
    ? (rawModel.accentColor as string)
    : '#0071E3';
  const metalness = typeof rawModel.metalness === 'number' ? Math.min(1, Math.max(0, rawModel.metalness)) : 0.78;
  const roughness = typeof rawModel.roughness === 'number' ? Math.min(1, Math.max(0.08, rawModel.roughness)) : 0.28;
  const clearcoat = typeof rawModel.clearcoat === 'number' ? Math.min(1, Math.max(0, rawModel.clearcoat)) : 0.35;

  return {
    title: parsed.title || 'Alveron Curated Hardware',
    brand: parsed.brand || 'Alveron Studio',
    category: parsed.category || 'Accessories',
    description:
      parsed.description ||
      'Precision-crafted hardware captured and cataloged via Alveron Lens.',
    estimatedPrice:
      typeof parsed.estimatedPrice === 'number' && parsed.estimatedPrice > 0
        ? Math.round(parsed.estimatedPrice)
        : 24999,
    keywords: Array.isArray(parsed.keywords) && parsed.keywords.length > 0 ? parsed.keywords : ['hardware', 'minimalist'],
    specs:
      Array.isArray(parsed.specs) && parsed.specs.length > 0
        ? parsed.specs
        : ['Precision Anodized Chassis', 'AI-Matched 360° 3D Twin', 'Studio Quality Finish'],
    matchedProductIds: Array.isArray(parsed.matchedProductIds) ? parsed.matchedProductIds : [],
    model3D: {
      shape,
      primaryColor,
      secondaryColor,
      accentColor,
      metalness,
      roughness,
      clearcoat,
      finishes: [
        { name: 'Captured Finish', hex: primaryColor, metalness, roughness },
        { name: 'Obsidian Slate', hex: '#26282C', metalness: 0.78, roughness: 0.32 },
        { name: 'Brushed Silver', hex: '#DFDFDD', metalness: 0.9, roughness: 0.2 },
      ],
      dimensionsLabel: rawModel.dimensionsLabel || 'Studio Scale · 1:1 3D Twin',
      partsNote: rawModel.partsNote || 'AI-reconstructed multi-part PBR studio twin',
    },
  };
}
