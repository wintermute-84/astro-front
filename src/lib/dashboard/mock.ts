// Mock data for /dashboard/ui only. Live pages use the edge-cache RPC (edge.ts).
import { OUTCOMES, RANGES, formatDuration, parseRange } from './format.ts';
export { OUTCOMES, RANGES, formatDuration, parseRange };

export type Range = '24h' | '7d' | '30d';
export type Outcome = 'HIT' | 'MISS' | 'STALE' | 'STALE-ERROR' | 'BYPASS';

export interface Tenant {
  slug: string;
  name: string;
  origins: number;
  rules: number;
  enabled: boolean;
}

export interface Rule {
  id: string;
  tenant: string;
  method: 'GET' | 'POST';
  pathPattern: string;
  ttlS: number;
  swrS: number;
  staleIfErrorS: number;
  vary: string[];
  postRead: boolean;
  tags: string[];
  enabled: boolean;
}

export interface PurgeLogEntry {
  id: string;
  tenant: string;
  tags: string[];
  actor: string;
  at: number;
  result: 'OK' | 'ERR';
  detail?: string;
}

export interface Kpi {
  key: 'hitRatio' | 'originSaved' | 'p95Edge' | 'staleOutage';
  label: string;
  value: string;
  delta: { dir: 'up' | 'down' | 'flat'; text: string; good: boolean };
  spark?: number[];
  lead?: boolean;
}

export interface Overview {
  range: Range;
  t: number[];
  hitRatio: number[];
  latency: {
    edgeP50: number[];
    edgeP95: number[];
    originP50: number[];
    originP95: number[];
  };
  outcomes: Record<Outcome, number[]>;
  kpis: Kpi[];
}

const ANCHOR = Date.UTC(2026, 9, 18, 12) / 1000;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bucketSpec(range: Range): { count: number; stepSec: number } {
  if (range === '24h') return { count: 24, stepSec: 3600 };
  if (range === '7d') return { count: 42, stepSec: 4 * 3600 };
  return { count: 30, stepSec: 86400 };
}

