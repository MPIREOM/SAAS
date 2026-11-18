import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { MAINTENANCE_MEDIA_BUCKET, MAX_FILE_SIZE } from "@/lib/maintenance/public-upload";
import {
  ADMIN_JOB_DONE_TEMPLATE,
  adminJobDoneParams,
  categoryLabel,
  requestRef,
} from "@/lib/maintenance/whatsapp";
import { loadRequest, notifyTenantOfStatus, type LoadedRequest } from "@/lib/maintenance/workflow";
import { DONE_PHOTO_MIME, MAX_DONE_PHOTOS, donePhotoPrefix } from "@/lib/maintenance/job-page";

export const maxDuration = 60;

// Public (technician job page, migration 056): the watchman reports progress
// on the job his WhatsApp card links to.
//
//   start      open -> in_progress; the tenant gets the usual status update
//   upload_url signed upload URLs for photos of the finished work
//   done       flags the job finished and alerts the admins. The request stays
//              in_progress until staff confirm it in the dashboard, which is
//              when the tenant is told.
//
// UNAUTHENTICATED: bounded by the request's technician_token, which only the
// job card carries. Each step is claimed with a conditional update, so a
// double tap never sends a second message.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const photoRef = z.object({ path: z.string().min(1).max(300) });

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({
    action: z.literal("upload_url"),
    files: z
      .array(
        z.object({
          name: z.string().min(1).max(255),
          type: z.string(),
          size: z.number().int().positive(),
        })
      )
      .min(1)
      .max(MAX_DONE_PHOTOS),
  }),
  z.object({
    action: z.literal("done"),
    photos: z.array(photoRef).max(MAX_DONE_PHOTOS).optional(),
  }),
]);

async function addNote(db: SupabaseClient, request: LoadedRequest, note: string) {
  const { error } = await db.from("maintenance_notes").insert({
    request_id: request.id,
    note,
    created_by_name: request.assignedToName || "Technician",
  });
  if (error) console.error("[maintenance-job] note failed", error.message);
}

/** Verify browser-uploaded completion photos and attach them to the request. */
async function attachDonePhotos(db: SupabaseClient, request: LoadedRequest, paths: string[]): Promise<number> {
  if (!request.propertyId || paths.length === 0) return 0;
  const pattern = new RegExp(`^${request.propertyId}/${donePhotoPrefix(request.id)}[a-z0-9]+\\.[a-z0-9]+$`);
  const rows: { request_id: string; file_url: string; file_name: string; file_type: string; file_size: number }[] = [];

  for (const path of paths) {
    if (!pattern.test(path)) continue;
    const objectName = path.slice(path.indexOf("/") + 1);
    const { data: listed } = await db.storage
      .from(MAINTENANCE_MEDIA_BUCKET)
      .list(request.propertyId, { search: objectName, limit: 1 });
    const object = listed?.find((o) => o.name === objectName);
    if (!object) continue;

    // Size and type come from storage, not from the client.
    const mimeType = String(object.metadata?.mimetype ?? "");
    const size = Number(object.metadata?.size ?? 0);
    if (!DONE_PHOTO_MIME.has(mimeType) || size > MAX_FILE_SIZE) {
      await db.storage.from(MAINTENANCE_MEDIA_BUCKET).remove([path]);
      continue;
    }
    const { data: url } = db.storage.from(MAINTENANCE_MEDIA_BUCKET).getPublicUrl(path);
    const ext = objectName.split(".").pop();
    rows.push({
      request_id: request.id,
      file_url: url.publicUrl,
      file_name: `Completed work ${rows.length + 1}.${ext}`,
      file_type: "photo",
      file_size: size,
    });
  }

  if (rows.length === 0) return 0;
  const { error } = await db.from("maintenance_attachments").insert(rows);
  if (error) {
    console.error("[maintenance-job] attachment insert failed", error.message);
    return 0;
  }
  return rows.length;
}

