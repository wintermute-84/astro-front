import type { DemoCallInput } from './dashboard/contract.ts';

/** Strict parse of the public /api/demo body: exactly { via: 'origin'|'edge', outage: boolean }. */
export function parseDemoInput(body: unknown): DemoCallInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { via, outage, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length) return null;
  if (via !== 'origin' && via !== 'edge') return null;
  if (typeof outage !== 'boolean') return null;
  return { via, outage };
}
