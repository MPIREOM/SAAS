import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Get a downloadable URL for a document.
 * Handles both legacy full URLs (from getPublicUrl) and storage paths.
 * For storage paths, generates a signed URL valid for 1 hour.
 */
export async function getDocumentUrl(
  supabase: SupabaseClient,
  fileUrl: string
): Promise<string | null> {
  if (!fileUrl) return null;

  // Legacy: if it's already a full URL, return as-is
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }

  // New format: storage path — generate a signed URL
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(fileUrl, 3600); // 1 hour

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

/**
 * Batch-generate signed URLs for multiple documents.
 * Returns a map of file_url -> signed URL.
 */
export async function getDocumentUrls(
  supabase: SupabaseClient,
  documents: Array<{ file_url: string }>
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();

  // Separate legacy URLs from storage paths
  const storagePaths: string[] = [];
  for (const doc of documents) {
    if (!doc.file_url) continue;
    if (doc.file_url.startsWith("http://") || doc.file_url.startsWith("https://")) {
      urlMap.set(doc.file_url, doc.file_url);
    } else {
      storagePaths.push(doc.file_url);
    }
  }

  // Batch sign storage paths
  if (storagePaths.length > 0) {
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrls(storagePaths, 3600);

    if (data) {
      for (const item of data) {
        if (item.signedUrl && item.path) {
          urlMap.set(item.path, item.signedUrl);
        }
      }
    }
  }

  return urlMap;
}
