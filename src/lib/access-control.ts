import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the list of property IDs the current user has access to.
 * - If the user is a super_admin, returns null (meaning all properties).
 * - Otherwise returns an array of property_ids from user_property_assignments.
 */
export async function getUserAccessiblePropertyIds(
  supabase: SupabaseClient
): Promise<string[] | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // Check user role
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  // If users table query fails (e.g. table doesn't exist or RLS blocks), treat as no special role
  if (profileError) {
    return [];
  }

  if (profile?.role === "super_admin") {
    return null; // null means unrestricted access
  }

  // Fetch accessible property IDs
  const { data: accessRows, error: accessError } = await supabase
    .from("user_property_assignments")
    .select("property_id")
    .eq("user_id", user.id);

  // If assignment table query fails, return empty access
  if (accessError || !accessRows || accessRows.length === 0) {
    return [];
  }

  return accessRows.map((row) => row.property_id);
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
