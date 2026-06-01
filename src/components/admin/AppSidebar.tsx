import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { BrandLogo } from '@/components/brand';
import { SidebarNav } from './SidebarNav';

/**
 * AppSidebar — server-compatible shell composing the sidebar panel.
 * Renders a persistent left sidebar with the bayrak.ai wordmark and nav.
 * SidebarNav is a client component; AppSidebar itself may be a server component.
 *
 * Field-Industrial restyle (260601-kj4): graphite panel via --sidebar* tokens,
 * hairline bottom border on header, tighter density.
 */
export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <BrandLogo size="md" />
      </SidebarHeader>
      <SidebarContent className="px-2 py-2">
        <SidebarNav />
      </SidebarContent>
    </Sidebar>
  );
}