function bucketTimes(range: Range): number[] {
  const { count, stepSec } = bucketSpec(range);
  const t: number[] = [];
  for (let i = 0; i < count; i++) {
    t.push(ANCHOR - (count - i) * stepSec);
  }
  return t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function formatInt(n: number): string {
  return n.toLocaleString('en-US');
}

function deltaFrom(
  current: number,
  prev: number,
  range: Range,
  opts: { invert?: boolean; suffix?: string; points?: boolean },
): Kpi['delta'] {
  const diff = current - prev;
  const invert = opts.invert ?? false;
  const good =
    Math.abs(diff) < 1e-9
      ? true
      : invert
        ? diff < 0
        : diff > 0;
  let dir: 'up' | 'down' | 'flat' = 'flat';
  if (Math.abs(diff) >= 1e-9) dir = diff > 0 ? 'up' : 'down';

  const rangeLabel = range.toUpperCase();
  let text: string;
  if (opts.points) {
    const pts = (diff * 100).toFixed(1);
    const sign = diff >= 0 ? '+' : '';
    text = `${sign}${pts} pts vs prev ${rangeLabel}`;
  } else if (opts.suffix === 'ms') {
    const sign = diff >= 0 ? '+' : '';
    text = `${sign}${Math.round(diff)} ms vs prev ${rangeLabel}`;
  } else {
    const pct = prev !== 0 ? ((diff / prev) * 100).toFixed(1) : '0.0';
    const sign = diff >= 0 ? '+' : '';
    text = `${sign}${pct}% vs prev ${rangeLabel}`;
  }

  return { dir, text, good };
}

export function tenants(): Tenant[] {
  return [
    { slug: 'acme', name: 'Acme Wholesale', origins: 2, rules: 6, enabled: true },
    { slug: 'nordic-parts', name: 'Nordic Parts', origins: 1, rules: 3, enabled: true },
    { slug: 'demo', name: 'Demo', origins: 1, rules: 2, enabled: true },
  ];
}

export function overview(tenant: string, range: Range): Overview {
  const rng = mulberry32(hashString(`${tenant}:${range}`));
  const t = bucketTimes(range);
  const n = t.length;

  const outageLen = 2 + Math.floor(rng() * 2);
  const outageStart = 4 + Math.floor(rng() * Math.max(1, n - outageLen - 4));

  const baseRequests = Math.floor(lerp(8000, 14000, rng()));
  const hitRatio: number[] = [];
  const edgeP50: number[] = [];
  const edgeP95: number[] = [];
  const originP50: number[] = [];
  const originP95: number[] = [];
  const outcomes: Record<Outcome, number[]> = {
    HIT: [],
    MISS: [],
    STALE: [],
    'STALE-ERROR': [],
    BYPASS: [],
  };

  const dipCenter = Math.floor(n * (0.35 + rng() * 0.25));
  const dipWidth = 2 + Math.floor(rng() * 3);

  for (let i = 0; i < n; i++) {
    const inOutage = i >= outageStart && i < outageStart + outageLen;
    const inDip =
      i >= dipCenter - dipWidth && i <= dipCenter + dipWidth;

    let ratio = lerp(0.9, 0.96, rng());
    if (inDip) ratio -= lerp(0.04, 0.08, rng());
    ratio = Math.min(0.97, Math.max(0.88, ratio));
    hitRatio.push(ratio);

    const e50 = Math.round(lerp(25, 45, rng()));
    const e95 = Math.round(lerp(80, 140, rng()));
    edgeP50.push(e50);
    edgeP95.push(Math.max(e50 + 5, e95));

    const o50 = Math.round(lerp(600, 900, rng()));
    const o95 = Math.round(lerp(1200, 2400, rng()));
    originP50.push(o50);
    originP95.push(Math.max(o50 + 50, o95));

    const jitter = lerp(0.85, 1.15, rng());
    const total = Math.max(100, Math.round(baseRequests * jitter));

    let missPct = lerp(0.04, 0.08, rng());
    let stalePct = lerp(0.01, 0.03, rng());
    const bypassPct = lerp(0.01, 0.02, rng());
    let staleErrPct = 0;

    if (inOutage) {
      staleErrPct = lerp(0.08, 0.14, rng());
      missPct *= 0.35;
      stalePct += lerp(0.01, 0.02, rng());
    }

    const hitPct = Math.max(0, 1 - missPct - stalePct - bypassPct - staleErrPct);
    const scale = total / hitPct;

    const staleErrCount = inOutage
      ? Math.max(1, Math.round(scale * staleErrPct))
      : 0;
    outcomes.HIT.push(Math.round(scale * hitPct * ratio));
    outcomes.MISS.push(Math.round(scale * missPct));
    outcomes.STALE.push(Math.round(scale * stalePct));
    outcomes['STALE-ERROR'].push(staleErrCount);
    outcomes.BYPASS.push(Math.round(scale * bypassPct));
  }

  // Keep the series consistent with the outcome counts (and so with the KPI).
  for (let i = 0; i < n; i++) {
    hitRatio[i] = outcomes.HIT[i] / OUTCOMES.reduce((acc, o) => acc + outcomes[o][i], 0);
  }

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const totalHits = sum(outcomes.HIT);
  const totalStale = sum(outcomes.STALE);
  const totalStaleErr = sum(outcomes['STALE-ERROR']);
  const originSaved = totalHits + totalStale + totalStaleErr;
  const totalAll = OUTCOMES.reduce((acc, o) => acc + sum(outcomes[o]), 0);
  const hitRatioKpi = totalAll > 0 ? totalHits / totalAll : 0;
  const meanP95 = edgeP95.reduce((a, b) => a + b, 0) / n;

  const sparkLen = 12 + Math.floor(rng() * 13);
  const sparkOrigin: number[] = [];
  const sparkHit: number[] = [];
  const sparkP95: number[] = [];
  for (let i = 0; i < sparkLen; i++) {
    sparkOrigin.push(Math.round(originSaved * lerp(0.02, 0.12, rng())));
    sparkHit.push(lerp(0.88, 0.97, rng()));
    sparkP95.push(Math.round(lerp(80, 140, rng())));
  }

  const prevFactor = lerp(0.92, 1.08, rng());

  const kpis: Kpi[] = [
    {
      key: 'originSaved',
      label: 'ORIGIN SAVED',
      value: formatCompact(originSaved),
      delta: deltaFrom(originSaved, originSaved * prevFactor, range, {}),
      spark: sparkOrigin,
      lead: true,
    },
    {
      key: 'hitRatio',
      label: 'HIT RATIO',
      value: `${(hitRatioKpi * 100).toFixed(1)}%`,
      delta: deltaFrom(hitRatioKpi, hitRatioKpi * prevFactor, range, { points: true }),
      spark: sparkHit,
    },
    {
      key: 'p95Edge',
      label: 'P95 EDGE',
      value: `${Math.round(meanP95)} ms`,
      delta: deltaFrom(meanP95, meanP95 * prevFactor, range, { invert: true, suffix: 'ms' }),
      spark: sparkP95,
    },
    {
      key: 'staleOutage',
      label: 'STALE DURING OUTAGE',
      value: formatInt(totalStaleErr),
      delta: deltaFrom(totalStaleErr, totalStaleErr * prevFactor, range, {}),
    },
  ];

  return {
    range,
    t,
    hitRatio,
    latency: { edgeP50, edgeP95, originP50, originP95 },
    outcomes,
    kpis,
  };
}

const RULES_BY_TENANT: Record<string, Rule[]> = {
  acme: [
    {
      id: 'acme-r1',
      tenant: 'acme',
      method: 'GET',
      pathPattern: '/api/v1/stock/*',
      ttlS: 300,
      swrS: 600,
      staleIfErrorS: 3600,
      vary: ['query:sku', 'header:x-customer-group'],
      postRead: false,
      tags: ['stock'],
      enabled: true,
    },
    {
      id: 'acme-r2',
      tenant: 'acme',
      method: 'GET',
      pathPattern: '/api/v1/prices?sku=*',
      ttlS: 120,
      swrS: 300,
      staleIfErrorS: 1800,
      vary: ['query:sku'],
      postRead: false,
      tags: ['price'],
      enabled: true,
    },
    {
      id: 'acme-r3',
      tenant: 'acme',
      method: 'GET',
      pathPattern: '/pim/products/*',
      ttlS: 600,
      swrS: 1200,
      staleIfErrorS: 7200,
      vary: ['header:accept-language'],
      postRead: false,
      tags: ['pim'],
      enabled: true,
    },
    {
      id: 'acme-r4',
      tenant: 'acme',
      method: 'POST',
      pathPattern: '/graphql',
      ttlS: 60,
      swrS: 120,
      staleIfErrorS: 900,
      vary: ['header:x-customer-group'],
      postRead: true,
      tags: ['pim', 'price'],
      enabled: true,
    },
    {
      id: 'acme-r5',
      tenant: 'acme',
      method: 'GET',
      pathPattern: '/api/v1/catalog/categories',
      ttlS: 3600,
      swrS: 7200,
      staleIfErrorS: 86400,
      vary: [],
      postRead: false,
      tags: ['pim'],
      enabled: false,
    },
    {
      id: 'acme-r6',
      tenant: 'acme',
      method: 'GET',
      pathPattern: '/api/v1/availability/*',
      ttlS: 30,
      swrS: 60,
      staleIfErrorS: 600,
      vary: ['query:sku', 'header:x-customer-group'],
      postRead: false,
      tags: ['stock'],
      enabled: true,
    },
  ],
  'nordic-parts': [
    {
      id: 'np-r1',
      tenant: 'nordic-parts',
      method: 'GET',
      pathPattern: '/api/v1/stock/*',
      ttlS: 180,
      swrS: 360,
      staleIfErrorS: 2400,
      vary: ['query:sku'],
      postRead: false,
      tags: ['stock'],
      enabled: true,
    },
    {
      id: 'np-r2',
      tenant: 'nordic-parts',
      method: 'GET',
      pathPattern: '/api/v1/prices?sku=*',
      ttlS: 90,
      swrS: 180,
      staleIfErrorS: 1200,
      vary: ['header:x-customer-group'],
      postRead: false,
      tags: ['price'],
      enabled: true,
    },
    {
      id: 'np-r3',
      tenant: 'nordic-parts',
      method: 'GET',
      pathPattern: '/pim/products/*',
      ttlS: 900,
      swrS: 1800,
      staleIfErrorS: 14400,
      vary: ['header:accept-language'],
      postRead: false,
      tags: ['pim'],
      enabled: true,
    },
  ],
  demo: [
    {
      id: 'demo-r1',
      tenant: 'demo',
      method: 'GET',
      pathPattern: '/api/v1/stock/*',
      ttlS: 60,
      swrS: 120,
      staleIfErrorS: 300,
      vary: [],
      postRead: false,
      tags: ['stock'],
      enabled: true,
    },
    {
      id: 'demo-r2',
      tenant: 'demo',
      method: 'POST',
      pathPattern: '/graphql',
      ttlS: 30,
      swrS: 60,
      staleIfErrorS: 180,
      vary: [],
      postRead: true,
      tags: ['pim'],
      enabled: true,
    },
  ],
};

export function rules(tenant: string): Rule[] {
  return RULES_BY_TENANT[tenant] ? [...RULES_BY_TENANT[tenant]] : [];
}

const PURGE_LOG_ALL: PurgeLogEntry[] = [
  {
    id: 'pl-8',
    tenant: 'acme',
    tags: ['stock', 'price'],
    actor: 'ops@acme.example',
    at: ANCHOR - 3600,
    result: 'OK',
  },
  {
    id: 'pl-7',
    tenant: 'nordic-parts',
    tags: ['pim'],
    actor: 'cache-admin@nordic.example',
    at: ANCHOR - 7200,
    result: 'OK',
  },
  {
    id: 'pl-6',
    tenant: 'demo',
    tags: ['stock'],
    actor: 'demo-runner',
    at: ANCHOR - 14400,
    result: 'ERR',
    detail: 'Upstream purge API timeout after 30s',
  },
  {
    id: 'pl-5',
    tenant: 'acme',
    tags: ['pim'],
    actor: 'ops@acme.example',
    at: ANCHOR - 86400,
    result: 'OK',
  },
  {
    id: 'pl-4',
    tenant: 'nordic-parts',
    tags: ['price'],
    actor: 'cache-admin@nordic.example',
    at: ANCHOR - 172800,
    result: 'OK',
  },
  {
    id: 'pl-3',
    tenant: 'acme',
    tags: ['price'],
    actor: 'ops@acme.example',
    at: ANCHOR - 259200,
    result: 'OK',
  },
  {
    id: 'pl-2',
    tenant: 'demo',
    tags: ['pim', 'stock'],
    actor: 'demo-runner',
    at: ANCHOR - 345600,
    result: 'OK',
  },
  {
    id: 'pl-1',
    tenant: 'nordic-parts',
    tags: ['stock'],
    actor: 'cache-admin@nordic.example',
    at: ANCHOR - 432000,
    result: 'OK',
  },
];

export function purgeLog(tenant?: string): PurgeLogEntry[] {
  if (!tenant) return [...PURGE_LOG_ALL];
  return PURGE_LOG_ALL.filter((e) => e.tenant === tenant);
}

export function maxStaleness(r: Rule): { normal: number; outage: number } {
  return {
    normal: r.ttlS + r.swrS,
    outage: r.ttlS + Math.max(r.swrS, r.staleIfErrorS),
  };
}
