import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowRight, Database, ListFilter, RefreshCw, Route, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { usePolling } from '../hooks/usePolling';
import { api } from '../lib/api';
import { Badge, Button, Card, EmptyState, SearchInput, Skeleton } from '../components/ui';
import { cn } from '../lib/cn';
import { formatDate } from '../lib/format';
import type { Rule, RuleProvider } from '../types';

const RULE_TONE: Record<string, 'accent' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  Domain: 'accent',
  DomainSuffix: 'accent',
  DomainKeyword: 'accent',
  DomainRegex: 'accent',
  GeoSite: 'info',
  GeoIP: 'info',
  IPCIDR: 'info',
  SrcIPCIDR: 'info',
  IPASN: 'info',
  Process: 'warning',
  ProcessPath: 'warning',
  RuleSet: 'neutral',
  Match: 'danger',
};

const RULE_LABEL: Record<string, string> = {
  Domain: 'DOMAIN',
  DomainSuffix: 'SUFFIX',
  DomainKeyword: 'KEYWORD',
  DomainRegex: 'REGEX',
  GeoSite: 'GEOSITE',
  GeoIP: 'GEOIP',
  IPCIDR: 'IP-CIDR',
  SrcIPCIDR: 'SRC-IP',
  IPASN: 'IP-ASN',
  Process: 'PROCESS',
  ProcessPath: 'PROC-PATH',
  RuleSet: 'RULE-SET',
  Match: 'MATCH',
};

