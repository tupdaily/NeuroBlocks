/**
 * Tensor file preview utility
 * Estimates tensor properties from file without loading (safe client-side)
 */

export interface TensorFileInfo {
  size: string; // "2.3 MB"
  estimatedShape: string; // "Approx [1, 784]" or "Unknown"
  estimatedElements: number | null;
  error: string | null;
}

/**
 * Get preliminary info about a tensor file
 * Estimates based on file size - not precise
 */
export async function getTensorFileInfo(file: File): Promise<TensorFileInfo> {
  try {
    const sizeInBytes = file.size;

    // PyTorch .pt files are pickled Python objects - hard to parse client-side
    // We can only estimate based on size
    // Typical float32 takes 4 bytes per element
    // But pickled format has overhead, roughly 2x-3x extra

    const estimatedElements = Math.floor(sizeInBytes / (4 * 2.5)); // Conservative estimate

    const sizeStr = formatFileSize(sizeInBytes);

    // Estimate shape assuming 2D tensor [batch, features] or [features]
    // This is very rough - just for user feedback
    let estimatedShape = "Unknown";

    if (estimatedElements > 0) {
      if (estimatedElements < 100) {
        estimatedShape = `Approx [${estimatedElements}]`;
      } else if (estimatedElements < 10000) {
        // Could be [N, M]
        const sqrtEstimate = Math.floor(Math.sqrt(estimatedElements));
        estimatedShape = `Approx [?, ${sqrtEstimate}]`;
      } else {
        // Could be [batch, large_features]
        estimatedShape = `Approx [?, ${estimatedElements}]`;
      }
    }

    return {
      size: sizeStr,
      estimatedShape,
      estimatedElements: estimatedElements > 0 ? estimatedElements : null,
      error: null,
    };
  } catch (err) {
    return {
      size: "Unknown",
      estimatedShape: "Unknown",
      estimatedElements: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Format bytes as human-readable size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 bytes";
  const k = 1024;
  const sizes = ["bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
