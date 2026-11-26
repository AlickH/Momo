import { useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  CloudDownload,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileUp,
  Layers,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePolling } from '../hooks/usePolling';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { formatBytes, formatDate, formatExpiry, percent, timeAgo } from '../lib/format';
import { Badge, Button, Card, ConfirmDialog, CopyButton, EmptyState, Modal, ProgressBar, Skeleton } from '../components/ui';
import { cn } from '../lib/cn';
import type { Profile } from '../types';

type AddTab = 'url' | 'content';

function SourceBadge({ profile }: { profile: Profile }) {
  return profile.source === 'url'
    ? <Badge tone="info"><Link2 className="h-2.5 w-2.5" /> 订阅链接</Badge>
    : <Badge tone="neutral"><FileCode2 className="h-2.5 w-2.5" /> 本地配置</Badge>;
}

function SubscriptionMeter({ profile }: { profile: Profile }) {
  const info = profile.subscription;
  if (!info) return null;
  const used = info.upload + info.download;
  const pct = percent(used, info.total);
  const expiry = formatExpiry(info.expire);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted">已用 {formatBytes(used)}</span>
        <span className="text-muted">{info.total ? `共 ${formatBytes(info.total)}` : '流量未知'}</span>
      </div>
      <ProgressBar value={pct} tone={pct > 90 ? 'danger' : pct > 70 ? 'warning' : 'accent'} className="mt-1.5" />
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span className="text-muted/70">{info.total ? `${pct.toFixed(1)}%` : '—'}</span>
        <span className={cn(expiry.expired ? 'text-danger' : 'text-muted/70')}>{expiry.text}</span>
      </div>
    </div>
  );
}

