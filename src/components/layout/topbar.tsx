"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { Globe, Moon, Sun, Search, LogOut, X } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";

interface TopbarProps {
  locale: string;
  userEmail?: string;
  userName?: string;
}

type SearchType = "tenant" | "property" | "unit" | "invoice" | "maintenance";

interface SearchResultRaw {
  type: SearchType;
  id: string;
  title: string;
  subtitle?: string;
  payload: { id?: string; property_id?: string };
}

interface SearchResult extends SearchResultRaw {
  href: string;
}

export function Topbar({ locale, userEmail, userName }: TopbarProps) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  // Keyboard navigation index into searchResults; -1 means nothing focused.
  const [activeIdx, setActiveIdx] = useState(-1);
  // Mac vs PC affects the visible "⌘K" hint.
  const [isMac, setIsMac] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");
  const tn = useTranslations("nav");

  // Persist theme from localStorage + detect platform for keyboard hint.
  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Global Cmd+K / Ctrl+K shortcut: jumps to the search input from
  // anywhere in the app. Skips when the user is already typing in
  // another input so we don't steal characters.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
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

  // Hits the access-scoped /api/search endpoint instead of querying
  // Supabase from the client. Keeps tenants/properties/units the user
  // has no access to from leaking into the dropdown.
  const handleSearch = useCallback(
    async (query: string) => {
      if (!query || query.length < 2) {
        setSearchResults([]);
        setSearchOpen(false);
        setActiveIdx(-1);
        return;
      }

      setSearching(true);
      setSearchOpen(true);

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("search failed");
        const data: { results: SearchResultRaw[] } = await res.json();
        const hrefFor = (r: SearchResultRaw): string => {
          switch (r.type) {
            case "tenant":
              return `/${locale}/tenants/${r.id}`;
            case "property":
              return `/${locale}/properties/${r.id}`;
            case "unit":
              return `/${locale}/properties/${r.payload.property_id}/units/${r.id}`;
            case "invoice":
              return `/${locale}/invoices`;
            case "maintenance":
              return `/${locale}/maintenance/${r.id}`;
          }
        };
        const enriched: SearchResult[] = (data.results || []).map((r) => ({
          ...r,
          href: hrefFor(r),
        }));
        setSearchResults(enriched);
        setActiveIdx(enriched.length > 0 ? 0 : -1);
      } catch {
        setSearchResults([]);
        setActiveIdx(-1);
      } finally {
        setSearching(false);
      }
    },
    [locale]
  );

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(value), 300);
  };

  // Arrow nav + Enter to navigate, Esc to dismiss. Active result is
  // tracked separately from focus so the input stays focused while
  // the user moves through results.
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setSearchOpen(false);
      setActiveIdx(-1);
      inputRef.current?.blur();
      return;
    }
    if (!searchOpen || searchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) =>
        i <= 0 ? searchResults.length - 1 : i - 1
      );
    } else if (e.key === "Enter") {
      const target = searchResults[activeIdx];
      if (target) {
        e.preventDefault();
        setSearchOpen(false);
        setSearchQuery("");
        router.push(target.href);
      }
    }
  };

  const typeLabels: Record<string, string> = {
    tenant: t("tenant"),
    property: t("property"),
    unit: t("unit"),
    invoice: tn("invoices"),
    maintenance: tn("maintenance"),
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
          <Search
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary start-3 transition-colors group-focus-within:text-accent"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setSearchOpen(true)}
            onKeyDown={onSearchKeyDown}
            placeholder={t("search")}
            aria-label={t("search")}
            role="combobox"
            aria-expanded={searchOpen}
            aria-controls="topbar-search-listbox"
            aria-activedescendant={
              activeIdx >= 0
                ? `topbar-search-result-${activeIdx}`
                : undefined
            }
            autoComplete="off"
            className="w-full h-9 bg-surface-elevated/50 border border-border/50 rounded-lg ps-9 pe-16 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:border-accent/50 focus:bg-surface-elevated transition-all duration-200"
          />
          {searchQuery ? (
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setSearchOpen(false);
                setActiveIdx(-1);
                inputRef.current?.focus();
              }}
              aria-label={t("close")}
              className="absolute top-1/2 -translate-y-1/2 end-2 p-0.5 rounded text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              className="hidden sm:inline-flex absolute top-1/2 -translate-y-1/2 end-2 items-center gap-0.5 h-5 px-1.5 rounded border border-border/60 bg-surface text-[10px] font-mono font-semibold text-text-secondary pointer-events-none"
              title={isMac ? "⌘K" : "Ctrl+K"}
            >
              <span>{isMac ? "⌘" : "Ctrl"}</span>
              <span>K</span>
            </kbd>
          )}
        </div>

        {/* Search dropdown */}
        {searchOpen && (
          <div
            id="topbar-search-listbox"
            role="listbox"
            className="absolute top-full mt-1.5 w-full bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50"
          >
            {searching ? (
              <div
                className="px-4 py-6 text-center"
                aria-busy="true"
                aria-live="polite"
              >
                <Spinner label={t("loading")} sizeClassName="h-4 w-4" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="py-1.5 max-h-72 overflow-y-auto">
                {searchResults.map((result, idx) => {
                  const isActive = idx === activeIdx;
                  return (
                    <Link
                      key={`${result.type}-${result.id}`}
                      id={`topbar-search-result-${idx}`}
                      role="option"
                      aria-selected={isActive}
                      href={result.href}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchQuery("");
                      }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 transition-colors",
                        isActive
                          ? "bg-accent/10"
                          : "hover:bg-surface-elevated"
                      )}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">
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
                  );
                })}
                <div className="border-t border-border/40 px-3 py-1.5 flex items-center justify-between text-[10px] text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-1 rounded border border-border/60 bg-surface font-mono">
                      ↑↓
                    </kbd>
                    <span>{t("toNavigate")}</span>
                    <kbd className="px-1 rounded border border-border/60 bg-surface font-mono">
                      ↵
                    </kbd>
                    <span>{t("toSelect")}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 rounded border border-border/60 bg-surface font-mono">
                      esc
                    </kbd>
                    <span>{t("toClose")}</span>
                  </span>
                </div>
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
          aria-label={locale === "en" ? "Switch to Arabic" : "Switch to English"}
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-medium">{locale === "en" ? "AR" : "EN"}</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="p-2 rounded-lg text-text-secondary hover:text-accent hover:bg-surface-elevated/50 transition-all duration-200"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
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
            aria-label={t("logout")}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
