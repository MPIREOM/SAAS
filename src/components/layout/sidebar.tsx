"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCheck,
  FileText,
  Wrench,
  FolderOpen,
  Bell,
  Settings,
  BarChart3,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";

interface SidebarProps {
  locale: string;
}

const navItems = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "properties", href: "/properties", icon: Building2 },
  { key: "tenants", href: "/tenants", icon: Users },
  { key: "invoices", href: "/invoices", icon: FileText },
  { key: "expenses", href: "/expenses", icon: Receipt },
  { key: "owners", href: "/owners", icon: UserCheck },
  { key: "maintenance", href: "/maintenance", icon: Wrench },
  { key: "documents", href: "/documents", icon: FolderOpen },
  { key: "reminders", href: "/reminders", icon: Bell },
  { key: "reports", href: "/reports", icon: BarChart3 },
  { key: "settings", href: "/settings", icon: Settings },
];

export function Sidebar({ locale }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tc = useTranslations("common");

  const isRtl = locale === "ar";

  // Close mobile sidebar on route change (state adjustment during render,
  // per react.dev "you might not need an effect")
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  // The content column offsets itself by --sidebar-w (dashboard layout),
  // so it tracks the collapsed width instead of leaving a gap.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-w", collapsed ? "68px" : "232px");
  }, [collapsed]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const sidebarContent = (isMobile: boolean) => (
    <>
      {/* Logo */}
      <div
        className={cn(
          "h-[60px] flex items-center gap-2.5 px-5 shrink-0",
          collapsed && !isMobile && "justify-center px-0"
        )}
      >
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-[13px] font-bold text-accent-foreground"
        >
          M
        </span>
        {(!collapsed || isMobile) && (
          <span className="text-[15px] font-bold tracking-[0.14em] text-text-primary">
            MPIRE
          </span>
        )}
        {/* Close button for mobile */}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            aria-label={tc("closeMenu")}
            className="ms-auto grid h-10 w-10 place-items-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 pb-4 overflow-y-auto">
        <ul className="space-y-0.5 px-3">
          {navItems.map((item) => {
            // Exact match or a nested route under this item (e.g.
            // /properties/123). A bare substring check (`includes`) is
            // fragile — it can light up the wrong item once route names
            // start sharing substrings.
            const fullHref = `/${locale}${item.href}`;
            const isActive =
              pathname === fullHref || pathname.startsWith(`${fullHref}/`);
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Link
                  href={`/${locale}${item.href}`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 px-3 rounded-lg text-sm transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                    collapsed && !isMobile && "justify-center px-0",
                    isActive
                      ? "bg-accent-tint text-accent-tint-foreground font-semibold"
                      : "font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                  )}
                  title={collapsed && !isMobile ? t(item.key) : undefined}
                >
                  <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                  {(!collapsed || isMobile) && (
                    <span className="truncate">{t(item.key)}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle - desktop only */}
      {!isMobile && (
        <div className="border-t border-border p-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={tc("toggleSidebar")}
            aria-pressed={collapsed}
            className="flex h-10 items-center justify-center w-full rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {collapsed ? (
              isRtl ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : isRtl ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label={tc("openMenu")}
        className="md:hidden fixed top-2 start-2 z-40 grid h-10 w-10 place-items-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          role="presentation"
          className="md:hidden fixed inset-0 bg-scrim z-40 animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "md:hidden fixed top-0 h-dvh w-[280px] max-w-[85vw] bg-surface border-border flex flex-col z-50 shadow-overlay transition-transform duration-300 ease-out",
          "start-0 border-e",
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full rtl:translate-x-full"
        )}
      >
        {sidebarContent(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex fixed top-0 h-screen bg-surface border-border flex-col transition-[width] duration-200 ease-out z-40",
          "start-0 border-e",
          collapsed ? "w-[68px]" : "w-[232px]"
        )}
      >
        {sidebarContent(false)}
      </aside>
    </>
  );
}
