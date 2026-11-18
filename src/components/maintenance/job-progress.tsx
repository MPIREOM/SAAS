"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Play, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { MAX_DONE_PHOTOS, type JobLabel, type JobStage } from "@/lib/maintenance/job-page";
import { MAINTENANCE_MEDIA_BUCKET } from "@/lib/maintenance/public-upload";

type LabelKey =
  | "stageNew"
  | "stageWorking"
  | "stageAwaiting"
  | "stageCompleted"
  | "startWork"
  | "startHint"
  | "markDone"
  | "doneHint"
  | "awaitingHint"
  | "addPhoto"
  | "removePhoto"
  | "saveFailed"
  | "uploadFailed";

interface Props {
  token: string;
  stage: JobStage;
  /** Resolved by the server page, with the Bengali line for the watchman. */
  labels: Record<LabelKey, JobLabel>;
}

// Some mobile browsers leave File.type empty; fall back to the extension.
function mimeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
}

function Lines({ label }: { label: JobLabel }) {
  return (
    <>
      {label.sub && (
        <span lang="bn" className="block">
          {label.sub}
        </span>
      )}
      <span className="block">{label.main}</span>
    </>
  );
}

/** One line for places that can't stack two (button text, aria-label). */
function inline(label: JobLabel): string {
  return label.sub ? `${label.sub} · ${label.main}` : label.main;
}

const STAGE_BADGE: Record<JobStage, { variant: "warning" | "default" | "info" | "success"; label: LabelKey }> = {
  new: { variant: "warning", label: "stageNew" },
  working: { variant: "default", label: "stageWorking" },
  awaiting_confirmation: { variant: "info", label: "stageAwaiting" },
  completed: { variant: "success", label: "stageCompleted" },
};

/** The technician's "Start work" then "Work finished" control on the job page (056). */
export function JobProgress({ token, stage, labels }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<JobLabel | null>(null);

  // Release the preview URLs when the page goes away.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const post = async (body: unknown) => {
    const res = await fetch(`/api/maintenance-job/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as { uploads?: { path: string; token: string }[] };
  };

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message === "upload" ? labels.uploadFailed : labels.saveFailed);
    }
    setBusy(false);
  };

  const start = () => run(async () => void (await post({ action: "start" })));

  const finish = () =>
    run(async () => {
      let uploaded: { path: string }[] = [];
      if (photos.length > 0) {
        const meta = photos.map(({ file }) => ({ name: file.name, type: mimeOf(file), size: file.size }));
        let uploads: { path: string; token: string }[] | undefined;
        try {
          ({ uploads } = await post({ action: "upload_url", files: meta }));
        } catch {
          throw new Error("upload");
        }
        if (!uploads || uploads.length !== photos.length) throw new Error("upload");
        const storage = createClient().storage.from(MAINTENANCE_MEDIA_BUCKET);
        const results = await Promise.all(
          photos.map(({ file }, i) =>
            storage.uploadToSignedUrl(uploads[i].path, uploads[i].token, file, { contentType: meta[i].type })
          )
        );
        if (results.some((r) => r.error)) throw new Error("upload");
        uploaded = uploads.map((u) => ({ path: u.path }));
      }
      await post({ action: "done", photos: uploaded });
    });

  const addPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).slice(0, MAX_DONE_PHOTOS - photos.length);
    const added = picked.map((file) => ({ file, preview: URL.createObjectURL(file) }));
    previews.current.push(...added.map((p) => p.preview));
    setPhotos((current) => [...current, ...added]);
    e.target.value = "";
  };

  const badge = STAGE_BADGE[stage];
  const hint = "text-[13px] leading-relaxed text-text-secondary";

  return (
    <div className="space-y-4">
      <Badge variant={badge.variant} className="h-auto whitespace-normal py-1.5 text-start">
        <span>
          <Lines label={labels[badge.label]} />
        </span>
      </Badge>

      {stage === "new" && (
        <>
          <p className={hint}>
            <Lines label={labels.startHint} />
          </p>
          <Button type="button" size="lg" className="h-auto min-h-14 w-full whitespace-normal py-2" loading={busy} onClick={start}>
            <Play aria-hidden="true" className="h-5 w-5" />
            <span className="min-w-0 text-start">
              <Lines label={labels.startWork} />
            </span>
          </Button>
        </>
      )}

      {stage === "working" && (
        <>
          {photos.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <li
                  key={photo.preview}
                  className="relative aspect-square overflow-hidden rounded-lg border border-border bg-sunken"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview */}
                  <img src={photo.preview} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${inline(labels.removePhoto)} ${index + 1}`}
                    onClick={() => setPhotos((current) => current.filter((p) => p.preview !== photo.preview))}
                    className="absolute end-1 top-1 grid h-10 w-10 place-items-center rounded-full border border-border-strong bg-surface text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < MAX_DONE_PHOTOS && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-auto min-h-12 w-full whitespace-normal py-2"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <Camera aria-hidden="true" className="h-5 w-5" />
              <span className="min-w-0 text-start">
                <Lines label={labels.addPhoto} />
              </span>
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            onChange={addPhotos}
            className="hidden"
          />
          <p className={hint}>
            <Lines label={labels.doneHint} />
          </p>
          <Button type="button" size="lg" className="h-auto min-h-14 w-full whitespace-normal py-2" loading={busy} onClick={finish}>
            <Check aria-hidden="true" className="h-5 w-5" />
            <span className="min-w-0 text-start">
              <Lines label={labels.markDone} />
            </span>
          </Button>
        </>
      )}

      {stage === "awaiting_confirmation" && (
        <p className={hint}>
          <Lines label={labels.awaitingHint} />
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <Lines label={error} />
        </Alert>
      )}
    </div>
  );
}
