import { Notice } from "./Notice";

/** Shown in place of data-backed content when the database is not configured. */
export function DatabaseUnavailable() {
  return (
    <Notice tone="warning" title="The question library isn't available on this server yet">
      The database connection has not been configured. An administrator needs to add the Supabase settings described in
      the README.
    </Notice>
  );
}
