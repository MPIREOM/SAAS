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
  const [theme, setTheme] = useState<"dark" | "light">("light");
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

  // Saved theme wins; otherwise mirror the device setting the CSS is
  // already following. Also detect platform for the keyboard hint.
  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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
        "h-14 md:h-[60px] bg-surface border-b border-border flex items-center justify-between gap-2 ps-14 pe-2 md:px-6 sticky top-0 z-30"
      )}
    >
      {/* Search */}
      <div ref={searchRef} className="relative min-w-0 flex-1 md:max-w-[360px]">
        <div className="relative group">
          <Search
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary start-3 transition-colors group-focus-within:text-accent"
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
            className="w-full h-[38px] bg-surface-elevated border border-border rounded-lg ps-9 pe-9 sm:pe-16 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-focus focus:border-accent focus:bg-surface transition-colors"
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
              className="absolute top-1/2 -translate-y-1/2 end-1.5 grid h-7 w-7 place-items-center rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              className="hidden sm:inline-flex absolute top-1/2 -translate-y-1/2 end-2 items-center gap-0.5 h-5 px-1.5 rounded-[5px] border border-border-strong bg-surface text-xs text-text-secondary pointer-events-none"
              title={isMac ? "⌘K" : "Ctrl+K"}
            >
              <span dir="ltr" className="inline-flex gap-0.5">
                <span>{isMac ? "⌘" : "Ctrl"}</span>
                <span>K</span>
              </span>
            </kbd>
          )}
        </div>

        {/* Search dropdown */}
        {searchOpen && (
          <div
            id="topbar-search-listbox"
            role="listbox"
            className="absolute top-full mt-1.5 w-full min-w-[280px] bg-surface border border-border rounded-xl shadow-overlay overflow-hidden z-50"
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
                          ? "bg-accent-tint"
                          : "hover:bg-surface-elevated"
                      )}
                    >
                      <span className="text-[11px] font-semibold text-accent-tint-foreground bg-accent-tint px-2 py-0.5 rounded-full shrink-0">
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
                <div className="hidden sm:flex border-t border-border bg-surface-elevated px-3 py-1.5 items-center justify-between text-[11px] text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-1 rounded border border-border-strong bg-surface">
                      ↑↓
                    </kbd>
                    <span>{t("toNavigate")}</span>
                    <kbd className="px-1 rounded border border-border-strong bg-surface">
                      ↵
                    </kbd>
                    <span>{t("toSelect")}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 rounded border border-border-strong bg-surface">
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
      <div className="flex shrink-0 items-center gap-1">
        {/* Language toggle */}
        <button
          onClick={toggleLanguage}
          className="flex h-9 items-center gap-1.5 px-2.5 rounded-lg border border-border bg-surface text-[13px] font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          title={locale === "en" ? "العربية" : "English"}
          aria-label={locale === "en" ? "Switch to Arabic" : "Switch to English"}
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          <span>{locale === "en" ? "AR" : "EN"}</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="grid h-10 w-10 place-items-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {theme === "dark" ? (
            <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
        </button>

        {/* User info + logout */}
        <div className="flex items-center gap-2 ms-1 ps-2 sm:ms-2 sm:ps-3 border-s border-border">
          <div className="hidden sm:flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-accent-tint flex items-center justify-center" aria-hidden="true">
              <span className="text-[13px] font-bold text-accent-tint-foreground">
                {(userName || userEmail || "U").charAt(0).toUpperCase()}
              </span>
            </div>
            <p className="max-w-[220px] truncate text-[13.5px] font-medium text-text-primary leading-tight">
              {userName || userEmail}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="grid h-10 w-10 place-items-center rounded-lg text-text-secondary hover:text-destructive-text hover:bg-destructive-tint transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            title={t("logout")}
            aria-label={t("logout")}
          >
            <LogOut className="h-[18px] w-[18px] rtl:rotate-180" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
