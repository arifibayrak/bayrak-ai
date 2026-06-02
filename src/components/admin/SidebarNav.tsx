'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  UserPlus,
  BarChart2,
  FileText,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLES, auditCanAccessPath, type Role } from '@/lib/authz';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const NAV_ITEMS = [
  { key: 'overview', href: '/dashboard/overview', icon: LayoutDashboard, exact: true },
  { key: 'projects', href: '/dashboard/projects', icon: FolderOpen, exact: false },
  { key: 'people', href: '/dashboard/people', icon: Users, exact: false },
  { key: 'requests', href: '/dashboard/requests', icon: UserPlus, exact: true },
  { key: 'analytics', href: '/dashboard/analytics', icon: BarChart2, exact: true },
  { key: 'hakedis', href: '/dashboard/hakedis', icon: FileText, exact: true },
  { key: 'exports', href: '/dashboard/exports', icon: Download, exact: true },
] as const;

/**
 * SidebarNav — 'use client' nav component with usePathname active detection.
 * 6 items (D-74: /dashboard/records has NO nav item).
 * Active detection: exact match for leaf routes, startsWith for routes with sub-pages.
 * Active style: amber left-accent bar (2px) + amber text/icon (Field-Industrial 260601-kj4).
 * Uses render prop pattern (Base UI SidebarMenuButton) instead of asChild.
 *
 * RBAC (Layer 3): audit_engineer is read-only and only sees the nav items whose
 * route is in AUDIT_ALLOWED_PREFIXES (overview, analytics). Office-only items
 * (projects, people, requests, hakedis, exports) are hidden. UI hiding is cosmetic
 * — each office page/action is independently guarded server-side (defense in depth).
 */
export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const t = useTranslations('dashboard.admin.nav');

  const items =
    role === ROLES.AUDIT
      ? NAV_ITEMS.filter((item) => auditCanAccessPath(item.href))
      : NAV_ITEMS;

  return (
    <nav aria-label={t('main_nav_aria')}>
      <SidebarMenu>
        {items.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <SidebarMenuItem
              key={item.key}
              className={cn(
                isActive && 'border-l-2 border-l-primary pl-0',
              )}
            >
              <SidebarMenuButton
                isActive={isActive}
                className={cn(
                  isActive && 'text-primary [&_svg]:text-primary',
                )}
                render={
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                  />
                }
              >
                <item.icon aria-hidden="true" />
                <span>{t(item.key)}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
