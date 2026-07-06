import { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface AuthContext {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: string | null;
  /** null means unrestricted access (super_admin). */
  propertyIds: string[] | null;
}

/**
 * Request-scoped auth context shared by the layout and every page/helper
 * rendered in the same request.
 *
 * Performance notes:
 * - The session is read via getClaims(), which verifies the JWT locally
 *   instead of round-tripping to the Supabase Auth server like getUser().
 * - The profile row and property assignments load in parallel.
 * - React's cache() memoizes the result per request, so callers that used
 *   to each repeat the getUser -> role -> assignments waterfall (layout,
 *   page, data helpers) now share a single lookup.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const [profileRes, assignmentsRes] = await Promise.all([
    supabase
      .from("users")
      .select("full_name, role")
      .eq("id", claims.sub)
      .single(),
    supabase
      .from("user_property_assignments")
      .select("property_id")
      .eq("user_id", claims.sub),
  ]);

  const role = profileRes.data?.role ?? null;

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    fullName: profileRes.data?.full_name ?? null,
    role,
    propertyIds:
      role === "super_admin"
        ? null // null means unrestricted access
        : (assignmentsRes.data ?? []).map((row) => row.property_id as string),
  };
});

/**
 * Returns the list of property IDs the current user has access to.
 * - If the user is a super_admin, returns null (meaning all properties).
 * - Otherwise returns an array of property_ids from user_property_assignments.
 *
 * The client parameter is kept for call-site compatibility but is no longer
 * used — the lookup goes through the request-cached getAuthContext().
 */
export async function getUserAccessiblePropertyIds(
  supabase?: SupabaseClient
): Promise<string[] | null> {
  void supabase;
  const context = await getAuthContext();
  if (!context) return [];
  return context.propertyIds;
}

/**
 * Adds an `.in()` filter to a Supabase query to restrict results
 * to the given property IDs.
 *
 * If propertyIds is null (super_admin), the query is returned unchanged.
 */
export function filterByProperties<T>(
  query: T,
  propertyIds: string[] | null,
  column: string = "property_id"
): T {
  if (propertyIds === null) {
    return query;
  }

  // If the user has no property access, use an impossible filter
  // to ensure zero results are returned.
  if (propertyIds.length === 0) {
    return (query as Record<string, unknown> & { in: (col: string, vals: string[]) => T }).in(
      column,
      ["__no_access__"]
    );
  }

  return (query as Record<string, unknown> & { in: (col: string, vals: string[]) => T }).in(
    column,
    propertyIds
  );
}
