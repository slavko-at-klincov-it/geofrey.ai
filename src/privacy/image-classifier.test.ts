import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  classifyImage,
  setVisionConfig,
  getVisionConfig,
  shouldBlockImage,
  shouldOcrOnly,
  ROUTING_MAP,
  CLASSIFICATION_PROMPT,
  type ClassificationResult,
  type ImageCategory,
  type ImageRouting,
} from "./image-classifier.js";

describe("image-classifier", () => {
  beforeEach(() => {
    // Reset config between tests
    setVisionConfig(null as unknown as { ollamaBaseUrl: string; model: string });
  });

  describe("classifyImage", () => {
    it("returns pass_through when no config set", async () => {
      const result = await classifyImage(Buffer.from("fake-image"));
      assert.equal(result.category, "other");
      assert.equal(result.routing, "pass_through");
      assert.equal(result.confidence, 0);
      assert.match(result.reason, /not configured/i);
    });
  });

  describe("setVisionConfig", () => {
    it("stores config", () => {
      setVisionConfig({ ollamaBaseUrl: "http://localhost:11434", model: "qwen2.5-vl:2b" });
      const config = getVisionConfig();
      assert.deepEqual(config, { ollamaBaseUrl: "http://localhost:11434", model: "qwen2.5-vl:2b" });
    });
  });

  describe("shouldBlockImage", () => {
    it("returns true for photo_with_faces routing (block)", () => {
      const result: ClassificationResult = {
        category: "photo_with_faces",
        routing: "block",
        confidence: 0.95,
        reason: "Human face detected",
      };
      assert.equal(shouldBlockImage(result), true);
    });

    it("returns false for non-block routing", () => {
      const result: ClassificationResult = {
        category: "document",
        routing: "ocr_only",
        confidence: 0.9,
        reason: "Scanned document",
      };
      assert.equal(shouldBlockImage(result), false);
    });

    it("returns false for describe routing", () => {
      const result: ClassificationResult = {
        category: "photo_without_faces",
        routing: "describe",
        confidence: 0.8,
        reason: "Landscape photo",
      };
      assert.equal(shouldBlockImage(result), false);
    });

    it("returns false for pass_through routing", () => {
      const result: ClassificationResult = {
        category: "other",
        routing: "pass_through",
        confidence: 0.5,
        reason: "Unknown",
      };
      assert.equal(shouldBlockImage(result), false);
    });
  });

  describe("shouldOcrOnly", () => {
    it("returns true for document routing (ocr_only)", () => {
      const result: ClassificationResult = {
        category: "document",
        routing: "ocr_only",
        confidence: 0.9,
        reason: "Invoice",
      };
      assert.equal(shouldOcrOnly(result), true);
    });

    it("returns true for code routing (ocr_only)", () => {
      const result: ClassificationResult = {
        category: "code",
        routing: "ocr_only",
        confidence: 0.85,
        reason: "Code screenshot",
      };
      assert.equal(shouldOcrOnly(result), true);
    });

    it("returns true for screenshot routing (ocr_only)", () => {
      const result: ClassificationResult = {
        category: "screenshot",
        routing: "ocr_only",
        confidence: 0.8,
        reason: "UI screenshot",
      };
      assert.equal(shouldOcrOnly(result), true);
    });

    it("returns false for non-ocr_only routing", () => {
      const result: ClassificationResult = {
        category: "photo_with_faces",
        routing: "block",
        confidence: 0.95,
        reason: "Face photo",
      };
      assert.equal(shouldOcrOnly(result), false);
    });
  });

  describe("ROUTING_MAP", () => {
    it("covers all 7 categories", () => {
      const expectedCategories: ImageCategory[] = [
        "document",
        "photo_with_faces",
        "photo_without_faces",
        "diagram",
        "code",
        "screenshot",
        "other",
      ];
      for (const cat of expectedCategories) {
        assert.ok(cat in ROUTING_MAP, `Missing category in ROUTING_MAP: ${cat}`);
      }
      assert.equal(Object.keys(ROUTING_MAP).length, 7);
    });

    it("maps document to ocr_only", () => {
      assert.equal(ROUTING_MAP.document, "ocr_only");
    });

    it("maps photo_with_faces to block", () => {
      assert.equal(ROUTING_MAP.photo_with_faces, "block");
    });

    it("maps photo_without_faces to describe", () => {
      assert.equal(ROUTING_MAP.photo_without_faces, "describe");
    });

    it("maps diagram to describe", () => {
      assert.equal(ROUTING_MAP.diagram, "describe");
    });

    it("maps code to ocr_only", () => {
      assert.equal(ROUTING_MAP.code, "ocr_only");
    });

    it("maps screenshot to ocr_only", () => {
      assert.equal(ROUTING_MAP.screenshot, "ocr_only");
    });

    it("maps other to pass_through", () => {
      assert.equal(ROUTING_MAP.other, "pass_through");
    });

    it("every routing value is valid", () => {
      const validRoutings = new Set<ImageRouting>(["ocr_only", "describe", "block", "pass_through"]);
      for (const routing of Object.values(ROUTING_MAP)) {
        assert.ok(validRoutings.has(routing), `Invalid routing: ${routing}`);
      }
    });
  });

  describe("CLASSIFICATION_PROMPT", () => {
    it("contains all required categories", () => {
      const categories: ImageCategory[] = [
        "document",
        "photo_with_faces",
        "photo_without_faces",
        "diagram",
        "code",
        "screenshot",
        "other",
      ];
      for (const cat of categories) {
        assert.ok(
          CLASSIFICATION_PROMPT.includes(`"${cat}"`),
          `Prompt missing category: ${cat}`,
        );
      }
    });

    it("contains JSON response format instruction", () => {
      assert.ok(CLASSIFICATION_PROMPT.includes("JSON"));
      assert.ok(CLASSIFICATION_PROMPT.includes("confidence"));
      assert.ok(CLASSIFICATION_PROMPT.includes("category"));
      assert.ok(CLASSIFICATION_PROMPT.includes("reason"));
    });
  });

  describe("graceful degradation", () => {
    it("returns pass_through on fetch error", async () => {
      setVisionConfig({ ollamaBaseUrl: "http://localhost:99999", model: "qwen2.5-vl:2b" });
      const result = await classifyImage(Buffer.from("fake-image-data"));
      assert.equal(result.category, "other");
      assert.equal(result.routing, "pass_through");
      assert.equal(result.confidence, 0);
      assert.ok(result.reason.startsWith("Classification failed:"));
    });
  });
});
