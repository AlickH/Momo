export type CoreState = 'stopped' | 'starting' | 'running' | 'stopping' | 'restarting' | 'error';
export type Mode = 'rule' | 'global' | 'direct';
export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'silent';

export interface CoreSnapshot {
  state: CoreState;
  pid: number | null;
  startedAt: number | null;
  lastError: string | null;
  version: string | null;
  restartAttempts: number;
  nextRestartAt: number | null;
  controllerReady: boolean;
}

export interface Settings {
  mixedPort: number;
  allowLan: boolean;
  mode: Mode;
  logLevel: LogLevel;
  ipv6: boolean;
  unifiedDelay: boolean;
  tcpConcurrent: boolean;
}

export interface SubscriptionInfo {
  upload: number;
  download: number;
  total: number;
  expire: number;
}

export interface Profile {
  id: string;
  name: string;
  source: 'url' | 'manual';
  url: string | null;
  createdAt: number;
  updatedAt: number;
  proxyCount: number;
  providerCount: number;
  subscription: SubscriptionInfo | null;
  active: boolean;
}

export interface TrafficPoint {
  t: number;
  up: number;
  down: number;
}

export interface Traffic {
  up: number;
  down: number;
  upTotal: number;
  downTotal: number;
  memory: number;
  reachable: boolean;
  history: TrafficPoint[];
}

export interface Status {
  core: CoreSnapshot;
  settings: Settings;
  activeProfile: Profile | null;
  profileCount: number;
  traffic: Pick<Traffic, 'up' | 'down' | 'upTotal' | 'downTotal' | 'memory'>;
  connections: number;
  app: {
    version: string;
    gatewayPrefix: string;
    packaged: boolean;
    platform: string;
    dataDir?: string;
  };
}

export interface Me {
  id: string;
  username: string;
  isAdmin: boolean;
  local: boolean;
}

export interface ProxyGroup {
  name: string;
  type: string;
  now: string;
  all: string[];
  icon: string;
  hidden: boolean;
  testUrl: string;
}

export interface ProxyNode {
  name: string;
  type: string;
  udp: boolean;
  alive: boolean;
  delay: number | null;
  history: { time: string; delay: number }[];
}

export interface ProxiesData {
  groups: ProxyGroup[];
  nodes: Record<string, ProxyNode>;
  flat: ProxyNode[];
}

export interface Provider {
  name: string;
  type: string;
  vehicleType: string;
  count: number;
  updatedAt: string | null;
  subscriptionInfo: SubscriptionInfo | null;
}

export interface Rule {
  index: number;
  type: string;
  payload: string;
  proxy: string;
  size: number;
  extra?: {
    disabled?: boolean;
    hitCount?: number;
    hitAt?: string;
  };
}

export interface Connection {
  id: string;
  host: string;
  destinationIP: string;
  destinationPort: string;
  sourceIP: string;
  network: string;
  type: string;
  process: string;
  rule: string;
  rulePayload: string;
  chains: string[];
  upload: number;
  download: number;
  start: string;
}

export interface ConnectionsData {
  downloadTotal: number;
  uploadTotal: number;
  connections: Connection[];
}

export interface LogEntry {
  id: number;
  time: number;
  level: 'debug' | 'info' | 'warning' | 'error';
  source: string;
  message: string;
}

