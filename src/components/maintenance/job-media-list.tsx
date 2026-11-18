import { getTranslations } from "next-intl/server";
import type { JobAttachment } from "@/lib/maintenance/whatsapp";

/** A request's video and photos, full width, for the public job pages. */
export async function JobMediaList({ attachments }: { attachments: JobAttachment[] }) {
  const t = await getTranslations("maintenancePhotos");
  const photos = attachments.filter((a) => a.type === "photo");
  const videos = attachments.filter((a) => a.type === "video");

  return (
    <>
      {videos.map((video) => (
        <section key={video.url} className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
          <h2 className="px-4 py-3 text-[15px] font-semibold text-text-primary border-b border-border">
            {t("video")}
          </h2>
          <video src={video.url} controls playsInline preload="metadata" className="w-full bg-sunken" />
        </section>
      ))}
      {photos.map((photo, index) => (
        <a
          key={photo.url}
          href={photo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-surface border border-border rounded-xl shadow-card overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {/* Public storage URLs of arbitrary size; next/image has no loader for them. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={t("photoAlt", { number: index + 1, total: photos.length })}
            className="w-full h-auto bg-sunken"
            loading={index === 0 ? "eager" : "lazy"}
          />
          <span className="block px-4 py-3 text-[13px] font-semibold text-text-secondary tabular-nums ltr-nums">
            {t("photoCaption", { number: index + 1, total: photos.length })}
          </span>
        </a>
      ))}
    </>
  );
}
