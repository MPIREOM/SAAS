"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";

export function InviteUserForm() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const body = {
      email: formData.get("email"),
      full_name: formData.get("full_name"),
      role: formData.get("role"),
    };

    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to invite user");
        setLoading(false);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-8 px-3 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Add User
      </button>
    );
  }

  return (
    <div className="bg-surface-elevated border border-border rounded-md p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-primary">Invite New User</h3>
        <button
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-border/30 transition-colors"
        >
          <X className="h-3.5 w-3.5 text-text-secondary" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Email <span className="text-destructive">*</span>
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="user@example.com"
              className="w-full h-9 bg-surface border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Full Name
            </label>
            <input
              name="full_name"
              placeholder="John Doe"
              className="w-full h-9 bg-surface border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Role <span className="text-destructive">*</span>
          </label>
          <select
            name="role"
            required
            defaultValue="property_manager"
            className="w-full h-9 bg-surface border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
          >
            <option value="property_manager">Property Manager</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="h-8 px-3 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? "Inviting..." : "Invite User"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError("");
            }}
            className="h-8 px-3 bg-surface border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
