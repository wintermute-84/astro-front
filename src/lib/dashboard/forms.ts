// Form fields are named like the contract fields, so mapping is mostly type coercion.
// Validation stays in the edge-cache worker (single source); its messages are shown inline.
import type { OriginInput, RuleInput, TenantInput, TestRequestInput } from './contract.ts';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
/** '' → NaN, so the worker reports "must be an integer" instead of silently using 0. */
const num = (fd: FormData, k: string) => (str(fd, k) === '' ? NaN : Number(str(fd, k)));
/** Comma- or newline-separated list, blanks dropped. */
export const list = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

export function tenantFromForm(fd: FormData): TenantInput {
  return { slug: str(fd, 'slug'), name: str(fd, 'name'), corsOrigins: list(str(fd, 'corsOrigins')), enabled: fd.has('enabled') };
}

export function originFromForm(fd: FormData, tenant: string): OriginInput {
  return {
    tenant,
    ...(str(fd, 'id') && { id: str(fd, 'id') }),
    baseUrl: str(fd, 'baseUrl'),
    timeoutMs: num(fd, 'timeoutMs'),
    authHeaderName: opt(fd, 'authHeaderName'),
    secretRef: opt(fd, 'secretRef'),
  };
}

export function ruleFromForm(fd: FormData, tenant: string): RuleInput {
  return {
    tenant,
    ...(str(fd, 'id') && { id: str(fd, 'id') }),
    originId: str(fd, 'originId'),
    method: str(fd, 'method') as RuleInput['method'],
    pathPattern: str(fd, 'pathPattern'),
    ttlS: num(fd, 'ttlS'),
    swrS: num(fd, 'swrS'),
    staleIfErrorS: num(fd, 'staleIfErrorS'),
    vary: list(str(fd, 'vary')),
    postRead: fd.has('postRead'),
    tags: list(str(fd, 'tags')),
    enabled: fd.has('enabled'),
  };
}

/** Test panel: `query` is a raw query string ("sku=A&x=1"), headers one "name: value" per line. */
export function testRequestFromForm(fd: FormData): TestRequestInput {
  const method = str(fd, 'method') as TestRequestInput['method'];
  const headers: Record<string, string> = {};
  for (const line of str(fd, 'headers').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  const body = str(fd, 'body');
  return {
    slug: str(fd, 'slug'),
    method,
    path: str(fd, 'path'),
    query: Object.fromEntries(new URLSearchParams(str(fd, 'query').replace(/^\?/, ''))),
    headers,
    ...(method === 'POST' && body && { body }),
  };
}

// Worker messages that don't name the field literally.
const ALIASES: [RegExp, string][] = [
  [/CORS origin/, 'corsOrigins'],
  [/^tag /, 'tags'],
  [/^vary entry /, 'vary'],
];

/** Which form field an RPC validation message is about, else null (shown above the form). */
export function fieldOf(message: string, fields: readonly string[]): string | null {
  // Aliases first: "vary entry … query:<name>" must not land on a field called name.
  const alias = ALIASES.find(([re, f]) => re.test(message) && fields.includes(f));
  if (alias) return alias[1];
  return fields.find((f) => new RegExp(`\\b${f}\\b`).test(message)) ?? null;
}

