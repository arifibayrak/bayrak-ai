/**
 * BoqTab.tsx — STUB component.
 *
 * This component is a file-ownership boundary stub created by plan 01-05.
 * Plan 01-06 fills the internals with BOQ CRUD, Excel import, and the full
 * BOQ table — WITHOUT modifying [id]/page.tsx (clean plan boundary).
 *
 * Contract: exports BoqTab, accepts projectId prop.
 */

interface BoqTabProps {
  projectId: string;
}

export function BoqTab({ projectId: _projectId }: BoqTabProps) {
  return (
    <div className="py-12 text-center text-muted-foreground text-sm">
      <p>BOQ içeriği yükleniyor... / Loading BOQ contents...</p>
    </div>
  );
}
