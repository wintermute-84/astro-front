// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://3dreamlab.com",
  integrations: [
    react(),
    sitemap({ filter: (page) => !new URL(page).pathname.startsWith('/dashboard') }),
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
