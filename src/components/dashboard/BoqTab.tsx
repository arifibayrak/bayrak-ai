/**
 * BoqTab.tsx
 *
 * Project BOQ tab — plan 01-06 replaces the stub from plan 01-05.
 * Async Server Component: fetches BOQ items and passes them to the client shell.
 *
 * Boundary: this file and its client sub-components own the BOQ tab internals.
 * The [id]/page.tsx file is NOT modified (file-ownership boundary).
 *
 * UI-SPEC #4a: BOQ table, Add/Edit dialog, Excel import flow, remaining-balance colors.
 * D-04: ships BOTH manual CRUD AND the Excel importer.
 */

import { getBoqItems } from '@/actions/boq';
import { BoqTabClient } from './BoqTabClient';

interface BoqTabProps {
  projectId: string;
}

export async function BoqTab({ projectId }: BoqTabProps) {
  const items = await getBoqItems(projectId);

  return (
    <BoqTabClient
      projectId={projectId}
      initialItems={items}
    />
  );
}
