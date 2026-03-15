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
  FileText,
  Wrench,
  FolderOpen,
  Bell,
  Settings,
  BarChart3,
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
      <div className="h-14 flex items-center justify-between px-4 border-b border-border">
        {(!collapsed || isMobile) && (
          <span className="text-lg font-semibold text-accent tracking-tight">
            MPIRE
          </span>
        )}
        {collapsed && !isMobile && (
          <span className="text-lg font-semibold text-accent mx-auto">M</span>
        )}
        {/* Close button for mobile */}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const isActive = pathname.includes(item.href);
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Link
                  href={`/${locale}${item.href}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                  )}
                  title={collapsed && !isMobile ? t(item.key) : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {(!collapsed || isMobile) && <span>{t(item.key)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle - desktop only */}
      {!isMobile && (
        <div className="border-t border-border p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full py-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
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
        className="md:hidden fixed top-3 z-50 p-2 rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
        style={{ [isRtl ? "right" : "left"]: "0.75rem" }}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "md:hidden fixed top-0 h-screen w-60 bg-surface border-border flex flex-col z-50 transition-transform duration-200",
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
          "hidden md:flex fixed top-0 h-screen bg-surface border-border flex-col transition-all duration-200 z-40",
          isRtl ? "right-0 border-l" : "left-0 border-r",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {sidebarContent(false)}
      </aside>
    </>
  );
}