async function alertAdmins(db: SupabaseClient, request: LoadedRequest, origin: string, photoCount: number) {
  const { data: recipients } = await db
    .from("admin_notification_recipients")
    .select("name, email, phone, notify_email, notify_whatsapp")
    .eq("is_active", true);
  if (!recipients?.length) return;

  // WhatsApp only, as for the other in-flight updates; the new-request alert
  // is the one that also goes by email.
  const whatsappOnly = recipients.map((r) => ({ ...r, notify_email: false }));
  const { notifyAdmins } = await import("@/lib/notifications/admin-notify");
  const markedBy = request.assignedToName || "Technician";
  const dashboardLink = `${origin}/en/maintenance/${request.id}`;
  const { ctx } = request;

  await notifyAdmins(whatsappOnly, {
    subject: "",
    emailHtml: "",
    whatsappText: [
      `✅ *Maintenance job #${requestRef(request.id)} marked as done*`,
      "",
      `📍 *Property:* ${ctx.propertyName}`,
      `🏠 *Unit:* ${ctx.unitNumber}`,
      `🔧 *Category:* ${categoryLabel(ctx.category)}`,
      `👷 *Marked by:* ${markedBy}`,
      `📎 *Photos of the finished work:* ${photoCount || "None"}`,
      "",
      "Please check the work and mark the request resolved to inform the tenant.",
      "",
      `🔗 ${dashboardLink}`,
    ].join("\n"),
    whatsappTemplate: {
      name: ADMIN_JOB_DONE_TEMPLATE.name,
      languageCode: ADMIN_JOB_DONE_TEMPLATE.language,
      parameters: adminJobDoneParams(ctx, markedBy, dashboardLink),
      fallbackToText: true,
    },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const input = parsed.data;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await db
    .from("maintenance_requests")
    .select("id")
    .eq("technician_token", token)
    .maybeSingle();
  const job = row ? await loadRequest(db, row.id as string) : null;
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date().toISOString();

  if (input.action === "start") {
    const { data: claimed, error } = await db
      .from("maintenance_requests")
      .update({ status: "in_progress", technician_started_at: now })
      .eq("id", job.id)
      .eq("status", "open")
      .select("id");
    if (error) {
      console.error("[maintenance-job] start failed", error.message);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
    if (claimed?.length) {
      await addNote(db, job, "Work started (marked on the job page).");
      try {
        await notifyTenantOfStatus(job, "in_progress");
      } catch (err) {
        console.error("[maintenance-job] tenant update failed", err);
      }
    }
    // Already started (second tap, or staff moved it): nothing more to do.
    return NextResponse.json({ ok: true });
  }

  if (job.status !== "in_progress") {
    return NextResponse.json({ error: "not_in_progress" }, { status: 409 });
  }

  if (input.action === "upload_url") {
    if (!job.propertyId) return NextResponse.json({ error: "server_error" }, { status: 500 });
    for (const file of input.files) {
      if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "file_too_large" }, { status: 413 });
      if (!DONE_PHOTO_MIME.has(file.type)) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
    }
    const uploads: { path: string; token: string }[] = [];
    for (const file of input.files) {
      const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "jpg";
      const path = `${job.propertyId}/${donePhotoPrefix(job.id)}${Date.now().toString(36)}${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await db.storage.from(MAINTENANCE_MEDIA_BUCKET).createSignedUploadUrl(path);
      if (error || !data) {
        console.error("[maintenance-job] createSignedUploadUrl failed", error?.message);
        return NextResponse.json({ error: "server_error" }, { status: 500 });
      }
      uploads.push({ path: data.path, token: data.token });
    }
    return NextResponse.json({ uploads });
  }

  // done
  const { data: claimed, error } = await db
    .from("maintenance_requests")
    .update({ technician_done_at: now })
    .eq("id", job.id)
    .eq("status", "in_progress")
    .is("technician_done_at", null)
    .select("id");
  if (error) {
    console.error("[maintenance-job] done failed", error.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (claimed?.length) {
    const photoCount = await attachDonePhotos(db, job, (input.photos ?? []).map((p) => p.path));
    await addNote(
      db,
      job,
      photoCount > 0
        ? `Work marked as finished on the job page, with ${photoCount} photo${photoCount === 1 ? "" : "s"}. Waiting for staff to confirm.`
        : "Work marked as finished on the job page. Waiting for staff to confirm."
    );
    try {
      await alertAdmins(db, job, request.nextUrl.origin, photoCount);
    } catch (err) {
      console.error("[maintenance-job] admin alert failed", err);
    }
  }
  return NextResponse.json({ ok: true });
}
