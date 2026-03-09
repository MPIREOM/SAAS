"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { Globe, Moon, Sun, Search, LogOut } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface TopbarProps {
  locale: string;
  userEmail?: string;
  userName?: string;
}

export function Topbar({ locale, userEmail, userName }: TopbarProps) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");

  const isRtl = locale === "ar";

  const toggleLanguage = () => {
    const newLocale = locale === "en" ? "ar" : "en";
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/auth/login`);
  };

  return (
    <header
      className={cn(
        "h-14 bg-surface border-b border-border flex items-center justify-between ps-14 pe-4 md:px-6 sticky top-0 z-30"
      )}
    >
      {/* Search */}
      <div className="flex items-center gap-2 flex-1 max-w-xs md:max-w-md">
        <div className="relative w-full">
          <Search className="absolute top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary start-3" />
          <input
            type="text"
            placeholder={t("search")}
            className="w-full h-9 bg-surface-elevated border border-border rounded-md ps-9 pe-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Language toggle */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          title={locale === "en" ? "العربية" : "English"}
        >
          <Globe className="h-4 w-4" />
          <span className="text-xs">{locale === "en" ? "AR" : "EN"}</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {/* User info + logout */}
        <div className="flex items-center gap-2 ms-2 ps-2 border-s border-border">
          <div className="text-end hidden sm:block">
            <p className="text-sm text-text-primary leading-tight">
              {userName || userEmail}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-md text-text-secondary hover:text-destructive hover:bg-surface-elevated transition-colors"
            title={t("logout") || "Logout"}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