export function ProfilesPage() {
  const { status, refreshStatus } = useApp();
  const { toast } = useToast();
  const profiles = usePolling<{ profiles: Profile[] }>(() => api.get('profiles'), 10000);
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<AddTab>('url');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [viewing, setViewing] = useState<Profile | null>(null);
  const [viewContent, setViewContent] = useState('');
  const [viewLoading, setViewLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = profiles.data?.profiles ?? [];
  const active = useMemo(() => items.find((item) => item.active) ?? status?.activeProfile ?? null, [items, status?.activeProfile]);
  const hasUrlProfiles = items.some((item) => item.source === 'url');

  const resetForm = () => {
    setName('');
    setUrl('');
    setContent('');
    setTab('url');
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    if (tab === 'url' && !url.trim()) {
      toast('请输入订阅地址', 'error');
      return;
    }
    if (tab === 'content' && !content.trim()) {
      toast('请粘贴或导入配置内容', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('profiles', {
        name: name.trim() || undefined,
        ...(tab === 'url' ? { url: url.trim() } : { content }),
      }, { timeoutMs: 120000 });
      await Promise.all([profiles.refresh(), refreshStatus()]);
      setAddOpen(false);
      resetForm();
      toast('配置已添加', 'success');
    } catch (error) {
      await Promise.all([profiles.refresh(), refreshStatus()]);
      toast(error instanceof Error ? error.message : '添加失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const updateAll = async () => {
    setUpdatingAll(true);
    try {
      const result = await api.post<{ results: { name: string; ok: boolean; error?: string }[] }>(
        'profiles/update-all',
        undefined,
        { timeoutMs: 300000 },
      );
      await Promise.all([profiles.refresh(), refreshStatus()]);
      const failed = result.results.filter((item) => !item.ok);
      if (failed.length) {
        toast(`更新完成，${failed.length} 个订阅失败：${failed.map((item) => item.name).join('、')}`, 'error');
      } else if (result.results.length) {
        toast(`已更新 ${result.results.length} 个订阅`, 'success');
      } else {
        toast('没有可更新的订阅链接', 'info');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '全部更新失败', 'error');
    } finally {
      setUpdatingAll(false);
    }
  };

  const activate = async (profile: Profile) => {
    setBusy(`activate:${profile.id}`);
    try {
      await api.post(`profiles/${profile.id}/activate`, undefined, { timeoutMs: 120000 });
      await Promise.all([profiles.refresh(), refreshStatus()]);
      toast(`已启用 ${profile.name}`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '启用失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const update = async (profile: Profile) => {
    setBusy(`update:${profile.id}`);
    try {
      await api.post(`profiles/${profile.id}/update`, undefined, { timeoutMs: 120000 });
      await Promise.all([profiles.refresh(), refreshStatus()]);
      toast(`${profile.name} 已更新`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '更新失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(`delete:${deleteTarget.id}`);
    try {
      await api.delete(`profiles/${deleteTarget.id}`);
      await Promise.all([profiles.refresh(), refreshStatus()]);
      toast('配置已删除', 'success');
      setDeleteTarget(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const view = async (profile: Profile) => {
    setViewing(profile);
    setViewContent('');
    setViewLoading(true);
    try {
      const result = await api.get<{ content: string }>(`profiles/${profile.id}/content`);
      setViewContent(result.content);
    } catch (error) {
      toast(error instanceof Error ? error.message : '读取配置失败', 'error');
    } finally {
      setViewLoading(false);
    }
  };

  const download = () => {
    if (!viewing || !viewContent) return;
    const blob = new Blob([viewContent], { type: 'text/yaml;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${viewing.name.replace(/[\\/:*?"<>|]/g, '_')}.yaml`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast('配置文件不能超过 8 MB', 'error');
      return;
    }
    const text = await file.text();
    setContent(text);
    if (!name.trim()) setName(file.name.replace(/\.(ya?ml|txt)$/i, ''));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted">支持 Clash / mihomo YAML 订阅，启用后热加载到内核。</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={profiles.refreshing} onClick={() => { void profiles.refresh(); }}>刷新</Button>
          <Button variant="secondary" size="sm" icon={<CloudDownload className="h-3.5 w-3.5" />} loading={updatingAll} disabled={!hasUrlProfiles} onClick={() => { void updateAll(); }}>全部更新</Button>
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>添加订阅</Button>
        </div>
      </div>

      {active ? (
        <div className="relative overflow-hidden rounded-xl border border-accent/25 bg-surface p-5">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent"><Layers className="h-4.5 w-4.5" /></span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{active.name}</h3>
                    <Badge tone="accent"><CheckCircle2 className="h-2.5 w-2.5" /> 正在使用</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <SourceBadge profile={active} />
                    <span>{active.proxyCount} 个代理</span>
                    <span>·</span>
                    <span>{timeAgo(active.updatedAt)}更新</span>
                    {active.url ? <><span>·</span><span className="max-w-[280px] truncate">{active.url}</span></> : null}
                  </div>
                </div>
              </div>
              <div className="mt-4 max-w-md"><SubscriptionMeter profile={active} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => { void view(active); }}>查看</Button>
              {active.source === 'url' ? (
                <Button variant="primary" size="sm" icon={<CloudDownload className="h-3.5 w-3.5" />} loading={busy === `update:${active.id}`} onClick={() => { void update(active); }}>更新订阅</Button>
              ) : null}
            </div>
          </div>
          <div className="relative mt-4 grid grid-cols-2 gap-3 border-t border-line/10 pt-4 sm:grid-cols-4">
            <div><div className="text-[10px] uppercase tracking-[0.14em] text-muted/60">代理节点</div><div className="mt-1 text-sm text-ink">{active.proxyCount}</div></div>
            <div><div className="text-[10px] uppercase tracking-[0.14em] text-muted/60">提供者</div><div className="mt-1 text-sm text-ink">{active.providerCount}</div></div>
            <div><div className="text-[10px] uppercase tracking-[0.14em] text-muted/60">来源</div><div className="mt-1 text-sm text-ink">{active.source === 'url' ? '订阅链接' : '本地文件'}</div></div>
            <div><div className="text-[10px] uppercase tracking-[0.14em] text-muted/60">最近更新</div><div className="mt-1 text-sm text-ink">{formatDate(active.updatedAt)}</div></div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line/15 bg-surface/30 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line/10 bg-surface2 text-muted"><Upload className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-medium text-ink">还没有启用配置</p>
                <p className="mt-0.5 text-[12px] text-muted">添加第一个订阅，Momo 会自动启用并加载到 mihomo。</p>
              </div>
            </div>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>添加订阅</Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">全部配置</h3>
        <span className="text-[11px] text-muted/60">{items.length} 个</span>
      </div>

      {profiles.loading && items.length === 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-[190px]" />)}</div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers className="h-5 w-5" />}
            title="从一个订阅开始"
            description="粘贴机场订阅链接，或导入已有的 Clash / mihomo YAML 配置。启用后即可在代理页选择节点。"
            action={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>添加配置</Button>}
          />
        </Card>
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((profile) => (
            <div key={profile.id} className={cn('card p-4 transition hover:border-line/15', profile.active && 'border-accent/25 bg-accent/4')}>
              <div className="flex items-start gap-2.5">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', profile.active ? 'border-accent/20 bg-accent/8 text-accent' : 'border-line/10 bg-surface2 text-muted')}>
                  {profile.source === 'url' ? <Link2 className="h-4 w-4" /> : <FileCode2 className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-[14px] font-medium text-ink">{profile.name}</h4>
                    {profile.active ? <Badge tone="accent">使用中</Badge> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <SourceBadge profile={profile} />
                    <span>{profile.proxyCount} 代理</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-line/6 bg-surface2/35 px-2.5 py-2 text-[11px] text-muted">
                <CalendarClock className="h-3 w-3" />
                <span className="truncate">{profile.source === 'url' ? (profile.url || '订阅链接') : '本地粘贴配置'}</span>
              </div>
              <SubscriptionMeter profile={profile} />
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/8 pt-3">
                <span className="text-[10px] text-muted/60">{timeAgo(profile.updatedAt)}更新</span>
                <div className="flex items-center gap-0.5">
                  {!profile.active ? (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" loading={busy === `activate:${profile.id}`} onClick={() => { void activate(profile); }}>启用</Button>
                  ) : null}
                  {profile.source === 'url' ? (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" loading={busy === `update:${profile.id}`} onClick={() => { void update(profile); }}>更新</Button>
                  ) : null}
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" icon={<Eye className="h-3 w-3" />} onClick={() => { void view(profile); }}>查看</Button>
                  <button
                    type="button"
                    title="删除配置"
                    onClick={() => setDeleteTarget(profile)}
                    className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-muted/70 transition hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => { if (!submitting) { setAddOpen(false); resetForm(); } }}
        title="添加配置"
        description="支持订阅链接或直接粘贴 Clash / mihomo YAML。"
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => { setAddOpen(false); resetForm(); }} disabled={submitting}>取消</Button>
            <Button variant="primary" size="sm" loading={submitting} onClick={() => { void submit(); }}>添加</Button>
          </>
        )}
      >
        <div className="mb-4 inline-flex items-center gap-1 rounded-lg border border-line/10 bg-surface2 p-0.5">
          <button type="button" onClick={() => setTab('url')} className={cn('rounded-md px-3 py-1.5 text-[12px] font-medium transition', tab === 'url' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>订阅链接</button>
          <button type="button" onClick={() => setTab('content')} className={cn('rounded-md px-3 py-1.5 text-[12px] font-medium transition', tab === 'content' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>粘贴配置</button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-muted">名称 <span className="text-muted/50">（可选）</span></span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：家里主订阅"
              className="focus-ring h-9 w-full rounded-lg border border-line/10 bg-surface2/80 px-3 text-sm text-ink placeholder:text-muted/50"
            />
          </label>
          {tab === 'url' ? (
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-muted">订阅地址</span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/subscribe?token=..."
                className="focus-ring h-9 w-full rounded-lg border border-line/10 bg-surface2/80 px-3 font-mono text-xs text-ink placeholder:text-muted/50"
                autoFocus
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted/60">请求会带 mihomo User-Agent，自动识别 Base64 编码的订阅内容。</p>
            </label>
          ) : (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[12px] text-muted">配置内容</span>
                <div className="flex items-center gap-1">
                  <input ref={fileRef} type="file" accept=".yaml,.yml,.txt,text/yaml,text/plain" className="hidden" onChange={(event) => { void onFile(event.target.files?.[0]); }} />
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" icon={<FileUp className="h-3 w-3" />} onClick={() => fileRef.current?.click()}>导入文件</Button>
                </div>
              </div>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={12}
                placeholder={'proxies:\n  - name: node-1\n    type: ss\n    ...\nproxy-groups:\n  - name: Proxy\n    type: select\n    proxies: [node-1]\nrules:\n  - MATCH,Proxy'}
                className="focus-ring w-full resize-y rounded-lg border border-line/10 bg-surface2/80 p-3 font-mono text-[12px] leading-relaxed text-ink placeholder:text-muted/35 scrollbar-thin"
              />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing ? `查看 · ${viewing.name}` : '查看配置'}
        description={viewing ? `${formatDate(viewing.updatedAt)} 更新 · ${viewing.proxyCount} 个代理` : undefined}
        size="lg"
        footer={(
          <>
            <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={download} disabled={!viewContent}>下载 YAML</Button>
            <Button variant="secondary" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={async () => { await navigator.clipboard.writeText(viewContent); toast('已复制到剪贴板', 'success'); }} disabled={!viewContent}>复制全部</Button>
            <Button variant="primary" size="sm" onClick={() => setViewing(null)}>关闭</Button>
          </>
        )}
      >
        {viewLoading ? <div className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-64 w-full" /></div> : (
          <div className="relative">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] text-muted">{viewContent.split('\n').length} 行</span>
              <CopyButton text={viewContent} />
            </div>
            <pre className="scrollbar-thin max-h-[48vh] overflow-auto rounded-lg border border-line/8 bg-bg/60 p-3 font-mono text-[12px] leading-relaxed text-ink/80 prose-pre">{viewContent}</pre>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除配置"
        message={deleteTarget ? <>确定删除 <span className="font-medium text-ink">{deleteTarget.name}</span> 吗？如果正在使用，内核会切换到最小配置。此操作不可撤销。</> : null}
        confirmText="删除"
        danger
        pending={busy === `delete:${deleteTarget?.id}`}
        onClose={() => { if (!busy) setDeleteTarget(null); }}
        onConfirm={() => { void remove(); }}
      />
    </div>
  );
}
