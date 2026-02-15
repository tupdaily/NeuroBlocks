/**
 * Image processing utility for inference input
 * Handles reading, resizing, and normalizing images without external dependencies
 */

export interface ImageProcessResult {
  preview: string; // Data URL for thumbnail
  detectedShape: [number, number, number]; // [height, width, channels]
  normalized: number[]; // Flattened [0, 1] normalized pixels
  error: string | null;
}

/**
 * Load and process an image file
 */
export async function processImageFile(
  file: File,
  overrideWidth?: number,
  overrideHeight?: number,
  overrideChannels?: number
): Promise<ImageProcessResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            // Detect dimensions
            let width = img.width;
            let height = img.height;
            let channels = 3; // Default to RGB

            // Check if grayscale by rendering
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");

            if (!ctx) {
              resolve({
                preview: "",
                detectedShape: [0, 0, 0],
                normalized: [],
                error: "Canvas context not available",
              });
              return;
            }

            ctx.drawImage(img, 0, 0);

            // Get preview (small size)
            const canvas2 = document.createElement("canvas");
            canvas2.width = 64;
            canvas2.height = 64;
            const ctx2 = canvas2.getContext("2d");
            if (ctx2) {
              ctx2.drawImage(img, 0, 0, 64, 64);
            }
            const previewUrl = canvas2.toDataURL("image/jpeg", 0.8);

            // Apply overrides
            if (overrideWidth || overrideHeight) {
              width = overrideWidth || width;
              height = overrideHeight || height;
            }

            if (overrideChannels) {
              channels = overrideChannels;
            }

            // Draw to canvas with target dimensions
            const targetCanvas = document.createElement("canvas");
            targetCanvas.width = width;
            targetCanvas.height = height;
            const targetCtx = targetCanvas.getContext("2d");

            if (!targetCtx) {
              resolve({
                preview: previewUrl,
                detectedShape: [height, width, channels],
                normalized: [],
                error: "Cannot get canvas context for processing",
              });
              return;
            }

            targetCtx.drawImage(img, 0, 0, width, height);

            // Get pixel data
            const imageData = targetCtx.getImageData(0, 0, width, height);
            const data = imageData.data;

            // Normalize pixels to [0, 1]
            const normalized: number[] = [];

            if (channels === 1) {
              // Grayscale: convert RGB to single-channel by averaging
              for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const gray = (r + g + b) / 3 / 255; // Normalize to [0, 1]
                normalized.push(gray);
              }
            } else {
              // RGB: take R,G,B channels
              for (let i = 0; i < data.length; i += 4) {
                normalized.push(data[i] / 255); // R
                normalized.push(data[i + 1] / 255); // G
                normalized.push(data[i + 2] / 255); // B
              }
            }

            resolve({
              preview: previewUrl,
              detectedShape: [height, width, channels],
              normalized,
              error: null,
            });
          } catch (err) {
            resolve({
              preview: "",
              detectedShape: [0, 0, 0],
              normalized: [],
              error: err instanceof Error ? err.message : "Unknown error processing image",
            });
          }
        };

        img.onerror = () => {
          resolve({
            preview: "",
            detectedShape: [0, 0, 0],
            normalized: [],
            error: "Failed to load image",
          });
        };

        img.src = e.target?.result as string;
      } catch (err) {
        resolve({
          preview: "",
          detectedShape: [0, 0, 0],
          normalized: [],
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    };

    reader.onerror = () => {
      resolve({
        preview: "",
        detectedShape: [0, 0, 0],
        normalized: [],
        error: "Failed to read file",
      });
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Detect image format from file
 */
export function detectImageFormat(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg"].includes(ext)) return "JPEG";
  if (ext === "png") return "PNG";
  if (ext === "gif") return "GIF";
  if (ext === "webp") return "WebP";
  return "Unknown";
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 bytes";
  const k = 1024;
  const sizes = ["bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
