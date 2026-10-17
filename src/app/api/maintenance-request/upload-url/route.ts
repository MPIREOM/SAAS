import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  ALLOWED_MIME,
  MAINTENANCE_MEDIA_BUCKET,
  MAX_FILE_SIZE,
  MAX_PHOTOS,
  MAX_VIDEOS,
} from "@/lib/maintenance/public-upload";

// Issues one-shot signed upload URLs so the tenant's browser can upload
// photos/videos directly to Supabase Storage. Vercel functions reject
// request bodies over 4.5MB, so media can't go through the submit route.
//
// UNAUTHENTICATED: bounded by a valid maintenance token, file count, size and
// MIME type. Paths are server-generated under the token's property_id.

const requestSchema = z.object({
  token: z.string().min(1),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        type: z.string(),
        size: z.number().int().positive(),
      })
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { token, files } = parsed.data;

  const photoCount = files.filter((f) => f.type.startsWith("image/")).length;
  const videoCount = files.filter((f) => f.type.startsWith("video/")).length;
  if (photoCount > MAX_PHOTOS || videoCount > MAX_VIDEOS) {
    return NextResponse.json(
      { error: `Up to ${MAX_PHOTOS} photos and ${MAX_VIDEOS} video allowed` },
      { status: 400 }
    );
  }
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `${file.name}: file exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
        { status: 413 }
      );
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `${file.name}: unsupported file type` },
        { status: 415 }
      );
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: tokenData, error: tokenError } = await supabase
    .from("maintenance_tokens")
    .select("property_id, expires_at")
    .eq("token", token)
    .eq("is_active", true)
    .not("property_id", "is", null)
    .single();

  if (tokenError || !tokenData?.property_id) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }
  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  const uploads: { path: string; token: string }[] = [];
  for (const file of files) {
    const ext = (file.name.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
    const path = `${tokenData.property_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage
      .from(MAINTENANCE_MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error(`[maintenance-upload-url] createSignedUploadUrl failed → ${error?.message}`);
      return NextResponse.json({ error: "Could not prepare upload" }, { status: 500 });
    }
    uploads.push({ path: data.path, token: data.token });
  }

  return NextResponse.json({ uploads });
}
