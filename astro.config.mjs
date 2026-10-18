// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://3dreamlab.com",
  integrations: [sitemap()],
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
