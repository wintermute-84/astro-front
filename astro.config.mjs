// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://3dreamlab.com",
  integrations: [
    react(),
    // /store/ is served from store.3dreamlab.com. /demo stays unlisted (noindex, no nav link) until the owner's first-audit gate.
    sitemap({ filter: (page) => !/^\/((fi|sv)\/)?(dashboard|demo|denied|app|store)(\/|$)/.test(new URL(page).pathname) }),
  ],
  build: { inlineStylesheets: "always" },
  session: false,
  compressHTML: true,
  i18n: {
    locales: ["en", "fi", "sv"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  adapter: cloudflare({ imageService: "passthrough" }),
});
