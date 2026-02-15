import { useState, useCallback } from "react";
import { Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { getTensorFileInfo, formatFileSize } from "@/neuralcanvas/utils/tensorPreview";

interface TensorInputProps {
  expectedShape: number[] | null;
  onFileSelected: (file: File) => void;
  onError: (error: string) => void;
}

export function TensorInput({ expectedShape, onFileSelected, onError }: TensorInputProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [fileInfo, setFileInfo] = useState<{ size: string; estimatedShape: string } | null>(null);

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      // Validate extension
      if (!selectedFile.name.endsWith(".pt") && !selectedFile.name.endsWith(".pth")) {
        setValidationMessage(`❌ File must be .pt or .pth (got .${selectedFile.name.split(".").pop()})`);
        setIsValid(false);
        onError("Only .pt and .pth files are supported");
        return;
      }

      setFile(selectedFile);

      // Get file info
      const info = await getTensorFileInfo(selectedFile);
      setFileInfo({ size: info.size, estimatedShape: info.estimatedShape });

      if (info.error) {
        setValidationMessage(`❌ ${info.error}`);
        setIsValid(false);
        onError(info.error);
        return;
      }

      // Rough validation
      if (expectedShape && info.estimatedElements) {
        const expectedElements = expectedShape.reduce((a, b) => a * b, 1);
        const tolerance = expectedElements * 0.5;

        if (Math.abs(info.estimatedElements - expectedElements) <= tolerance) {
          setValidationMessage(`⚠️ File size suggests ${info.estimatedShape} (server will validate)`);
          setIsValid(true);
        } else {
          setValidationMessage(
            `❌ File size mismatch: expected ~${expectedElements} elements, got ~${info.estimatedElements}`
          );
          setIsValid(false);
        }
      } else {
        setValidationMessage(
          expectedShape
            ? `⚠️ Cannot estimate from file size. Server will validate against ${expectedShape}`
            : "✓ Ready to upload"
        );
        setIsValid(true);
      }

      onFileSelected(selectedFile);
    },
    [expectedShape, onFileSelected, onError]
  );

  return (
    <div className="space-y-3">
      {/* Drag and Drop / File Input */}
      <div
        className="rounded-xl border-2 border-dashed border-[var(--border)] p-6 text-center hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("bg-[var(--surface-hover)]");
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove("bg-[var(--surface-hover)]");
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("bg-[var(--surface-hover)]");
          const f = e.dataTransfer.files[0];
          if (f) handleFileSelect(f);
        }}
      >
        <input
          type="file"
          accept=".pt,.pth"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
          className="hidden"
          id="tensor-upload"
        />
        <label htmlFor="tensor-upload" className="cursor-pointer">
          <Upload className="h-8 w-8 mx-auto mb-2 text-[var(--foreground-muted)]" />
          <div className="text-sm font-medium text-[var(--foreground)]">Click to upload tensor file</div>
          <div className="text-[11px] text-[var(--foreground-muted)]">or drag and drop .pt / .pth file</div>
        </label>
      </div>

      {/* File Info */}
      {file && fileInfo && (
        <div className="rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] p-3 space-y-2">
          <div className="text-[11px] font-medium text-[var(--foreground)]">File: {file.name}</div>
          <div className="text-[11px] text-[var(--foreground-muted)] space-y-1">
            <div>Size: {fileInfo.size}</div>
            <div>Estimated shape: {fileInfo.estimatedShape}</div>
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

      {/* Info Box */}
      <div className="rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] p-2.5 text-[11px] text-[var(--foreground-muted)] space-y-1">
        <div>• Supports PyTorch tensor files (.pt, .pth)</div>
        <div>• Saved with torch.save(tensor, file)</div>
        <div>• File size estimation may not be exact</div>
      </div>

      {/* Expected Shape Info */}
      {expectedShape && (
        <div className="text-[11px] text-[var(--foreground-muted)]">Expected: {JSON.stringify(expectedShape)}</div>
      )}
    </div>
  );
}
