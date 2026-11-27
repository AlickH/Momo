export function Sparkline({ values, color, height = 46 }: { values: number[]; color: string; height?: number }) {
  const width = 240;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - (value / max) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.length ? `M${points.join(' L')}` : '';
  const area = points.length ? `${line} L${width},${height} L0,${height} Z` : '';
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {area ? <path d={area} fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, '')})`} /> : null}
      {line ? <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}
