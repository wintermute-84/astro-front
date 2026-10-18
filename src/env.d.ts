declare namespace App {
  interface Locals {
    /** Set by the dashboard middleware after auth; undefined on public routes. */
    user?: import('./lib/dashboard/auth').DashboardUser;
  }
}
