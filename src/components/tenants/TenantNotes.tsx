"use client";

import { useState, useEffect } from "react";
import { StickyNote, Plus, Trash2, X } from "lucide-react";

interface Note {
  id: string;
  content: string;
  created_at: string;
}

export default function TenantNotes({ tenantId }: { tenantId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchNotes = async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/notes`);
    const data = await res.json();
    setNotes(data.notes || []);
    setLoading(false);
  };

  useEffect(() => { fetchNotes(); }, [tenantId]);

  const handleAdd = async () => {
    if (!input.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/tenants/${tenantId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setNotes((prev) => [data.note, ...prev]);
      setInput("");
      setShowInput(false);
    }
    setAdding(false);
  };

  const handleDelete = async (noteId: string) => {
    setDeletingId(noteId);
    await fetch(`/api/tenants/${tenantId}/notes/${noteId}`, { method: "DELETE" });
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    setDeletingId(null);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-text-secondary" />
          Notes
        </h2>
        <button
          onClick={() => setShowInput((v) => !v)}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
        >
          {showInput ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showInput ? "Cancel" : "Add Note"}
        </button>
      </div>

      {/* Input area */}
      {showInput && (
        <div className="mb-3 bg-surface border border-border rounded-lg p-4 space-y-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Write a note..."
            rows={3}
            className="w-full bg-surface-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent transition-colors resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={handleAdd}
              disabled={adding || !input.trim()}
              className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {adding ? "Saving..." : "Save Note"}
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : notes.length > 0 ? (
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className="bg-surface border border-border rounded-lg p-4 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary whitespace-pre-wrap">{note.content}</p>
                <p className="text-xs text-text-secondary mt-1.5">{formatDate(note.created_at)}</p>
              </div>
              <button
                onClick={() => handleDelete(note.id)}
                disabled={deletingId === note.id}
                className="shrink-0 p-1.5 text-text-secondary hover:text-destructive transition-colors disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <StickyNote className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
          <p className="text-sm text-text-secondary">No notes yet</p>
        </div>
      )}
    </div>
  );
}
