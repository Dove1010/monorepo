"use client";

import { useState } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { generateShareToken } from "@/lib/ratingCardApi";

interface ShareCardModalProps {
  tenantId: string;
  className?: string;
}

export default function ShareCardModal({
  tenantId,
  className = "",
}: ShareCardModalProps) {
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleShare = async () => {
    setIsGenerating(true);
    try {
      const result = await generateShareToken(tenantId);
      const link = `${window.location.origin}/rating-card/${result.data.token}`;
      setShareLink(link);
    } catch {
      console.error("Failed to generate share token");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (shareLink) {
      await navigator.clipboard.writeText(shareLink);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <Card className={`border-3 border-foreground p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold">Share Your Rating Card</h3>
          <p className="text-sm text-muted-foreground">
            Generate a shareable link for prospective landlords
          </p>
        </div>
        <Button
          onClick={handleShare}
          disabled={isGenerating}
          className="border-3 border-foreground bg-primary font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
        >
          <Share2 className="mr-2 h-4 w-4" />
          {isGenerating ? "Generating..." : "Generate Link"}
        </Button>
      </div>

      {shareLink && (
        <div className="mt-4 flex items-center gap-2 border-3 border-foreground bg-muted p-3">
          <input
            type="text"
            value={shareLink}
            readOnly
            className="flex-1 bg-transparent text-sm font-mono outline-none"
            aria-label="Shareable rating card link"
          />
          <Button
            size="sm"
            onClick={handleCopy}
            className="border-2 border-foreground bg-background font-bold"
            aria-label={isCopied ? "Link copied" : "Copy link to clipboard"}
          >
            {isCopied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Share links expire after 48 hours. Generate a new one as needed.
      </p>
    </Card>
  );
}
