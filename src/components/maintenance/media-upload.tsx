"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Camera, Video, X, ImagePlus } from "lucide-react";

interface MediaUploadProps {
  photos: File[];
  video: File | null;
  onPhotosChange: (files: File[]) => void;
  onVideoChange: (file: File | null) => void;
  t: (key: string) => string;
}

export function MediaUpload({
  photos,
  video,
  onPhotosChange,
  onVideoChange,
  t,
}: MediaUploadProps) {
  const tc = useTranslations("common");
  const tm = useTranslations("maintenance");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 5 - photos.length;
    const newFiles = files.slice(0, remaining);

    // Generate previews
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoPreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });

    onPhotosChange([...photos, ...newFiles]);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoPreview) URL.revokeObjectURL(videoPreview);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    onVideoChange(file);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    const newPreviews = photoPreviews.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
    setPhotoPreviews(newPreviews);
  };

  const removeVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    onVideoChange(null);
  };

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    const remaining = 5 - photos.length;
    const newFiles = files.slice(0, remaining);

    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoPreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });

    onPhotosChange([...photos, ...newFiles]);
  };

  const handleVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith("video/")
    );
    if (!file) return;
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    onVideoChange(file);
  };

  return (
    <div className="space-y-6">
      {/* Photos */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Camera className="h-4 w-4 text-accent" aria-hidden="true" />
          <span className="text-sm font-medium text-text-primary tracking-tight">
            {t("addPhotos")}
          </span>
          <span className="text-xs text-text-secondary font-mono ltr-nums">
            ({photos.length}/5)
          </span>
        </div>
        <p className="text-xs text-text-secondary mb-3">{t("photosHelp")}</p>

        {/* Photo previews */}
        {photoPreviews.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
            {photoPreviews.map((src, i) => (
              <div
                key={i}
                className="relative group aspect-square rounded-lg overflow-hidden border border-border/60 bg-surface-elevated transition-all duration-200 hover:border-accent/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local FileReader data-URL preview; next/image cannot optimize blob/data URLs */}
                <img
                  src={src}
                  alt={`${tm("photos")} ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  aria-label={tc("delete")}
                  className="absolute top-1 end-1 h-6 w-6 bg-background/70 backdrop-blur-sm border border-border/60 rounded-full flex items-center justify-center cursor-pointer opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-opacity"
                >
                  <X aria-hidden="true" className="h-3 w-3 text-text-primary" />
                </button>
              </div>
            ))}
          </div>
        )}

        {photos.length < 5 && (
          <div
            role="button"
            tabIndex={0}
            onDrop={handlePhotoDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => photoInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); photoInputRef.current?.click(); } }}
            className="border-2 border-dashed border-border/70 rounded-xl p-6 text-center cursor-pointer bg-surface-elevated/20 hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-all duration-200"
          >
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10" aria-hidden="true">
              <ImagePlus className="h-4 w-4 text-accent" />
            </div>
            <p className="text-xs text-text-secondary">{t("dragPhotos")}</p>
          </div>
        )}

        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          capture="environment"
          onChange={handlePhotoSelect}
          className="hidden"
        />
      </div>

      {/* Video */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Video className="h-4 w-4 text-accent" aria-hidden="true" />
          <span className="text-sm font-medium text-text-primary tracking-tight">
            {t("addVideo")}
          </span>
        </div>
        <p className="text-xs text-text-secondary mb-3">{t("videoHelp")}</p>

        {videoPreview ? (
          <div className="relative rounded-xl overflow-hidden border border-border/60">
            <video
              src={videoPreview}
              controls
              className="w-full max-h-48 bg-black"
            />
            <button
              type="button"
              onClick={removeVideo}
              aria-label={tc("delete")}
              className="absolute top-2 end-2 h-7 w-7 bg-background/70 backdrop-blur-sm border border-border/60 rounded-full flex items-center justify-center cursor-pointer hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5 text-text-primary" />
            </button>
            <div className="px-3 py-2 bg-surface-elevated text-xs text-text-secondary flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{video?.name}</span>
              <span className="shrink-0 font-mono ltr-nums">
                {video ? `${(video.size / 1024 / 1024).toFixed(1)} MB` : ""}
              </span>
            </div>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onDrop={handleVideoDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => videoInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); videoInputRef.current?.click(); } }}
            className="border-2 border-dashed border-border/70 rounded-xl p-6 text-center cursor-pointer bg-surface-elevated/20 hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-all duration-200"
          >
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10" aria-hidden="true">
              <Video className="h-4 w-4 text-accent" />
            </div>
            <p className="text-xs text-text-secondary">{t("dragVideo")}</p>
          </div>
        )}

        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/mov"
          capture="environment"
          onChange={handleVideoSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}
