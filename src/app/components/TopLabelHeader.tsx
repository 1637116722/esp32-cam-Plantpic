import React from "react";
import { ArrowLeft } from "lucide-react";

interface TopLabelHeaderProps {
  title: string;
  onBack?: () => void;
}

export default function TopLabelHeader({ title, onBack }: TopLabelHeaderProps) {
  return (
    <div className="w-full px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4">
      <div className="relative flex items-center justify-center">
        {onBack ? (
          <button
            onClick={onBack}
            className="absolute left-0 p-2 rounded-full transition-colors hover:bg-foreground/10"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        ) : null}
        <div className="text-lg tracking-wide text-foreground" style={{ fontWeight: 600 }}>
          {title}
        </div>
      </div>
    </div>
  );
}
