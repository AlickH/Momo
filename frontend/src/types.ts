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
  subscriptionUpdateHours: number;
  providerUpdateHours: number;
  ruleProviderUpdateHours: number;
  coreRestartHours: number;
  coreAutoStart: boolean;
  dnsPort: number;
  dnsNameserver: string;
  proxyMode: 'off' | 'tun' | 'redir' | 'tproxy';
  redirPort: number;
  lanTransparent: boolean;
  tproxyPort: number;
  testUrl: string;
  testTimeout: number;
  tunStack: 'gvisor' | 'system' | 'mixed';
  tunAutoRoute: boolean;
  tunDnsHijack: boolean;
  externalController: boolean;
  externalControllerPort: number;
  externalControllerSecret: string;
  telegramEnabled: boolean;
  telegramToken: string;
  telegramChatId: string;
  telegramNotify: boolean;
  ddnsEnabled: boolean;
  ddnsProvider: 'url' | 'cloudflare';
  ddnsDomain: string;
  ddnsZone: string;
  ddnsToken: string;
  ddnsUrl: string;
  ddnsRecordType: 'A' | 'AAAA';
  ddnsIntervalMinutes: number;
  customRules: string;
  portForwards: PortForward[];
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

export interface HistoryPoint {
  t: number;
  value: number;
}

export interface Traffic {
  up: number;
  down: number;
  upTotal: number;
  downTotal: number;
  memory: number;
  reachable: boolean;
  history: TrafficPoint[];
  memoryHistory?: HistoryPoint[];
  connectionsHistory?: HistoryPoint[];
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
    tunCapable?: boolean;
    rootMode?: boolean;
    transparentActive?: boolean;
    transparentError?: string | null;
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
  provider?: string;
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

export interface PortForward {
  id: string;
  name: string;
  protocol: 'tcp' | 'udp';
  listenPort: number;
  targetHost: string;
  targetPort: number;
  enabled: boolean;
}

export interface GeoLocation {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  lat: number;
  lon: number;
}

export interface DdnsStatus {
  enabled: boolean;
  provider: string;
  domain: string;
  lastIp: string;
  lastUpdatedAt: string | null;
  lastError: string | null;
  lastMessage: string;
  running: boolean;
}

export interface RuleProvider {
  name: string;
  type: string;
  behavior: string;
  ruleCount: number;
  updatedAt: string | null;
  vehicleType: string;
}

export interface SmartWeight {
  Name: string;
  Rank: string;
  Weight: number;
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

export interface ConnectionHistoryItem {
  key: string;
  upload: number;
  download: number;
  count: number;
}

export interface ConnectionHistory {
  by: string;
  items: ConnectionHistoryItem[];
  totals: { upload: number; download: number; count: number };
}

export interface LogEntry {
  id: number;
  time: number;
  level: 'debug' | 'info' | 'warning' | 'error';
  source: string;
  message: string;
}

