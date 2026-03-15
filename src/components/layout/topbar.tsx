"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { Globe, Moon, Sun, Search, LogOut, X } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CURRENCY } from "@/lib/currency";
import Link from "next/link";

interface TopbarProps {
  locale: string;
  userEmail?: string;
  userName?: string;
}

interface SearchResult {
  type: "tenant" | "property" | "unit" | "invoice" | "maintenance";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export function Topbar({ locale, userEmail, userName }: TopbarProps) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");

  // Persist theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  // Close search on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggleLanguage = () => {
    const newLocale = locale === "en" ? "ar" : "en";
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/auth/login`);
  };

  const handleSearch = useCallback(
    async (query: string) => {
      if (!query || query.length < 2) {
        setSearchResults([]);
        setSearchOpen(false);
        return;
      }

      setSearching(true);
      setSearchOpen(true);
      const supabase = createClient();
      const results: SearchResult[] = [];

      const [{ data: tenants }, { data: properties }, { data: units }, { data: invoices }, { data: maintenanceRequests }] =
        await Promise.all([
          supabase
            .from("tenants")
            .select("id, full_name, phone")
            .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
            .limit(5),
          supabase
            .from("properties")
            .select("id, name, location")
            .or(`name.ilike.%${query}%,location.ilike.%${query}%`)
            .limit(5),
          supabase
            .from("units")
            .select("id, unit_number, property_id, properties(name)")
            .ilike("unit_number", `%${query}%`)
            .limit(5),
          supabase
            .from("invoices")
            .select("id, amount, status, due_date, tenants!inner(full_name)")
            .or(`status.eq.pending,status.eq.overdue`)
            .limit(3),
          supabase
            .from("maintenance_requests")
            .select("id, category, status, description")
            .ilike("description", `%${query}%`)
            .limit(3),
        ]);

      tenants?.forEach((t) =>
        results.push({
          type: "tenant",
          id: t.id,
          title: t.full_name,
          subtitle: t.phone,
          href: `/${locale}/tenants/${t.id}`,
        })
      );

      properties?.forEach((p) =>
        results.push({
          type: "property",
          id: p.id,
          title: p.name,
          subtitle: p.location,
          href: `/${locale}/properties/${p.id}`,
        })
      );

      units?.forEach((u) => {
        const prop = u.properties as unknown as Record<string, string> | null;
        results.push({
          type: "unit",
          id: u.id,
          title: `Unit ${u.unit_number}`,
          subtitle: prop?.name,
          href: `/${locale}/properties/${u.property_id}`,
        });
      });

      invoices?.forEach((inv) => {
        const tenant = inv.tenants as unknown as { full_name: string };
        results.push({
          type: "invoice",
          id: inv.id,
          title: `${tenant.full_name} - ${inv.amount} ${CURRENCY.code}`,
          subtitle: `${inv.status} · ${new Date(inv.due_date).toLocaleDateString()}`,
          href: `/${locale}/invoices`,
        });
      });

      maintenanceRequests?.forEach((m) => {
        results.push({
          type: "maintenance",
          id: m.id,
          title: m.category.charAt(0).toUpperCase() + m.category.slice(1),
          subtitle: m.description?.slice(0, 50) + (m.description?.length > 50 ? "..." : ""),
          href: `/${locale}/maintenance/${m.id}`,
        });
      });

      setSearchResults(results);
      setSearching(false);
    },
    [locale]
  );

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(value), 300);
  };

  const typeLabels: Record<string, string> = {
    tenant: t("tenant") || "Tenant",
    property: t("property") || "Property",
    unit: t("unit") || "Unit",
    invoice: "Invoice",
    maintenance: "Maintenance",
  };

  return (
    <header
      className={cn(
        "h-16 bg-surface/60 backdrop-blur-xl border-b border-border/50 flex items-center justify-between ps-14 pe-4 md:px-6 sticky top-0 z-30"
      )}
    >
      {/* Search */}
      <div ref={searchRef} className="relative flex-1 max-w-xs md:max-w-md">
        <div className="relative group">
          <Search className="absolute top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary start-3 transition-colors group-focus-within:text-accent" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setSearchOpen(true)}
            placeholder={t("search")}
            className="w-full h-9 bg-surface-elevated/50 border border-border/50 rounded-lg ps-9 pe-8 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:border-accent/50 focus:bg-surface-elevated transition-all duration-200"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setSearchOpen(false);
              }}
              className="absolute top-1/2 -translate-y-1/2 end-2 p-0.5 rounded text-text-secondary hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Search dropdown */}
        {searchOpen && (
          <div className="absolute top-full mt-1.5 w-full bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50">
            {searching ? (
              <div className="px-4 py-6 text-center">
                <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="py-1.5 max-h-72 overflow-y-auto">
                {searchResults.map((result) => (
                  <Link
                    key={`${result.type}-${result.id}`}
                    href={result.href}
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-elevated transition-colors"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                      {typeLabels[result.type]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {result.title}
                      </p>
                      {result.subtitle && (
                        <p className="text-xs text-text-secondary truncate">
                          {result.subtitle}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-text-secondary">{t("noResults")}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Language toggle */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:text-accent hover:bg-surface-elevated/50 transition-all duration-200"
          title={locale === "en" ? "العربية" : "English"}
        >
          <Globe className="h-4 w-4" />
          <span className="text-xs font-medium">{locale === "en" ? "AR" : "EN"}</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-text-secondary hover:text-accent hover:bg-surface-elevated/50 transition-all duration-200"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {/* User info + logout */}
        <div className="flex items-center gap-3 ms-2 ps-3 border-s border-border/50">
          <div className="hidden sm:flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
              <span className="text-xs font-semibold text-accent">
                {(userName || userEmail || "U").charAt(0).toUpperCase()}
              </span>
            </div>
            <p className="text-sm font-medium text-text-primary leading-tight">
              {userName || userEmail}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-text-secondary hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
            title={t("logout")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
