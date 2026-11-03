/** store.3dreamlab.com serves the prerendered /store/ pages at its root; the main host redirects there. */
export const MAIN_ORIGIN = 'https://3dreamlab.com';
export const STORE_HOST = 'store.3dreamlab.com';
export const STORE_ORIGIN = `https://${STORE_HOST}`;

export type HostRoute = { redirect: string } | { rewrite: string } | null;

const STORE_ROOT = /^\/(?:(fi|sv)\/?)?$/; // '/', '/fi', '/fi/', '/sv', '/sv/'
const MAIN_STORE = /^\/(?:(fi|sv)\/)?store(?:\/|$)/;

export function hostRoute(url: URL): HostRoute {
  const { hostname, pathname, search } = url;
  if (hostname === STORE_HOST) {
    const m = pathname.match(STORE_ROOT);
    if (m) return { rewrite: m[1] ? `/${m[1]}/store/` : '/store/' };
    // Assets, API and anything with a file extension stay on this host.
    if (pathname.startsWith('/api/') || pathname.startsWith('/_astro/') || /\.[a-z0-9]+$/i.test(pathname)) return null;
    return { redirect: MAIN_ORIGIN + pathname + search };
  }
  if (hostname === '3dreamlab.com') {
    const m = pathname.match(MAIN_STORE);
    if (m) return { redirect: `${STORE_ORIGIN}${m[1] ? `/${m[1]}/` : '/'}${search}` };
  }
  return null;
}
