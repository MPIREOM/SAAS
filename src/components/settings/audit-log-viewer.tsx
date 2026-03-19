"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  user_id?: string;
  user_email?: string;
}

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  useEffect(() => {
    fetchLogs();
  }, [page]);

  async function fetchLogs() {
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error: fetchError } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (fetchError) {
        if (fetchError.message.includes("does not exist") || fetchError.code === "42P01") {
          setError("Audit logs table not configured yet.");
        } else {
          setError(fetchError.message);
        }
        setLogs([]);
      } else {
        setLogs(data || []);
      }
    } catch {
      setError("Could not load audit logs");
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface-elevated border border-border rounded-md p-4">
        <p className="text-sm text-text-secondary">{error}</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
        <Activity className="h-8 w-8 opacity-30 mb-2" />
        <p className="text-sm">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="bg-surface-elevated/50 border border-border/30 rounded-lg p-3 hover:border-border transition-colors"
        >
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-2 w-2 rounded-full bg-accent shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-text-primary font-medium truncate">
                  {log.action}
                </p>
                <p className="text-xs text-text-secondary">
                  {new Date(log.created_at).toLocaleString()}
                  {log.entity_type && (
                    <span className="ml-2 text-accent/70">{log.entity_type}</span>
                  )}
                </p>
              </div>
            </div>
            {log.metadata && (
              expandedId === log.id
                ? <ChevronUp className="h-4 w-4 text-text-secondary shrink-0" />
                : <ChevronDown className="h-4 w-4 text-text-secondary shrink-0" />
            )}
          </div>
          {expandedId === log.id && log.metadata && (
            <pre className="mt-2 p-2 bg-surface border border-border rounded text-xs text-text-secondary overflow-x-auto font-mono">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          )}
        </div>
      ))}

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="text-xs px-3 py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
        >
          Previous
        </button>
        <span className="text-xs text-text-secondary">Page {page + 1}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={logs.length < pageSize}
          className="text-xs px-3 py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
