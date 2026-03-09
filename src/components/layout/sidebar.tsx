"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  FileCheck,
  Wrench,
  FolderOpen,
  Bell,
  Settings,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";

interface SidebarProps {
  locale: string;
}

const navItems = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "properties", href: "/properties", icon: Building2 },
  { key: "tenants", href: "/tenants", icon: Users },
  { key: "payments", href: "/payments", icon: CreditCard },
  { key: "cheques", href: "/cheques", icon: FileCheck },
  { key: "maintenance", href: "/maintenance", icon: Wrench },
  { key: "documents", href: "/documents", icon: FolderOpen },
  { key: "reminders", href: "/reminders", icon: Bell },
  { key: "reports", href: "/reports", icon: BarChart3 },
  { key: "settings", href: "/settings", icon: Settings },
];

export function Sidebar({ locale }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("nav");

  const isRtl = locale === "ar";

  return (
    <aside
      className={cn(
        "fixed top-0 h-screen bg-surface border-border flex flex-col transition-all duration-200 z-40",
        isRtl ? "right-0 border-l" : "left-0 border-r",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        {!collapsed && (
          <span className="text-lg font-semibold text-accent tracking-tight">
            MPIRE
          </span>
        )}
        {collapsed && (
          <span className="text-lg font-semibold text-accent mx-auto">M</span>
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
                  title={collapsed ? t(item.key) : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{t(item.key)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
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
    </aside>
  );
}
