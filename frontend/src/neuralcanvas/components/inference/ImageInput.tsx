import { useState, useCallback } from "react";
import { ImageIcon, AlertCircle, CheckCircle2 } from "lucide-react";
import { processImageFile, formatFileSize, detectImageFormat } from "@/neuralcanvas/utils/imageProcessor";

interface ImageInputProps {
  expectedShape: number[] | null;
  expectedShapeArray?: number[] | null; // Full shape like [C, H, W] or [H, W] from the model's Input node
  onImageProcessed: (imageData: number[], shape: [number, number, number]) => void;
  onFileSelected?: (file: File) => void;
  onError: (error: string) => void;
}

export function ImageInput({ expectedShape, expectedShapeArray, onImageProcessed, onFileSelected, onError }: ImageInputProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [shape, setShape] = useState<[number, number, number] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [overrideW, setOverrideW] = useState<number | null>(null);
  const [overrideH, setOverrideH] = useState<number | null>(null);

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setProcessing(true);
      setValidationMessage(null);

      try {
        // Auto-derive target dimensions from the model's expected shape
        // Shape is typically [C, H, W] (PyTorch convention) or [H, W]
        let targetW = overrideW || undefined;
        let targetH = overrideH || undefined;
        let targetC: number | undefined;

        if (!targetW && !targetH && expectedShapeArray) {
          if (expectedShapeArray.length === 3) {
            // [C, H, W]
            targetC = expectedShapeArray[0];
            targetH = expectedShapeArray[1];
            targetW = expectedShapeArray[2];
          } else if (expectedShapeArray.length === 2) {
            // [H, W]
            targetH = expectedShapeArray[0];
            targetW = expectedShapeArray[1];
          }
        }

        const result = await processImageFile(selectedFile, targetW, targetH, targetC);

        if (result.error) {
          setValidationMessage(`❌ ${result.error}`);
          setIsValid(false);
          onError(result.error);
          return;
        }

        setPreview(result.preview);
        setShape(result.detectedShape);

        // Validate shape
        if (expectedShape) {
          const expectedTotal = expectedShape[0];
          const actualTotal = result.detectedShape[0] * result.detectedShape[1] * result.detectedShape[2];
          const tolerance = expectedTotal * 0.1;

          if (actualTotal === expectedTotal) {
            setValidationMessage(`✓ Shape matches: ${actualTotal} features`);
            setIsValid(true);
          } else if (Math.abs(actualTotal - expectedTotal) <= tolerance) {
            setValidationMessage(
              `⚠️ Image ${result.detectedShape[1]}×${result.detectedShape[0]} will be resized to match ${expectedTotal} features`
            );
            setIsValid(true);
          } else {
            setValidationMessage(
              `❌ Image has ${actualTotal} features, expected ${expectedTotal}. Try ${Math.round(Math.sqrt(expectedTotal))}×${Math.round(Math.sqrt(expectedTotal))} pixels`
            );
            setIsValid(false);
          }
        } else {
          setValidationMessage(`Detected: ${result.detectedShape[1]}×${result.detectedShape[0]}×${result.detectedShape[2]}px`);
          setIsValid(true);
        }

        onImageProcessed(result.normalized, result.detectedShape);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        setValidationMessage(`❌ ${errMsg}`);
        setIsValid(false);
        onError(errMsg);
      } finally {
        setProcessing(false);
      }
    },
    [expectedShape, expectedShapeArray, onImageProcessed, onError, overrideW, overrideH]
  );

  const handleResize = useCallback(
    async (width: number | null, height: number | null) => {
      setOverrideW(width);
      setOverrideH(height);
      if (file) {
        await handleFileSelect(file);
      }
    },
    [file, handleFileSelect]
  );

  return (
    <div className="space-y-3">
      {/* File Input */}
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-6 text-center hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
          className="hidden"
          id="image-upload"
        />
        <label htmlFor="image-upload" className="cursor-pointer">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 text-[var(--foreground-muted)]" />
          <div className="text-sm font-medium text-[var(--foreground)]">Click to upload image</div>
          <div className="text-[11px] text-[var(--foreground-muted)]">PNG, JPG, GIF, WebP</div>
        </label>
      </div>

      {/* Preview and Info */}
      {preview && shape && (
        <div className="rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] p-3 space-y-2">
          <img src={preview} alt="Preview" className="w-full rounded-lg max-h-32 object-cover" />
          <div className="text-[11px] text-[var(--foreground-muted)] space-y-1">
            <div>Detected: {shape[1]}×{shape[0]} ({detectImageFormat(file?.name || "")})</div>
            <div>Size: {file ? formatFileSize(file.size) : "?"}</div>
            <div>Total features: {shape[0] * shape[1] * shape[2]}</div>
          </div>
        </div>
      )}

      {/* Override Controls */}
      {file && (
        <div className="rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] p-3 space-y-2">
          <div className="text-[11px] font-medium text-[var(--foreground-secondary)]">Optional: Override dimensions</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder="Width"
              min="1"
              value={overrideW || ""}
              onChange={(e) => handleResize(e.target.value ? parseInt(e.target.value) : null, overrideH)}
              className="px-2 py-1 rounded text-[11px] bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)]"
            />
            <input
              type="number"
              placeholder="Height"
              min="1"
              value={overrideH || ""}
              onChange={(e) => handleResize(overrideW, e.target.value ? parseInt(e.target.value) : null)}
              className="px-2 py-1 rounded text-[11px] bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)]"
            />
          </div>
        </div>
      )}

      {/* Validation Message */}
      {validationMessage && (
        <div
          className={`rounded-xl border p-2 text-[11px] flex items-start gap-2 ${
            isValid === true ? "bg-[var(--success-muted)] border-[var(--success)]/30 text-[var(--success)]"
            : isValid === false ? "bg-[var(--danger-muted)] border-[var(--danger)]/30 text-[var(--danger)]"
            : "bg-[var(--warning-muted)] border-[var(--warning)]/30 text-[var(--warning)]"
          }`}
        >
          {isValid === true ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{validationMessage}</span>
        </div>
      )}

      {/* Expected Shape Info */}
      {expectedShape && (
        <div className="text-[11px] text-[var(--foreground-muted)]">Expected: {expectedShape[0]} features per image</div>
      )}
    </div>
  );
}
