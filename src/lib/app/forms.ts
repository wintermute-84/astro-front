// Console forms → EdgeCustomerRPC inputs. The edge validates (single source of truth); these only
// coerce types and drop anything a customer may not send (no tenant, no headers, no secrets).
import type { CreateProjectInput, CustomerTestRequestInput, Plan, RuleInputCustomer, TenantView } from './contract.ts';
import { PLANS } from './contract.ts';
import { list } from '../dashboard/forms.ts';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => (str(fd, k) === '' ? NaN : Number(str(fd, k)));

/** Only a slug from the user's own project list counts; anything else falls back to the first project. */
export function pickProject(projects: TenantView[], asked: string | null): TenantView | null {
  return projects.find((p) => p.slug === asked) ?? projects[0] ?? null;
}

/** Site-side gate before createProject (the edge enforces it again): highest plan among own projects. */
export function canCreateProject(projects: TenantView[], allowlistPlan: Plan): boolean {
  const limit = Math.max(PLANS[allowlistPlan].projects, ...projects.map((p) => PLANS[p.plan].projects));
  return projects.length < limit;
}

export function projectFromForm(fd: FormData, plan: Plan): CreateProjectInput {
  return { name: str(fd, 'name'), originUrl: str(fd, 'originUrl'), plan };
}

export function customerRuleFromForm(fd: FormData): RuleInputCustomer {
  return {
    ...(str(fd, 'id') && { id: str(fd, 'id') }),
    originId: str(fd, 'originId'),
    method: str(fd, 'method') === 'POST' ? 'POST' : 'GET',
    pathPattern: str(fd, 'pathPattern'),
    ttlS: num(fd, 'ttlS'),
    swrS: num(fd, 'swrS'),
    staleIfErrorS: num(fd, 'staleIfErrorS'),
    vary: list(str(fd, 'vary')),
    tags: list(str(fd, 'tags')),
    enabled: fd.has('enabled'),
  };
}

/** GET or HEAD, path + query only: customers can't send headers or bodies through the test. */
export function customerTestFromForm(fd: FormData): CustomerTestRequestInput {
  return {
    method: str(fd, 'method') === 'HEAD' ? 'HEAD' : 'GET',
    path: str(fd, 'path'),
    query: Object.fromEntries(new URLSearchParams(str(fd, 'query').replace(/^\?/, ''))),
  };
}

/**
 * Test paths are appended to /t/<slug>; a "." or ".." segment (also %2e-encoded) would let URL
 * normalization step into another tenant, so refuse them here too.
 */
export function isSafeTestPath(path: string): boolean {
  return path.startsWith('/') && !path.includes('\\') && !path.split('/').some((seg) => /^(\.|%2e){1,2}$/i.test(seg));
}

/** Empty tags = whole project. */
export function purgeFromForm(fd: FormData): { tags?: string[] } {
  const tags = list(str(fd, 'tags'));
  return tags.length ? { tags } : {};
}

/** Usage bar numbers: percent clamped to 0-100, tone by how close to the limit. */
export function usageMeter(today: number, limit: number) {
  const pct = limit > 0 ? Math.min(100, Math.round((today / limit) * 100)) : 100;
  return { pct, tone: pct >= 100 ? 'err' : pct >= 80 ? 'warn' : 'ok' } as const;
}
