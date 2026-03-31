"use client";

import { useRef, useState } from "react";

const WAIT_VIDEOS = [
  "/videos/clip-1.mp4",
  "/videos/clip-2.mp4",
  "/videos/clip-3.mp4",
  "/videos/clip-4.mp4",
  "/videos/clip-5.mp4",
  "/videos/clip-6.mp4",
  "/videos/intro/INTRO_funny_useit.mp4",
];

interface VideoWaitProps {
  message: string;
  submessage?: string;
}

export default function VideoWait({ message, submessage }: VideoWaitProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [clip] = useState(
    () => WAIT_VIDEOS[Math.floor(Math.random() * WAIT_VIDEOS.length)]
  );

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="relative rounded-xl overflow-hidden shadow-2xl max-w-md w-full">
        <video
          ref={videoRef}
          src={clip}
          autoPlay
          loop
          muted
          playsInline
          className="w-full"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <p className="text-white text-center font-bold animate-pulse">
            {message}
          </p>
          {submessage && (
            <p className="text-gray-300 text-center text-sm mt-1">
              {submessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
