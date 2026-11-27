export interface IpCheckResult {
  proxyIp: string;
  directIp: string;
  same: boolean;
  checkedAt: string;
}

const STORAGE_KEY = 'momo-ip-check-cache';
const MAX_AGE_MS = 30 * 60 * 1000;

export function readIpCache(maxAgeMs = MAX_AGE_MS): IpCheckResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as IpCheckResult;
    if (!data?.proxyIp || !data.checkedAt) return null;
    if (Date.now() - new Date(data.checkedAt).getTime() > maxAgeMs) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeIpCache(result: IpCheckResult): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    // Cache is optional.
  }
}
