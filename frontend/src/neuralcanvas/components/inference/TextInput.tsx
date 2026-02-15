import { useState, useCallback } from "react";
import { MessageSquare, CheckCircle2, AlertCircle } from "lucide-react";

interface TextInputProps {
  expectedShape: number[] | null;
  onTextProvided: (text: string) => void;
  onError: (error: string) => void;
}

export function TextInput({ expectedShape, onTextProvided, onError }: TextInputProps) {
  const [text, setText] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  const handleTextChange = useCallback(
    (newText: string) => {
      setText(newText);

      if (!newText.trim()) {
        setValidationMessage(null);
        setIsValid(null);
        return;
      }

      // Text will be embedded to 1536 dimensions
      const embeddingDims = 1536;

      if (expectedShape) {
        if (expectedShape[0] === embeddingDims) {
          setValidationMessage(`✓ Text will be embedded to ${embeddingDims} dimensions`);
          setIsValid(true);
        } else {
          setValidationMessage(
            `❌ Model expects ${expectedShape[0]} features, but text embeddings produce ${embeddingDims}`
          );
          setIsValid(false);
          onError(`Shape mismatch: model expects ${expectedShape[0]} dims, embeddings provide ${embeddingDims}`);
        }
      } else {
        setValidationMessage(`Ready to embed (${newText.length} characters)`);
        setIsValid(true);
      }

      onTextProvided(newText);
    },
    [expectedShape, onTextProvided, onError]
  );

  return (
    <div className="space-y-3">
      {/* Icon */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-[var(--foreground-muted)]" />
        <span className="text-[11px] text-[var(--foreground-muted)]">Enter or paste text</span>
      </div>

      {/* Textarea */}
      <textarea
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="Enter your text here. It will be converted to embeddings..."
        rows={4}
        className="w-full px-3 py-2.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] focus:border-[var(--accent)] transition-all resize-none"
      />

      {/* Character Count */}
      <div className="text-[11px] text-[var(--foreground-muted)]">
        {text.length} characters{text.length > 0 ? ` • ${text.trim().split(/\s+/).length} words` : ""}
      </div>

      {/* Info Box */}
      <div className="rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] p-2.5 text-[11px] text-[var(--foreground-muted)] space-y-1">
        <div>• Text will be converted to OpenAI embeddings</div>
        <div>• Output: 1536-dimensional vector</div>
        <div>• Works best with 1-2 sentences</div>
      </div>

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
        <div className="text-[11px] text-[var(--foreground-muted)]">Expected: {expectedShape[0]} dimensions</div>
      )}
    </div>
  );
}
