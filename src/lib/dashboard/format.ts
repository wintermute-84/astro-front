import type { Outcome, Range } from './contract.ts';

export const RANGES: Range[] = ['24h', '7d', '30d'];
export const OUTCOMES: Outcome[] = ['HIT', 'MISS', 'STALE', 'STALE-ERROR', 'BYPASS'];

export function parseRange(v: string | null | undefined): Range {
  if (v === '7d' || v === '30d' || v === '24h') return v;
  return '24h';
}

export function formatDuration(s: number): string {
  if (s <= 0) return '0 s';
  const day = 86400;
  const hour = 3600;
  const minute = 60;

  const days = Math.floor(s / day);
  let rem = s % day;
  const hours = Math.floor(rem / hour);
  rem %= hour;
  const minutes = Math.floor(rem / minute);
  rem %= minute;
  const seconds = rem;

  if (days > 0) {
    const parts: string[] = [`${days} d`];
    if (hours > 0) parts.push(`${hours} h`);
    return parts.join(' ');
  }
  if (hours > 0) {
    const parts: string[] = [`${hours} h`];
    if (minutes > 0) parts.push(`${minutes} min`);
    return parts.join(' ');
  }
  if (minutes > 0) return `${minutes} min`;
  return `${seconds} s`;
}

/** "2026-10-18 12:00 UTC" */
export const utc = (unixS: number) => new Date(unixS * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
