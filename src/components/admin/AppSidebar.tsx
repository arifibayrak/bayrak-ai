import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { SidebarNav } from './SidebarNav';

/**
 * AppSidebar — server-compatible shell composing the sidebar panel.
 * Renders a persistent left sidebar with the bayrak.ai wordmark and nav.
 * SidebarNav is a client component; AppSidebar itself may be a server component.
 */
export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-3">
          <span className="text-base font-semibold tracking-tight text-sidebar-primary">
            bayrak.ai
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav />
      </SidebarContent>
    </Sidebar>
  );
}
