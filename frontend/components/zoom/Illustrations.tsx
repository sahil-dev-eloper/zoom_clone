'use client';

import React from 'react';

/**
 * Authentic Zoom Workplace Empty State Illustration:
 * A tilted beach parasol over a relaxing lounge chair with soft pastel tones.
 */
export function ParasolEmptyStateIllustration({ className = '' }: { className?: string }) {
  return (
    <svg
      width="140"
      height="100"
      viewBox="0 0 140 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="No meetings scheduled"
    >
      {/* Ground oval shadow */}
      <ellipse
        cx="72"
        cy="86"
        rx="46"
        ry="7"
        fill="#EEF2FF"
      />
      <ellipse
        cx="74"
        cy="86"
        rx="28"
        ry="4"
        fill="#E0E7FF"
      />

      {/* Umbrella Pole */}
      <line
        x1="66"
        y1="34"
        x2="69"
        y2="83"
        stroke="#94A3B8"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Beach Lounge Chair */}
      {/* Back legs & frame */}
      <path
        d="M62 82 L72 68 L88 78 L99 82"
        stroke="#C7D2FE"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Fabric seat/mat */}
      <path
        d="M63 78 C70 70 76 68 84 73 L104 80"
        stroke="#818CF8"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Chair Pillow */}
      <rect
        x="63"
        y="70"
        width="11"
        height="6"
        rx="3"
        transform="rotate(-30 63 70)"
        fill="#6366F1"
      />

      {/* Umbrella Canopy */}
      {/* Left panel (darker lavender/blue) */}
      <path
        d="M68 20 L38 38 C43 36 50 36 56 38 Z"
        fill="#A5B4FC"
      />
      {/* Center panel (mid tone) */}
      <path
        d="M68 20 L56 38 C63 36 71 36 78 38 Z"
        fill="#C7D2FE"
      />
      {/* Right panel (lighter tone) */}
      <path
        d="M68 20 L78 38 C84 36 92 36 98 38 Z"
        fill="#E0E7FF"
      />
      {/* Umbrella top cap */}
      <path
        d="M66 18 C66 16.5 70 16.5 70 18 L68 21 Z"
        fill="#6366F1"
      />

      {/* Umbrella underside ribs */}
      <line
        x1="68"
        y1="22"
        x2="56"
        y2="38"
        stroke="#818CF8"
        strokeWidth="1.2"
        strokeOpacity="0.6"
      />
      <line
        x1="68"
        y1="22"
        x2="78"
        y2="38"
        stroke="#818CF8"
        strokeWidth="1.2"
        strokeOpacity="0.6"
      />
    </svg>
  );
}

/**
 * Authentic Zoom Workplace Empty Chat State:
 * Overlapping speech bubbles graphic (sky blue front bubble with 3 white dots,
 * pale pastel blue circle bubble behind).
 */
export function ChatBubblesIllustration({ className = '' }: { className?: string }) {
  return (
    <svg
      width="150"
      height="130"
      viewBox="0 0 150 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Start chatting illustration"
    >
      {/* Background Soft Pale Blue Bubble */}
      <circle
        cx="60"
        cy="66"
        r="44"
        fill="#E0F2FE"
      />

      {/* Foreground Vibrant Sky Blue Speech Bubble */}
      <g filter="url(#bubbleShadow)">
        <path
          d="M94 28 C67 28 46 47 46 70 C46 78 49 85 54 91 C53 97 51 104 47 108 C54 108 61 104 66 100 C74 103 84 105 94 105 C121 105 142 86 142 63 C142 40 121 28 94 28 Z"
          fill="#60A5FA"
        />
        {/* Three white speech dots */}
        <circle cx="78" cy="66" r="5" fill="#FFFFFF" />
        <circle cx="94" cy="66" r="5" fill="#FFFFFF" />
        <circle cx="110" cy="66" r="5" fill="#FFFFFF" />
      </g>

      <defs>
        <filter id="bubbleShadow" x="40" y="24" width="108" height="92" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#3B82F6" floodOpacity="0.15" />
        </filter>
      </defs>
    </svg>
  );
}
