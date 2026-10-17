// Shared limits for the public (unauthenticated) tenant maintenance form.
//
// Files are uploaded straight from the browser to Supabase Storage via
// signed upload URLs — they never pass through a Vercel function, whose
// request body is capped at 4.5MB (a phone video is easily 40MB+).

export const MAINTENANCE_MEDIA_BUCKET = "maintenance-media";

export const MAX_PHOTOS = 5;
export const MAX_VIDEOS = 1;
export const MAX_FILES = MAX_PHOTOS + MAX_VIDEOS;
// Matches the bucket's file_size_limit (migration 020).
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export interface UploadedAttachment {
  path: string;
  name: string;
  type: string;
  size: number;
}
