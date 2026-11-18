// Shared by the technician's public job page and its API route
// (/maintenance-job/[token], migration 056).

/** Photos of the finished work the technician can add when marking a job done. */
export const MAX_DONE_PHOTOS = 3;

export const DONE_PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** File-name prefix of a job's completion photos in the media bucket. */
export function donePhotoPrefix(requestId: string): string {
  return `done-${requestId}-`;
}

/** Where a job stands, as the technician sees it. */
export type JobStage = "new" | "working" | "awaiting_confirmation" | "completed";

export function jobStage(status: string, technicianDoneAt: string | null): JobStage {
  if (status === "open") return "new";
  if (status === "in_progress") return technicianDoneAt ? "awaiting_confirmation" : "working";
  return "completed";
}

// The app's locales are English and Arabic; the watchman reads Bengali. His
// job page shows these above the English text, the same way his WhatsApp job
// card does. Keys match the maintenanceJob messages.
export const JOB_PAGE_BN = {
  category: "কাজের ধরন",
  urgency: "জরুরি মাত্রা",
  issue: "সমস্যা",
  tenant: "ভাড়াটিয়া",
  noTenant: "ভাড়াটিয়া নেই (খালি ইউনিট)",
  progress: "কাজের অবস্থা",
  media: "সমস্যার ছবি ও ভিডিও",
  stageNew: "নতুন কাজ — এখনো শুরু হয়নি",
  stageWorking: "কাজ চলছে",
  stageAwaiting: "কাজ শেষ বলে জানানো হয়েছে — অফিসের নিশ্চিতকরণের অপেক্ষায়",
  stageCompleted: "কাজ সম্পন্ন হয়েছে",
  startWork: "কাজ শুরু করুন",
  startHint: "কাজ শুরু করার সময় এই বোতামে চাপ দিন।",
  markDone: "কাজ শেষ হয়েছে",
  doneHint: "কাজ শেষ হলে এই বোতামে চাপ দিন। অফিস কাজটি দেখে বন্ধ করবে।",
  awaitingHint: "ধন্যবাদ। অফিসকে জানানো হয়েছে।",
  addPhoto: "শেষ হওয়া কাজের ছবি যোগ করুন (ঐচ্ছিক)",
  removePhoto: "ছবি সরান",
  saveFailed: "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
  uploadFailed: "ছবি আপলোড করা যায়নি। আবার চেষ্টা করুন।",
} as const;

export type JobPageKey = keyof typeof JOB_PAGE_BN;

/** A label in the page's language, with the Bengali line above it for the watchman. */
export interface JobLabel {
  main: string;
  sub?: string;
}
