/**
 * (admin) route group passthrough layout.
 * NO second SidebarProvider here — the sidebar lives only in the root
 * src/app/dashboard/layout.tsx (Pitfall 1 prevention, D-64).
 * This is a pure passthrough so Next.js recognizes the route group.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
