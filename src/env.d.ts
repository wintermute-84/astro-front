declare namespace App {
  interface Locals {
    /** Set by the dashboard middleware after auth; undefined on public routes. */
    user?: import('./lib/dashboard/auth').DashboardUser;
    /** One-shot dashboard toast from the previous POST → redirect. */
    flash?: import('./lib/dashboard/edge').Flash | null;
    /** Set by the /app middleware from the app_session cookie; undefined on public /app routes. */
    customer?: import('./lib/app/session').Customer;
  }
}
