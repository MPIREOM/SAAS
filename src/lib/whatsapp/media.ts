// Helpers for downloading inbound media (e.g. receipt photos) from the
// Meta Cloud API and stashing them in Supabase Storage so the agent can
// later attach them to an expense.

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

type MediaMetadata = {
  url: string;
  mimeType: string;
  fileSize: number;
};

// Step 1 of Meta's media download flow: fetch the metadata + temporary
// download URL by media id. The URL is short-lived (≈5 minutes) and
// requires the bearer token to access.
export async function getWhatsAppMediaUrl(
  mediaId: string,
): Promise<MediaMetadata | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("[WhatsApp Media] WHATSAPP_ACCESS_TOKEN not configured");
    return null;
  }

  const res = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error(
      `[WhatsApp Media] metadata fetch failed for ${mediaId}: HTTP ${res.status}`,
    );
    return null;
  }
  const data = (await res.json()) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
  };
  if (!data.url) return null;
  return {
    url: data.url,
    mimeType: data.mime_type || "application/octet-stream",
    fileSize: data.file_size || 0,
  };
}

export type DownloadedMedia = {
  bytes: ArrayBuffer;
  mimeType: string;
  fileSize: number;
};

// Step 2: actually download the file bytes. The Authorization header is
// still required even on the temporary URL.
export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<DownloadedMedia | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) return null;

  const meta = await getWhatsAppMediaUrl(mediaId);
  if (!meta) return null;

  const res = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error(
      `[WhatsApp Media] download failed for ${mediaId}: HTTP ${res.status}`,
    );
    return null;
  }
  const bytes = await res.arrayBuffer();
  return {
    bytes,
    mimeType: meta.mimeType,
    fileSize: meta.fileSize || bytes.byteLength,
  };
}

// Map a Meta-supplied mime type to a sensible file extension. Defaults to
// "bin" so we never produce an empty extension.
export function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}
