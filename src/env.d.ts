type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

interface Env {
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  CONTACT_TO_EMAIL: string;
  PUBLIC_TURNSTILE_SITE_KEY: string;
}
