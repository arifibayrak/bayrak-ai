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
 * Wordmark consumes `<BrandLogo size="md" />` per Phase 13 D-124 / 13-01 Task 3b.
 */
export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-3">
          <BrandLogo size="md" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav />
      </SidebarContent>
    </Sidebar>
  );
}
