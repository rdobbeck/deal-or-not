"use client";

import { useState, useEffect } from "react";

interface BankerMessageBubbleProps {
  message: string | null;
}

export default function BankerMessageBubble({ message }: BankerMessageBubbleProps) {
  const [displayedText, setDisplayedText] = useState("");

  // Reset typewriter when message changes
  useEffect(() => {
    if (message) setDisplayedText("");
  }, [message]);

  // Typewriter effect
  useEffect(() => {
    if (!message) return;
    if (displayedText === message) return;

    const timer = setTimeout(() => {
      setDisplayedText(message.slice(0, displayedText.length + 1));
    }, 30);

    return () => clearTimeout(timer);
  }, [message, displayedText]);

  // No message yet — show rickroll placeholder
  if (!message) {
    return (
      <div className="bg-gray-900/95 border-2 border-amber-500/60 rounded-2xl p-6 max-w-lg mx-auto text-center shadow-2xl shadow-amber-500/10">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
          <span className="text-amber-400 text-sm uppercase tracking-[0.25em] font-bold">
            The Banker
          </span>
          <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
        </div>
        <div className="aspect-video rounded-xl overflow-hidden mb-4 border border-gray-700/50">
          <iframe
            width="100%"
            height="100%"
            src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&loop=1&playlist=dQw4w9WgXcQ"
            allow="autoplay; encrypted-media"
            allowFullScreen
            className="rounded-xl"
          />
        </div>
        <p className="text-amber-500/70 text-sm animate-pulse">
          The Banker is composing a message...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/95 border-2 border-amber-500 rounded-2xl p-8 max-w-lg mx-auto shadow-2xl shadow-amber-500/20">
      <div className="flex items-center justify-center gap-3 mb-5">
        <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
        <span className="text-amber-400 text-sm uppercase tracking-[0.25em] font-bold">
          The Banker Says
        </span>
        <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
      </div>
      <p className="text-white text-2xl leading-relaxed text-center font-semibold">
        &ldquo;{displayedText}
        {displayedText !== message && (
          <span className="animate-pulse text-amber-400">|</span>
        )}
        {displayedText === message && "&rdquo;"}
      </p>
    </div>
  );
}
