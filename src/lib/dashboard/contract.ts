// Copied verbatim from /var/www/edge-cache/src/contract.ts (edge-cache worker, entrypoint EdgeCacheRPC).
// Keep in sync by re-copying; don't edit here.
// Public RPC contract of the edge-cache worker (named entrypoint `EdgeCacheRPC`).
// Self-contained on purpose: the site repo copies this file verbatim.
// Shapes match 3dreamlab.com src/lib/dashboard/mock.ts; additions are marked "added".

export type Range = "24h" | "7d" | "30d";
export type Outcome = "HIT" | "MISS" | "STALE" | "STALE-ERROR" | "BYPASS";

export interface Tenant {
  slug: string;
  name: string;
  origins: number;
  rules: number;
  enabled: boolean;
}

/**
 * vary entries: `query:<name>` (query allowlist; only these params reach the key and the origin),
 * `header:<name>` (header value in the key), `group:<name>` (customer-group header: in the key, and
 * the only way a request with Authorization/Cookie gets cached; at most one per rule).
 * pathPattern: path only, `*` matches one non-empty path segment. No query part.
 */
export interface Rule {
  id: string;
  tenant: string;
  originId: string; // added
  method: "GET" | "POST";
  pathPattern: string;
  ttlS: number;
  swrS: number;
  staleIfErrorS: number;
  vary: string[];
  postRead: boolean;
  tags: string[];
  enabled: boolean;
}

/** added */
export interface Origin {
  id: string;
  tenant: string;
  baseUrl: string;
  timeoutMs: number;
  authHeaderName: string | null;
  /** Name of a worker secret (`ORIGIN_SECRET_*`), never the value. */
  secretRef: string | null;
}

export interface PurgeLogEntry {
  id: string;
  tenant: string;
  tags: string[];
  actor: string;
  at: number; // unix seconds
  result: "OK" | "ERR";
  detail?: string;
}

export interface Kpi {
  key: "hitRatio" | "originSaved" | "p95Edge" | "staleOutage";
  label: string;
  value: string;
  delta: { dir: "up" | "down" | "flat"; text: string; good: boolean };
  spark?: number[];
  lead?: boolean;
}

export interface Overview {
  range: Range;
  t: number[]; // bucket start, unix seconds
  hitRatio: number[];
  latency: {
    edgeP50: number[];
    edgeP95: number[];
    originP50: number[];
    originP95: number[];
  };
  outcomes: Record<Outcome, number[]>;
  kpis: Kpi[];
  /** added: false when Analytics Engine is not configured or the query failed (series are zeros). */
  available: boolean;
}

/** added: getTenant() result */
export interface TenantDetail {
  tenant: Tenant & { corsOrigins: string[]; createdAt: number };
  origins: Origin[];
  rules: Rule[];
}

export interface TenantInput {
  slug: string;
  name: string;
  corsOrigins?: string[];
  enabled?: boolean;
}

export interface OriginInput {
  tenant: string;
  id?: string; // omit to create
  baseUrl: string;
  timeoutMs?: number;
  authHeaderName?: string | null;
  secretRef?: string | null;
}

export interface RuleInput {
  tenant: string;
  id?: string; // omit to create
  originId: string;
  method: "GET" | "POST";
  pathPattern: string;
  ttlS: number;
  swrS?: number;
  staleIfErrorS?: number;
  vary?: string[];
  postRead?: boolean;
  tags?: string[];
  enabled?: boolean;
}

export interface TestRequestInput {
  slug: string;
  method: "GET" | "POST";
  path: string; // path under the tenant, e.g. "/products"
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
}

export interface TestRequestResult {
  key: string | null; // null when bypassed before a key was built
  outcome: Outcome;
  status: number;
  originMs: number; // 0 when the origin was not called
  totalMs: number;
  headers: Record<string, string>;
}

export interface DemoCallInput {
  via: "origin" | "edge";
  outage: boolean;
}

export interface DemoCallResult {
  outcome: Outcome | "ORIGIN"; // ORIGIN = direct origin call, no cache involved
  status: number;
  ms: number;
  body?: unknown;
}

/** Type for the site's service binding: `Service<EdgeCacheApi>`-style usage. */
export interface EdgeCacheApi {
  listTenants(): Promise<Tenant[]>;
  getTenant(slug: string): Promise<TenantDetail>;
  upsertTenant(input: TenantInput): Promise<TenantDetail>;
  upsertOrigin(input: OriginInput): Promise<Origin>;
  upsertRule(input: RuleInput): Promise<Rule>;
  deleteRule(slug: string, ruleId: string): Promise<{ deleted: true }>;
  purge(slug: string, tags: string[], actor: string): Promise<PurgeLogEntry>;
  listPurgeLog(slug?: string, limit?: number): Promise<PurgeLogEntry[]>;
  testRequest(input: TestRequestInput): Promise<TestRequestResult>;
  overview(slug: string, range: Range): Promise<Overview>;
  demoCall(input: DemoCallInput): Promise<DemoCallResult>;
}

export function maxStaleness(r: Pick<Rule, "ttlS" | "swrS" | "staleIfErrorS">): { normal: number; outage: number } {
  return {
    normal: r.ttlS + r.swrS,
    outage: r.ttlS + Math.max(r.swrS, r.staleIfErrorS),
  };
}
