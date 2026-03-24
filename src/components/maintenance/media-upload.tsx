"use client";

import { useState, useRef } from "react";
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
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    onVideoChange(file);
  };

  return (
    <div className="space-y-5">
      {/* Photos */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Camera className="h-4 w-4 text-accent" aria-hidden="true" />
          <label className="text-sm font-medium text-text-primary">
            {t("addPhotos")}
          </label>
          <span className="text-xs text-text-secondary">
            ({photos.length}/5)
          </span>
        </div>
        <p className="text-xs text-text-secondary mb-3">{t("photosHelp")}</p>

        {/* Photo previews */}
        {photoPreviews.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
            {photoPreviews.map((src, i) => (
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                <img
                  src={src}
                  alt={`Photo ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 h-5 w-5 bg-surface/80 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3 text-text-primary" />
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
            className="border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors"
          >
            <ImagePlus className="h-6 w-6 text-text-secondary/50 mx-auto mb-1.5" />
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
        <div className="flex items-center gap-2 mb-2">
          <Video className="h-4 w-4 text-accent" aria-hidden="true" />
          <label className="text-sm font-medium text-text-primary">
            {t("addVideo")}
          </label>
        </div>
        <p className="text-xs text-text-secondary mb-3">{t("videoHelp")}</p>

        {videoPreview ? (
          <div className="relative rounded-lg overflow-hidden border border-border">
            <video
              src={videoPreview}
              controls
              className="w-full max-h-48 bg-black"
            />
            <button
              type="button"
              onClick={removeVideo}
              className="absolute top-2 right-2 h-6 w-6 bg-surface/80 backdrop-blur-sm border border-border rounded-full flex items-center justify-center hover:bg-surface transition-colors"
            >
              <X className="h-3 w-3 text-text-secondary" />
            </button>
            <div className="px-3 py-2 bg-surface-elevated text-xs text-text-secondary flex items-center justify-between">
              <span>{video?.name}</span>
              <span>{video ? `${(video.size / 1024 / 1024).toFixed(1)} MB` : ""}</span>
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
            className="border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors"
          >
            <Video className="h-6 w-6 text-text-secondary/50 mx-auto mb-1.5" />
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
