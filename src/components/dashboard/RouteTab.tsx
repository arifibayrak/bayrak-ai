/**
 * RouteTab.tsx — STUB component.
 *
 * This component is a file-ownership boundary stub created by plan 01-05.
 * Plan 01-06 fills the internals with GeoJSON upload, validation, and route
 * display — WITHOUT modifying [id]/page.tsx (clean plan boundary).
 *
 * Contract: exports RouteTab, accepts projectId prop.
 */

interface RouteTabProps {
  projectId: string;
}

export function RouteTab({ projectId: _projectId }: RouteTabProps) {
  return (
    <div className="py-12 text-center text-muted-foreground text-sm">
      <p>Rota içeriği yükleniyor... / Loading route contents...</p>
    </div>
  );
}
