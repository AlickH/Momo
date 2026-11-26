import { TrimApp } from '@trimjs/web-app';

let instance: TrimApp | null | undefined;

export function hostApp(): TrimApp | null {
  if (typeof window === 'undefined' || window.self === window.top) return null;
  if (instance === undefined) {
    try {
      instance = new TrimApp();
    } catch {
      instance = null;
    }
  }
  return instance;
}
