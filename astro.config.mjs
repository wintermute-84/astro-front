// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://3dreamlab.com",
  integrations: [sitemap()],
  build: { inlineStylesheets: "always" },
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
