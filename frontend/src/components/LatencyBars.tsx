export function LatencyBars({ values, rounds = 10 }: { values: number[]; rounds?: number }) {
  const data = values.slice(-rounds);
  const max = Math.max(...data.filter((value) => value > 0), 1);
  return (
    <div className="flex h-4 w-[68px] items-end gap-[2px]" aria-label="延迟历史">
      {Array.from({ length: rounds }, (_, index) => {
        const value = data[index];
        const empty = value === undefined;
        const failed = value === 0;
        const height = empty ? 18 : failed ? 100 : Math.max(18, Math.round((value / max) * 100));
        const color = empty
          ? 'bg-line/15'
          : failed
            ? 'bg-danger/50'
            : value < 400
              ? 'bg-success'
              : value < 800
                ? 'bg-warning'
                : 'bg-danger';
        return (
          <span
            key={index}
            className={`min-w-0 flex-1 rounded-[1px] ${color}`}
            style={{ height: `${height}%` }}
            title={empty ? '暂无数据' : failed ? '测速失败' : `${value}ms`}
          />
        );
      })}
    </div>
  );
}
