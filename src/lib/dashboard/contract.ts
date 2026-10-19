// Copied verbatim from /var/www/edge-cache/src/contract.ts (edge-cache worker, entrypoints EdgeCacheRPC + EdgeCustomerRPC).
// Keep in sync by re-copying; don't edit here.
// Public RPC contract of the edge-cache worker: owner entrypoint `EdgeCacheRPC` (EdgeCacheApi) and
// customer entrypoint `EdgeCustomerRPC` (CustomerApi, bottom of the file).
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
  /** added (C3) */
  kind: TenantKind;
  plan: Plan;
  status: TenantStatus;
  /** Effective limit: per-tenant override, else the plan default. Only enforced for customer tenants. */
  dailyLimit: number;
  upgradeRequestedPlan: "starter" | "pro" | null;
  memberCount: number;
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
  /** added (C3). dailyLimit: omitted = unchanged, null = back to the plan default. Clears a pending upgrade request. */
  setPlan(slug: string, plan: Plan, dailyLimit?: number | null): Promise<Tenant>;
  /** added (C3). A customer tenant can only become active with a verified origin. */
  setStatus(slug: string, status: "active" | "suspended"): Promise<Tenant>;
}

export function maxStaleness(r: Pick<Rule, "ttlS" | "swrS" | "staleIfErrorS">): { normal: number; outage: number } {
  return {
    normal: r.ttlS + r.swrS,
    outage: r.ttlS + Math.max(r.swrS, r.staleIfErrorS),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Customer surface: named entrypoint `EdgeCustomerRPC`.
// Service binding: { binding: "EDGE_CUSTOMER", service: "edge-cache", entrypoint: "EdgeCustomerRPC" }
// Every method except createProject/listMyProjects takes (userId, slug) and checks tenant_membership in the
// edge D1. Unknown slug, not a member and deleted tenant all reject with the same Error message NOT_FOUND.
// Invalid input rejects with a ValidationError message. Times are ISO 8601 strings.
// ---------------------------------------------------------------------------------------------------------

export type TenantKind = "owner" | "customer";
export type Plan = "free" | "starter" | "pro";
export type TenantStatus = "pending_verification" | "active" | "suspended";

export interface PlanLimits {
  dailyLimit: number;
  /** Projects a user may own; the highest limit among the user's projects applies. */
  projects: number;
  origins: number;
  rules: number;
  metricsDays: number;
  purgesPerDay: number;
  /** POST read rules allowed. GET (and HEAD, served from GET rules) always are. */
  postRead: boolean;
}

export const PLANS: Record<Plan, PlanLimits> = {
  free: { dailyLimit: 1000, projects: 1, origins: 1, rules: 3, metricsDays: 7, purgesPerDay: 3, postRead: false },
  starter: { dailyLimit: 10_000, projects: 1, origins: 3, rules: 10, metricsDays: 30, purgesPerDay: 200, postRead: true },
  pro: { dailyLimit: 100_000, projects: 3, origins: 10, rules: 30, metricsDays: 30, purgesPerDay: 1000, postRead: true },
};

/** Error message for every "no such project for this user" case. Compare `err.message === NOT_FOUND`. */
export const NOT_FOUND = "not found";

export interface TenantView {
  id: string;
  slug: string;
  name: string;
  kind: "customer";
  plan: Plan;
  status: TenantStatus;
  /** Effective limit (override or plan default). */
  dailyLimit: number;
  createdAt: string;
  upgradeRequestedPlan: "starter" | "pro" | null;
}

export interface OriginView {
  id: string;
  baseUrl: string;
  verifiedAt: string | null;
  verifiedHost: string | null;
}

/** Either proof works: DNS TXT record, or the token served at the well-known URL. */
export interface Verification {
  dnsTxtName: string; // _3dreamlab-verify.<host>
  dnsTxtValue: string; // 3dreamlab-verify=<token>
  wellKnownUrl: string; // https://<host>/.well-known/3dreamlab-verify.txt
  wellKnownBody: string; // <token>
}

export interface Usage {
  today: number;
  limit: number;
  resetAt: string; // next UTC midnight
}

export interface ProjectDetail {
  tenant: TenantView;
  origins: OriginView[];
  rules: Rule[];
  usage: Usage;
}

export interface CreateProjectInput {
  name: string;
  originUrl: string;
  /** Requested plan. Projects always start on free; starter/pro is recorded as an upgrade request for the owner. */
  plan?: Plan;
}

export interface CreateProjectResult {
  tenant: TenantView;
  origin: OriginView;
  /** The token is stored hashed: this (and newVerification) is the only time it is returned. */
  verification: Verification;
}

export interface VerifyResult {
  verified: boolean;
  method?: "dns" | "well-known";
  detail?: string;
}

/** No secretRef/authHeaderName, no postRead flag (POST rules are always read rules). */
export interface RuleInputCustomer {
  id?: string; // omit to create
  originId: string;
  method: "GET" | "POST";
  pathPattern: string;
  ttlS: number;
  swrS?: number;
  staleIfErrorS?: number;
  vary?: string[];
  tags?: string[];
  enabled?: boolean;
}

export interface CustomerTestRequestInput {
  method: "GET" | "HEAD";
  path: string;
  query?: Record<string, string>;
}

export interface CustomerTestRequestResult {
  key: string | null;
  /** QUOTA = refused with 429 because the daily limit is used up. */
  outcome: Outcome | "QUOTA";
  status: number;
  originMs: number;
  totalMs: number;
}

export type PurgeResult = PurgeLogEntry;

export interface ProjectExport {
  exportedAt: string;
  tenant: TenantView;
  origins: OriginView[];
  rules: Rule[];
  purgeLog: PurgeLogEntry[];
  usage: Usage;
}

export interface CustomerApi {
  createProject(userId: string, input: CreateProjectInput): Promise<CreateProjectResult>;
  getProject(userId: string, slug: string): Promise<ProjectDetail>;
  listMyProjects(userId: string): Promise<TenantView[]>;
  /** added: issues a fresh token (the old one stops working). For lost tokens and after a host change. */
  newVerification(userId: string, slug: string, originId: string): Promise<Verification>;
  verifyOrigin(userId: string, slug: string, originId: string): Promise<VerifyResult>;
  /** A host change clears verification (the project goes back to pending_verification if no verified origin is left). */
  updateOrigin(userId: string, slug: string, originId: string, input: { originUrl: string }): Promise<OriginView>;
  upsertRule(userId: string, slug: string, input: RuleInputCustomer): Promise<Rule>;
  deleteRule(userId: string, slug: string, ruleId: string): Promise<{ deleted: true }>;
  /** Counts against the daily quota like any request. */
  testRequest(userId: string, slug: string, input: CustomerTestRequestInput): Promise<CustomerTestRequestResult>;
  /** tags omitted or empty = whole project ("*"). Limited to PLANS[plan].purgesPerDay per UTC day. */
  purge(userId: string, slug: string, input: { tags?: string[] }): Promise<PurgeResult>;
  /** range is clamped to the plan's metricsDays (free: 30d → 7d); the returned `range` says which applied. */
  overview(userId: string, slug: string, range: Range): Promise<Overview>;
  usage(userId: string, slug: string): Promise<Usage>;
  requestUpgrade(userId: string, slug: string, plan: "starter" | "pro"): Promise<{ requestedAt: string }>;
  exportProject(userId: string, slug: string): Promise<ProjectExport>;
  /** Soft delete: config and memberships removed, cache purged, the slug is never reused. */
  deleteProject(userId: string, slug: string): Promise<{ deletedAt: string }>;
}
