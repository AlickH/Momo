import { useId } from 'react';
import { cn } from '../lib/cn';

export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#69b1ff" />
          <stop offset="0.55" stopColor="#4096ff" />
          <stop offset="1" stopColor="#1677ff" />
        </linearGradient>
        <linearGradient id={`s-${id}`} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill="#0b0b0b" />
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#g-${id})`} />
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#s-${id})`} />
      <path
        d="M17 45V22.8c0-1.9 2.4-2.7 3.6-1.1L32 36.4l11.4-14.7c1.2-1.6 3.6-.8 3.6 1.1V45"
        fill="none"
        stroke="#0b0b0b"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="47" r="3.2" fill="#0b0b0b" />
      <circle cx="47" cy="47" r="3.2" fill="#0b0b0b" />
      <circle cx="32" cy="38" r="2.4" fill="#0b0b0b" fillOpacity="0.5" />
    </svg>
  );
}