export function RulesPage() {
  const { status } = useApp();
  const { toast } = useToast();
  const rules = usePolling<{ rules: Rule[] }>(() => api.get('rules'), 0);
  const ruleProviders = usePolling<{ providers: RuleProvider[] }>(() => api.get('rule-providers'), 0);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [limit, setLimit] = useState(300);
  const [providerBusy, setProviderBusy] = useState<string | null>(null);

  const items = rules.data?.rules ?? [];
  const filtered = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((rule) => (
      rule.type.toLowerCase().includes(needle)
      || rule.payload.toLowerCase().includes(needle)
      || rule.proxy.toLowerCase().includes(needle)
    ));
  }, [items, deferred]);
  const visible = filtered.slice(0, limit);
  const hits = items.reduce((total, rule) => total + (rule.extra?.hitCount ?? 0), 0);
  const running = status?.core.state === 'running';
  const providers = ruleProviders.data?.providers ?? [];

  const updateProvider = async (name: string) => {
    setProviderBusy(name);
    try {
      await api.post('rule-providers/update', { name }, { timeoutMs: 90000 });
      await Promise.all([ruleProviders.refresh(), rules.refresh()]);
      toast('规则集已更新', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '更新规则集失败', 'error');
    } finally {
      setProviderBusy(null);
    }
  };

  const updateAllProviders = async () => {
    setProviderBusy('__all__');
    try {
      await api.post('rule-providers/update-all', undefined, { timeoutMs: 300000 });
      await Promise.all([ruleProviders.refresh(), rules.refresh()]);
      toast('全部规则集已更新', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '更新规则集失败', 'error');
    } finally {
      setProviderBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={query} onChange={setQuery} placeholder="搜索规则类型、内容或代理" className="w-full sm:w-[340px]" />
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-muted md:inline">{items.length} 条规则 · 命中 {hits}</span>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={rules.refreshing} onClick={() => { void rules.refresh(); }}>刷新</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="!p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted">规则总数</div><div className="mt-1.5 text-xl font-semibold text-ink tabular">{items.length}</div></Card>
        <Card className="!p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted">筛选结果</div><div className="mt-1.5 text-xl font-semibold text-ink tabular">{filtered.length}</div></Card>
        <Card className="!p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted">命中次数</div><div className="mt-1.5 text-xl font-semibold text-ink tabular">{hits}</div></Card>
        <Card className="!p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted">最终规则</div><div className="mt-1.5 text-xl font-semibold text-ink">{items.some((rule) => rule.type === 'Match') ? 'MATCH' : '默认'}</div></Card>
      </div>

      {!running ? (
        <div className="rounded-xl border border-danger/15 bg-danger/6 px-4 py-3 text-xs text-danger">mihomo 当前未运行，规则列表不可用。</div>
      ) : null}

      <Card padded={false} className="overflow-hidden">
        {rules.loading && !rules.data ? (
          <div className="space-y-2 p-4">{[1, 2, 3, 4, 5, 6].map((key) => <Skeleton key={key} className="h-10" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={query ? <SearchX className="h-5 w-5" /> : <Route className="h-5 w-5" />}
            title={query ? '没有匹配的规则' : '当前配置没有规则'}
            description={query ? `没有找到包含 “${query}” 的规则。` : '启用包含规则的配置后，这里会显示分流顺序。'}
            action={query ? <Button variant="secondary" size="sm" onClick={() => setQuery('')}>清除搜索</Button> : undefined}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line/8 text-[10px] uppercase tracking-[0.14em] text-muted/70">
                    <th className="w-14 px-4 py-2.5 font-medium">#</th>
                    <th className="w-32 px-3 py-2.5 font-medium">类型</th>
                    <th className="px-3 py-2.5 font-medium">匹配内容</th>
                    <th className="w-56 px-3 py-2.5 font-medium">出站</th>
                    <th className="w-24 px-3 py-2.5 text-right font-medium">命中</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((rule) => (
                    <tr key={rule.index} className="border-b border-line/5 transition hover:bg-surface2/40">
                      <td className="px-4 py-2.5 mono text-[10px] text-muted/50">{String(rule.index + 1).padStart(3, '0')}</td>
                      <td className="px-3 py-2.5"><Badge tone={RULE_TONE[rule.type] ?? 'neutral'}>{RULE_LABEL[rule.type] ?? rule.type.toUpperCase()}</Badge></td>
                      <td className="max-w-[360px] px-3 py-2.5"><span className="mono block truncate text-[11px] text-ink/85" title={rule.payload}>{rule.payload || '—'}</span></td>
                      <td className="px-3 py-2.5"><span className="flex items-center gap-1.5 text-[11px] text-muted"><ArrowRight className="h-3 w-3 text-muted/40" /><span className="truncate text-ink/80">{rule.proxy}</span></span></td>
                      <td className="px-3 py-2.5 text-right mono text-[11px] text-muted tabular">{rule.extra?.hitCount ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-line/5 md:hidden">
              {visible.map((rule) => (
                <div key={rule.index} className="flex items-start gap-2.5 px-4 py-3">
                  <span className="mono w-8 shrink-0 pt-0.5 text-[10px] text-muted/50">{String(rule.index + 1).padStart(3, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={RULE_TONE[rule.type] ?? 'neutral'}>{RULE_LABEL[rule.type] ?? rule.type}</Badge>
                      <span className="mono truncate text-[11px] text-ink/80">{rule.payload || '—'}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted"><span>出站</span><ArrowRight className="h-2.5 w-2.5" /><span className="truncate text-ink/70">{rule.proxy}</span></div>
                  </div>
                  <span className="shrink-0 mono text-[10px] text-muted/50">{rule.extra?.hitCount ?? 0}</span>
                </div>
              ))}
            </div>
            {filtered.length > visible.length ? (
              <div className="border-t border-line/8 p-3 text-center"><Button variant="secondary" size="sm" onClick={() => setLimit((value) => value + 300)}>显示更多（剩余 {filtered.length - visible.length}）</Button></div>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Database className="h-4 w-4 text-accent" />规则集</h3>
            <p className="mt-0.5 text-[12px] text-muted">RULE-SET 引用的远程规则文件</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">{providers.length} 个规则集</span>
            <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={providerBusy === '__all__'} disabled={!running || providers.length === 0} onClick={() => { void updateAllProviders(); }}>全部更新</Button>
          </div>
        </div>
        {providers.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line/10 px-4 py-6 text-center text-[12px] text-muted">当前配置没有规则集</p>
        ) : (
          <div className="mt-3 divide-y divide-line/5">
            {providers.map((provider) => (
              <div key={provider.name} className="flex items-center gap-3 py-2.5">
                <Badge tone="neutral">{provider.behavior || provider.type}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-ink">{provider.name}</div>
                  <div className="mt-0.5 text-[10px] text-muted/60">{provider.ruleCount} 条 · {provider.updatedAt ? formatDate(provider.updatedAt) : '未更新'}</div>
                </div>
                <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3 w-3" />} loading={providerBusy === provider.name} disabled={!running || Boolean(providerBusy)} onClick={() => { void updateProvider(provider.name); }}>更新</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between px-1 text-[11px] text-muted/50">
        <span className="flex items-center gap-1.5"><ListFilter className="h-3 w-3" /> 规则按配置文件顺序从上到下匹配</span>
        <Link to="/proxies" className={cn('flex items-center gap-1 hover:text-accent', !running && 'pointer-events-none opacity-40')}>前往代理 <ArrowRight className="h-3 w-3" /></Link>
      </div>
    </div>
  );
}
