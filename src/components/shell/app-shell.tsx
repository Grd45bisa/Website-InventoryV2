"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  EXTRA_ROUTE_TITLES,
  NAV_SECTIONS,
  findNavItem,
  type NavIconName,
} from "@/lib/nav-config";
import { uiCopy } from "@/lib/ui-copy";
import { MEDIA, useMediaQuery } from "@/lib/use-media-query";
import type { ActiveSecurityContext, UserRole } from "@/lib/types/auth";
import { IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { signOutAction } from "@/lib/auth/actions";
import {
  ArrowInIcon,
  ArrowOutIcon,
  AuditIcon,
  BoxIcon,
  ChartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CloseIcon,
  DashboardIcon,
  DocumentIcon,
  MenuIcon,
  OrderIcon,
  SettingsIcon,
  TruckIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { ToastProvider } from "@/components/ui/toast";

const NAV_ICONS: Record<NavIconName, (p: { size?: number; className?: string }) => ReactNode> = {
  dashboard: DashboardIcon,
  document: DocumentIcon,
  order: OrderIcon,
  box: BoxIcon,
  in: ArrowInIcon,
  out: ArrowOutIcon,
  clipboard: ClipboardIcon,
  chart: ChartIcon,
  users: UsersIcon,
  truck: TruckIcon,
  settings: SettingsIcon,
  audit: AuditIcon,
};

const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: "Owner",
  STAFF: "Staff",
  SALES: "Sales",
  SUPER_ADMIN: "Super Admin",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export type ShellProps = {
  identity: { fullName: string };
  /** Konteks tervalidasi server (lihat context-evaluator); shell hanya menampilkan. */
  context: ActiveSecurityContext;
  /** Tampilkan banner bila konteks berasal dari fixture demo. */
  isDemo?: boolean;
  warehouses?: Array<{ id: string; name: string }>;
  onSwitchWarehouse?: (warehouseId: string | null) => void;
  children: ReactNode;
};

function Brand({ compact }: { compact: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-surface"
      >
        D
      </span>
      <div className={cn("min-w-0 leading-tight", compact && "sr-only")}>
        <p className="truncate text-md font-semibold text-text-primary">
          {uiCopy.brand.name}
        </p>
        <p className="truncate text-xs text-text-secondary">{uiCopy.brand.subtitle}</p>
      </div>
    </div>
  );
}

function NavList({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label={uiCopy.shell.primaryNav}
      className="min-h-0 flex-1 overflow-y-auto px-2 py-3 no-scrollbar"
    >
      {NAV_SECTIONS.map((section, idx) => (
        <section
          key={section.id}
          aria-labelledby={`nav-${section.id}`}
          className={cn(idx > 0 && "mt-3")}
        >
          <h2
            id={`nav-${section.id}`}
            className={cn(
              "px-3 pb-1 text-xs font-semibold tracking-wide text-text-secondary",
              collapsed && "sr-only",
            )}
          >
            {section.label}
          </h2>
          {collapsed && idx > 0 ? (
            <div aria-hidden="true" className="mx-auto my-2 w-8 border-t border-border" />
          ) : null}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = NAV_ICONS[item.icon];
              return (
                <li key={item.href} className={cn(collapsed && "flex justify-center")}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex min-h-11 items-center rounded-md text-sm transition-colors",
                      collapsed
                        ? "size-11 justify-center p-0"
                        : "gap-3 border-l-4 px-3",
                      active
                        ? collapsed
                          ? "border-2 border-primary bg-primary-soft text-primary font-semibold"
                          : "border-primary bg-primary-soft font-semibold text-text-primary"
                        : "border-transparent text-text-primary hover:bg-surface-muted",
                    )}
                  >
                    <Icon size={collapsed ? 24 : 20} className="shrink-0" />
                    <span className={cn(collapsed && "sr-only")}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function UserFooter({
  collapsed,
  fullName,
  roleLabel,
}: {
  collapsed: boolean;
  fullName: string;
  roleLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={uiCopy.shell.userFooter}
      className={cn(
        "flex items-center justify-between border-t border-border p-3",
        collapsed && "justify-center",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-muted text-sm font-semibold"
        >
          {initialsOf(fullName)}
        </span>
        <div className={cn("min-w-0 leading-tight", collapsed && "sr-only")}>
          <p className="truncate text-sm font-medium text-text-primary">{fullName}</p>
          <p className="truncate text-xs text-text-secondary">{roleLabel}</p>
        </div>
      </div>
      {!collapsed ? (
        <form action={signOutAction}>
          <button
            type="submit"
            title="Keluar dari sistem"
            className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger-soft focus:outline-none focus:ring-1 focus:ring-danger"
          >
            Keluar
          </button>
        </form>
      ) : null}
    </div>
  );
}

function ContextSummary({
  context,
  warehouses = [],
  onSwitchWarehouse,
}: {
  context: ActiveSecurityContext;
  warehouses?: Array<{ id: string; name: string }>;
  onSwitchWarehouse?: (warehouseId: string | null) => void;
}) {
  const isSuperAdminInternal =
    context.role === "SUPER_ADMIN" && context.ownerId === "owner-super-admin";
  const warehouseList = warehouses ?? [];
  const canSwitchWarehouse =
    (context.role === "OWNER" || context.role === "SUPER_ADMIN" || context.isSuperAdminOnBehalf) &&
    warehouseList.length > 1;

  return (
    <div
      role="group"
      aria-label={uiCopy.shell.contextLabel}
      className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-x-3 sm:gap-y-1.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2 sm:justify-start">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-text-secondary shrink-0">{uiCopy.shell.ownerLabel}:</span>
          <span className="font-semibold text-text-primary truncate">{context.ownerName}</span>
        </div>

        {/* Badge role mobile di sisi kanan */}
        {(context.isSuperAdminOnBehalf || context.role === "SUPER_ADMIN") && (
          <span className="inline-flex sm:hidden shrink-0 items-center gap-1.5 rounded-md border border-primary/20 bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            {context.isSuperAdminOnBehalf ? "Super Admin" : "Super Admin (Internal)"}
          </span>
        )}
      </div>

      <span className="text-border-strong hidden sm:inline" aria-hidden="true">•</span>

      <div className="flex items-center justify-between sm:justify-start gap-1.5">
        <label htmlFor="header-warehouse-select" className="text-text-secondary shrink-0">
          {uiCopy.shell.warehouseLabel}:
        </label>
        {canSwitchWarehouse ? (
          <select
            id="header-warehouse-select"
            value={context.warehouseId ?? ""}
            onChange={(e) => onSwitchWarehouse?.(e.target.value === "" ? null : e.target.value)}
            className="h-7 sm:h-8 flex-1 sm:flex-none rounded-md border border-border-strong bg-surface px-2.5 text-xs font-medium text-text-primary hover:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors"
          >
            {!isSuperAdminInternal && <option value="">Semua Gudang (Agregasi)</option>}
            {warehouseList.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-medium text-text-primary">
            {context.warehouseName ?? warehouseList[0]?.name ?? uiCopy.shell.noWarehouse}
          </span>
        )}
      </div>

      {(context.isSuperAdminOnBehalf || context.role === "SUPER_ADMIN") && (
        <span className="hidden sm:inline-flex items-center gap-1.5">
          <span className="text-border-strong" aria-hidden="true">•</span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary-soft px-2 py-1 text-xs font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            {context.isSuperAdminOnBehalf ? "Super Admin (Grant)" : "Super Admin (Internal)"}
          </span>
        </span>
      )}
    </div>
  );
}

function Breadcrumb({ pathname }: { pathname: string }) {
  const found = findNavItem(pathname);
  const extra = EXTRA_ROUTE_TITLES[pathname];
  const crumbs = found ? [found.section.label, found.item.label] : extra ? [extra] : [];
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label={uiCopy.shell.breadcrumb}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
        {crumbs.map((c, i) => (
          <li key={c} className="flex items-center gap-1.5">
            {i > 0 ? <ChevronRightIcon size={14} /> : null}
            <span
              aria-current={i === crumbs.length - 1 ? "page" : undefined}
              className={cn(i === crumbs.length - 1 && "font-medium text-text-primary")}
            >
              {c}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function AppShell({
  identity,
  context,
  isDemo = false,
  warehouses,
  onSwitchWarehouse,
  children,
}: ShellProps) {
  const pathname = usePathname();
  const isLarge = useMediaQuery(MEDIA.lg, true);
  const isMd = useMediaQuery(MEDIA.md, true);
  // Tablet (768-1023): rail ikon secara default; desktop: sidebar penuh. Pengguna dapat menimpa.
  const [override, setOverride] = useState<boolean | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const collapsed = override ?? !isLarge;
  const roleLabel = ROLE_LABEL[context.role];

  return (
    <ToastProvider>
      <a
        href="#main-content"
        className="sr-only rounded-md bg-surface px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        {uiCopy.shell.skipToContent}
      </a>

      <div className="min-h-dvh md:flex">
        {/* Sidebar tablet/desktop */}
        <aside
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface md:flex",
            "transition-[width]",
            collapsed ? "w-16" : "w-64",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2 border-b border-border p-3",
              collapsed ? "flex-col" : "justify-between",
            )}
          >
            <Brand compact={collapsed} />
            <IconButton
              label={collapsed ? uiCopy.shell.expandSidebar : uiCopy.shell.collapseSidebar}
              aria-expanded={!collapsed}
              onClick={() => setOverride(!collapsed)}
              className="size-9"
            >
              {collapsed ? <ChevronRightIcon size={18} /> : <ChevronLeftIcon size={18} />}
            </IconButton>
          </div>
          <NavList collapsed={collapsed} pathname={pathname} />
          <UserFooter collapsed={collapsed} fullName={identity.fullName} roleLabel={roleLabel} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar mobile */}
          <header className="sticky top-0 z-30 border-b border-border bg-surface md:hidden">
            <div className="flex items-center gap-2 px-2 py-2">
              <IconButton label={uiCopy.shell.openMenu} onClick={() => setDrawerOpen(true)}>
                <MenuIcon />
              </IconButton>
              <Brand compact={false} />
            </div>
            <div className="border-t border-border bg-surface-muted px-3 py-2">
              <ContextSummary
                context={context}
                warehouses={warehouses}
                onSwitchWarehouse={onSwitchWarehouse}
              />
            </div>
          </header>

          {/* Header konteks tablet/desktop */}
          <header className="hidden items-center justify-between gap-4 border-b border-border bg-surface px-6 py-2.5 md:flex">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Breadcrumb pathname={pathname} />
              <ContextSummary
                context={context}
                warehouses={warehouses}
                onSwitchWarehouse={onSwitchWarehouse}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label htmlFor="shell-language" className="text-xs text-text-secondary">
                {uiCopy.shell.languageLabel}
              </label>
              <select
                id="shell-language"
                disabled
                aria-describedby="shell-language-note"
                className="h-8 rounded-md border border-border bg-surface-muted px-2.5 text-xs text-text-secondary cursor-not-allowed"
              >
                <option>Indonesia</option>
              </select>
              <span id="shell-language-note" className="sr-only">
                {uiCopy.shell.languageUnavailable}
              </span>
            </div>
          </header>

          {isDemo ? (
            <p className="border-b border-warning bg-warning-soft px-4 py-2 text-sm text-text-primary md:px-6">
              {uiCopy.shell.demoBanner}
            </p>
          ) : null}

          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 p-4 md:p-6">
            <div className="md:hidden">
              <Breadcrumb pathname={pathname} />
              <div className="h-3" />
            </div>
            {children}
          </main>
        </div>
      </div>

      {/* Drawer mobile (dialog native: focus trap, Escape, fokus kembali ke tombol menu) */}
      <Dialog
        variant="drawer"
        hideTitle
        open={drawerOpen && !isMd}
        onClose={() => setDrawerOpen(false)}
        title={uiCopy.shell.primaryNav}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <Brand compact={false} />
          <IconButton label={uiCopy.shell.closeMenu} onClick={() => setDrawerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </div>
        <NavList
          collapsed={false}
          pathname={pathname}
          onNavigate={() => setDrawerOpen(false)}
        />
        <UserFooter collapsed={false} fullName={identity.fullName} roleLabel={roleLabel} />
      </Dialog>
    </ToastProvider>
  );
}
