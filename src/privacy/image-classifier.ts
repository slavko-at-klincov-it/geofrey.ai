import { z } from "zod";

// ── Types ──────────────────────────────────────────────────────────────────

export type ImageCategory =
  | "document"
  | "photo_with_faces"
  | "photo_without_faces"
  | "diagram"
  | "code"
  | "screenshot"
  | "other";

export type ImageRouting = "ocr_only" | "describe" | "block" | "pass_through";

export interface ClassificationResult {
  category: ImageCategory;
  routing: ImageRouting;
  confidence: number;
  reason: string;
}

// ── Classification prompt ──────────────────────────────────────────────────

const CLASSIFICATION_PROMPT = `Classify this image into exactly ONE category. Respond with ONLY a JSON object, no other text.

Categories:
- "document": scanned document, letter, invoice, form
- "photo_with_faces": photo containing human faces
- "photo_without_faces": photo of objects, nature, buildings (no faces)
- "diagram": flowchart, UML, architecture diagram, whiteboard
- "code": screenshot of code, terminal, IDE
- "screenshot": UI screenshot, web page, app interface
- "other": anything else

Response format: {"category": "...", "confidence": 0.0-1.0, "reason": "brief explanation"}`;

// ── Routing map ────────────────────────────────────────────────────────────

export const ROUTING_MAP: Record<ImageCategory, ImageRouting> = {
  document: "ocr_only",
  photo_with_faces: "block",
  photo_without_faces: "describe",
  diagram: "describe",
  code: "ocr_only",
  screenshot: "ocr_only",
  other: "pass_through",
};

// ── Valid categories for runtime validation ─────────────────────────────────

const VALID_CATEGORIES = new Set<string>([
  "document",
  "photo_with_faces",
  "photo_without_faces",
  "diagram",
  "code",
  "screenshot",
  "other",
]);

// ── Zod schema for VL response parsing ──────────────────────────────────────

const vlResponseSchema = z.object({
  category: z.string(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  reason: z.string().optional().default(""),
});

// ── Config ──────────────────────────────────────────────────────────────────

let vlConfig: { ollamaBaseUrl: string; model: string } | null = null;

export function setVisionConfig(config: { ollamaBaseUrl: string; model: string }): void {
  vlConfig = config;
}

export function getVisionConfig(): { ollamaBaseUrl: string; model: string } | null {
  return vlConfig;
}

// ── Model lifecycle ─────────────────────────────────────────────────────────

async function loadModel(baseUrl: string, model: string): Promise<void> {
  await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: "", keep_alive: "5m" }),
  });
}

async function unloadModel(baseUrl: string, model: string): Promise<void> {
  await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: "", keep_alive: 0 }),
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function classifyImage(imageBuffer: Buffer): Promise<ClassificationResult> {
  if (!vlConfig) {
    return {
      category: "other",
      routing: "pass_through",
      confidence: 0,
      reason: "Vision model not configured",
    };
  }

  const { ollamaBaseUrl, model } = vlConfig;
  const base64 = imageBuffer.toString("base64");

  try {
    // Load model on-demand
    await loadModel(ollamaBaseUrl, model);

    const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: CLASSIFICATION_PROMPT,
        images: [base64],
        stream: false,
        options: { temperature: 0.1, num_predict: 200 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Ollama VL API returned ${response.status}`);
    }

    const data = (await response.json()) as { response: string };

    // Parse JSON from response (may have markdown wrapping)
    const jsonMatch = data.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in VL response");
    }

    const parsed = vlResponseSchema.parse(JSON.parse(jsonMatch[0]));
    const category: ImageCategory = VALID_CATEGORIES.has(parsed.category)
      ? (parsed.category as ImageCategory)
      : "other";
    const routing = ROUTING_MAP[category];

    return {
      category,
      routing,
      confidence: parsed.confidence,
      reason: parsed.reason,
    };
  } catch (err) {
    // Graceful degradation: if VL model fails, default to pass_through
    const msg = err instanceof Error ? err.message : String(err);
    return {
      category: "other",
      routing: "pass_through",
      confidence: 0,
      reason: `Classification failed: ${msg}`,
    };
  } finally {
    // Always unload model to free memory
    try {
      await unloadModel(ollamaBaseUrl, model);
    } catch {
      // Non-critical — model may already be unloaded
    }
  }
}

// ── Convenience helpers ─────────────────────────────────────────────────────

export function shouldBlockImage(result: ClassificationResult): boolean {
  return result.routing === "block";
}

export function shouldOcrOnly(result: ClassificationResult): boolean {
  return result.routing === "ocr_only";
}

export { CLASSIFICATION_PROMPT };
