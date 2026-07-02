"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

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
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Fetch the current page of audit logs. All setState calls happen after
  // the awaited query resolves, never synchronously inside the effect.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          if (fetchError.message.includes("does not exist") || fetchError.code === "42P01") {
            setError(t("auditNotConfigured"));
          } else {
            setError(fetchError.message);
          }
          setLogs([]);
        } else {
          setLogs(data || []);
        }
        setLoading(false);
      }, () => {
        if (cancelled) return;
        setError(t("auditLoadFailed"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, t]);

  if (loading) {
    return <Spinner className="py-8" label={tc("loading")} />;
  }

  if (error) {
    return <Alert variant="destructive">{error}</Alert>;
  }

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="h-5 w-5" />}
        title={t("auditNoActivity")}
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="rounded-lg border border-border/40 bg-surface-elevated/50 transition-colors hover:border-border"
        >
          <button
            type="button"
            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
            aria-expanded={expandedId === log.id}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg p-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full bg-accent"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {log.action}
                </span>
                <span className="block text-xs text-text-secondary">
                  <span className="ltr-nums font-mono">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                  {log.entity_type && (
                    <span className="ms-2 text-accent/70">{log.entity_type}</span>
                  )}
                </span>
              </span>
            </div>
            {log.metadata && (
              expandedId === log.id
                ? <ChevronUp aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />
                : <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />
            )}
          </button>
          {expandedId === log.id && log.metadata && (
            <pre className="mx-3 mb-3 overflow-x-auto rounded-md border border-border/60 bg-surface p-2 font-mono text-xs text-text-secondary">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          )}
        </div>
      ))}

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            setPage(Math.max(0, page - 1));
          }}
          disabled={page === 0}
        >
          {tc("previous")}
        </Button>
        <span className="text-xs text-text-secondary">
          {tc("page")}{" "}
          <span className="ltr-nums font-mono text-text-primary">{page + 1}</span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            setPage(page + 1);
          }}
          disabled={logs.length < pageSize}
        >
          {tc("next")}
        </Button>
      </div>
    </div>
  );
}
