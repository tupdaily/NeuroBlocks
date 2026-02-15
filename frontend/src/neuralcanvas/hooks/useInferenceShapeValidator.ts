/**
 * Frontend validation hook for inference input shapes
 * Does client-side validation before uploading to server
 */

import { useMemo } from "react";
import { processImageFile } from "@/neuralcanvas/utils/imageProcessor";
import { getTensorFileInfo } from "@/neuralcanvas/utils/tensorPreview";

export interface ValidationResult {
  valid: boolean; // Passes validation
  warning: boolean; // Warning but not blocking
  message: string; // User-friendly message
  detectedShape: number[] | null;
  expectedShape: number[] | null;
}

export function useInferenceShapeValidator(
  expectedShape: number[] | null,
  expectedInputType: "image" | "text" | "tensor" | null
) {
  /**
   * Validate image file dimensions
   */
  const validateImage = async (file: File): Promise<ValidationResult> => {
    if (!file.type.startsWith("image/")) {
      return {
        valid: false,
        warning: false,
        message: "❌ File is not a valid image",
        detectedShape: null,
        expectedShape,
      };
    }

    if (!expectedShape) {
      return {
        valid: true,
        warning: false,
        message: "⏳ Ready to upload image",
        detectedShape: null,
        expectedShape: null,
      };
    }

    const result = await processImageFile(file);

    if (result.error) {
      return {
        valid: false,
        warning: false,
        message: `❌ Cannot read image: ${result.error}`,
        detectedShape: null,
        expectedShape,
      };
    }

    // Flatten shape from [H, W, C] to total features
    const totalFeatures = result.detectedShape[0] * result.detectedShape[1] * result.detectedShape[2];
    const expectedTotal = expectedShape[0]; // Expected shape is already flattened

    // For images, we're usually matching [H*W*C] with expected [features]
    // Allow within 10% tolerance for resizing
    const tolerance = expectedTotal * 0.1;
    const withinTolerance = Math.abs(totalFeatures - expectedTotal) <= tolerance;

    if (totalFeatures === expectedTotal) {
      return {
        valid: true,
        warning: false,
        message: `✓ Image shape matches (${totalFeatures} features)`,
        detectedShape: [totalFeatures],
        expectedShape,
      };
    } else if (withinTolerance) {
      return {
        valid: true,
        warning: true,
        message: `⚠️ Image detected: ${result.detectedShape[0]}×${result.detectedShape[1]}×${result.detectedShape[2]}, will resize to ${expectedTotal} features`,
        detectedShape: [totalFeatures],
        expectedShape,
      };
    } else {
      return {
        valid: false,
        warning: false,
        message: `❌ Image has ${totalFeatures} features, model expects ${expectedTotal}. Try a ${Math.round(Math.sqrt(expectedTotal))}×${Math.round(Math.sqrt(expectedTotal))} image.`,
        detectedShape: [totalFeatures],
        expectedShape,
      };
    }
  };

  /**
   * Validate text input length
   */
  const validateText = (text: string): ValidationResult => {
    if (!text || text.trim().length === 0) {
      return {
        valid: false,
        warning: false,
        message: "❌ Text is empty",
        detectedShape: null,
        expectedShape,
      };
    }

    if (!expectedShape) {
      return {
        valid: true,
        warning: false,
        message: "⏳ Ready to process text",
        detectedShape: null,
        expectedShape: null,
      };
    }

    // Text will be embedded to 1536 dims (OpenAI text-embedding-3-small)
    const embeddingDims = 1536;

    if (expectedShape[0] === embeddingDims) {
      return {
        valid: true,
        warning: false,
        message: `✓ Text will be embedded to ${embeddingDims} dimensions`,
        detectedShape: [embeddingDims],
        expectedShape,
      };
    } else {
      return {
        valid: false,
        warning: false,
        message: `❌ Model expects ${expectedShape[0]} features, but text embeddings produce ${embeddingDims}`,
        detectedShape: [embeddingDims],
        expectedShape,
      };
    }
  };

  /**
   * Validate tensor file size (rough check)
   */
  const validateTensor = async (file: File): Promise<ValidationResult> => {
    if (!file.name.endsWith(".pt") && !file.name.endsWith(".pth")) {
      return {
        valid: false,
        warning: false,
        message: "❌ File must be .pt or .pth (PyTorch tensor)",
        detectedShape: null,
        expectedShape,
      };
    }

    if (!expectedShape) {
      return {
        valid: true,
        warning: false,
        message: "⏳ Ready to upload tensor file",
        detectedShape: null,
        expectedShape: null,
      };
    }

    const info = await getTensorFileInfo(file);

    if (info.error) {
      return {
        valid: false,
        warning: false,
        message: `❌ Cannot read tensor file: ${info.error}`,
        detectedShape: null,
        expectedShape,
      };
    }

    // Rough check: file size should correspond to number of elements
    if (info.estimatedElements) {
      const expectedElements = expectedShape.reduce((a, b) => a * b, 1);
      const sizeTolerance = expectedElements * 0.5; // ±50% tolerance

      if (Math.abs(info.estimatedElements - expectedElements) <= sizeTolerance) {
        return {
          valid: true,
          warning: true,
          message: `⚠️ Tensor file size suggests ${info.estimatedShape}. Server will validate exact shape.`,
          detectedShape: info.estimatedElements > 0 ? [info.estimatedElements] : null,
          expectedShape,
        };
      } else {
        return {
          valid: false,
          warning: false,
          message: `❌ Tensor file size seems wrong. Expected ~${expectedElements} elements, got ~${info.estimatedElements}`,
          detectedShape: info.estimatedElements > 0 ? [info.estimatedElements] : null,
          expectedShape,
        };
      }
    }

    return {
      valid: true,
      warning: true,
      message: "⚠️ Cannot estimate tensor shape from file size. Server will validate.",
      detectedShape: null,
      expectedShape,
    };
  };

  return useMemo(
    () => ({
      validateImage,
      validateText,
      validateTensor,
    }),
    []
  );
}
