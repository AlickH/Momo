import { useId } from 'react';
import { cn } from '../lib/cn';

export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`g-${id}`} x1="4" y1="4" x2="62" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60b5ff" />
          <stop offset="0.55" stopColor="#2f8cff" />
          <stop offset="1" stopColor="#1677ff" />
        </linearGradient>
        <linearGradient id={`s-${id}`} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="16" fill={`url(#g-${id})`} />
      <rect x="1" y="1" width="62" height="62" rx="16" fill={`url(#s-${id})`} />
      <path
        d="M17 45V22.8c0-1.9 2.4-2.7 3.6-1.1L32 36.4l11.4-14.7c1.2-1.6 3.6-.8 3.6 1.1V45"
        fill="none"
        stroke="#f8fbff"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="46" r="2.9" fill="#f8fbff" />
      <circle cx="47" cy="46" r="2.9" fill="#f8fbff" />
      <circle cx="32" cy="38" r="2.1" fill="#ffffff" fillOpacity="0.65" />
    </svg>
  );
}
