"use client";

import { useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";

export default function DownloadReportButtons({ reportId }: { reportId: string }) {
  const [loading, setLoading] = useState(false);

  const downloadPDF = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}`);
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportId}-report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 pt-3 border-t border-border">
      <button
        onClick={downloadPDF}
        disabled={loading}
        className="inline-flex items-center gap-1.5 h-8 px-3 bg-accent hover:bg-accent-hover text-background text-xs font-medium rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        {loading ? "Generating..." : "PDF"}
      </button>
      <button
        disabled
        className="inline-flex items-center gap-1.5 h-8 px-3 bg-surface-elevated border border-border text-text-secondary text-xs font-medium rounded-md opacity-50 cursor-not-allowed"
        title="Coming soon"
      >
        <Download className="h-3.5 w-3.5" />
        Excel
      </button>
    </div>
  );
}
