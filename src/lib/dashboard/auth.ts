// The one place dashboard auth is decided. M5 swaps the body for a Cloudflare
// Access JWT check (jose); callers stay the same.
const enc = new TextEncoder();
const sha256 = (s: string) => crypto.subtle.digest('SHA-256', enc.encode(s));

export async function checkBasicAuth(header: string | null, user?: string, pass?: string): Promise<boolean> {
  if (!user || !pass || !header?.startsWith('Basic ')) return false;
  let given: string;
  try {
    given = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }
  // Hash both sides: fixed 32-byte digests, compared without early exit.
  const [a, b] = (await Promise.all([sha256(given), sha256(`${user}:${pass}`)])).map((d) => new Uint8Array(d));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
