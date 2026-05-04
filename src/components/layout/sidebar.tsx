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

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
      <div className="h-16 flex items-center justify-between px-5 border-b border-border/50">
        {(!collapsed || isMobile) && (
          <span className="text-xl font-display font-bold gold-shimmer tracking-tight">
            MPIRE
          </span>
        )}
        {collapsed && !isMobile && (
          <span className="text-xl font-display font-bold text-accent mx-auto">M</span>
        )}
        {/* Close button for mobile */}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            aria-label={tc("closeMenu")}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all duration-200"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = pathname.includes(item.href);
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Link
                  href={`/${locale}${item.href}`}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-accent/10 text-accent border-glow"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                  )}
                  title={collapsed && !isMobile ? t(item.key) : undefined}
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                      !isActive && "group-hover:scale-110"
                    )}
                  />
                  {(!collapsed || isMobile) && (
                    <span className="truncate">{t(item.key)}</span>
                  )}
                  {isActive && (!collapsed || isMobile) && (
                    <div className="ms-auto h-1.5 w-1.5 rounded-full bg-accent animate-fade-in" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle - desktop only */}
      {!isMobile && (
        <div className="border-t border-border/50 p-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={tc("toggleSidebar")}
            aria-pressed={collapsed}
            className="flex items-center justify-center w-full py-2.5 rounded-lg text-text-secondary hover:text-accent hover:bg-surface-elevated transition-all duration-200"
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
        className="md:hidden fixed top-3.5 z-50 p-2 rounded-lg glass border border-border/50 text-text-secondary hover:text-accent transition-all duration-200"
        style={{ [isRtl ? "right" : "left"]: "0.75rem" }}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          role="presentation"
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "md:hidden fixed top-0 h-screen w-64 bg-surface border-border/50 flex flex-col z-50 transition-transform duration-300 ease-out",
          isRtl ? "right-0 border-l" : "left-0 border-r",
          mobileOpen
            ? "translate-x-0"
            : isRtl
            ? "translate-x-full"
            : "-translate-x-full"
        )}
      >
        {sidebarContent(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex fixed top-0 h-screen bg-surface/80 backdrop-blur-xl border-border/50 flex-col transition-all duration-300 ease-out z-40",
          isRtl ? "right-0 border-l" : "left-0 border-r",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        {sidebarContent(false)}
      </aside>
    </>
  );
}
