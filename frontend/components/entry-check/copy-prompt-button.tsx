"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { copyText } from "@/lib/copy";

/**
 * Copies an AI-coach prompt to the clipboard. When the clipboard is blocked
 * (permissions, unfocused document), falls back to a modal with the full
 * prompt selected for manual copying — the button is never a silent no-op.
 */
export function CopyPromptButton({
  buildPrompt,
  iconOnly,
}: {
  /** Returns the prompt text, or null when there is nothing to copy yet. */
  buildPrompt: () => string | null;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const [fallbackText, setFallbackText] = React.useState<string | null>(null);

  const flash = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onClick = async () => {
    const prompt = buildPrompt();
    if (!prompt) return;
    if (await copyText(prompt)) flash();
    else setFallbackText(prompt);
  };

  return (
    <>
      {iconOnly ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          title="Copy AI coach prompt"
          onClick={onClick}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-positive" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <Button size="sm" variant="outline" onClick={onClick}>
          {copied ? (
            <Check className="mr-1.5 h-3.5 w-3.5 text-positive" />
          ) : (
            <Copy className="mr-1.5 h-3.5 w-3.5" />
          )}
          {copied ? "Copied!" : "Copy AI prompt"}
        </Button>
      )}

      <Modal
        open={fallbackText != null}
        onClose={() => setFallbackText(null)}
        title="AI coach prompt"
        description="Clipboard access was blocked — select and copy the prompt manually."
        footer={
          <Button
            size="sm"
            onClick={async () => {
              if (fallbackText && (await copyText(fallbackText))) {
                setFallbackText(null);
                flash();
              }
            }}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy
          </Button>
        }
      >
        <textarea
          readOnly
          value={fallbackText ?? ""}
          rows={16}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-border bg-background p-2 font-mono text-[11px] leading-relaxed outline-none focus:ring-1 focus:ring-ring"
        />
      </Modal>
    </>
  );
}
