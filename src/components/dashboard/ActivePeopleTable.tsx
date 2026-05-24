'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { removeAssignment, addManualPerson } from '@/actions/people';

interface ActivePersonRow {
  personId: string;
  displayName: string;
  telegramUserId: bigint;
  telegramName: string | null;
  assignmentId: string | null;
  roleOnProject: string | null;
  projectId: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ActivePeopleTableProps {
  activePeople: ActivePersonRow[];
  projects: ProjectOption[];
}

// Group activePeople rows by personId (a person can have multiple assignments)
interface PersonGroup {
  personId: string;
  displayName: string;
  telegramUserId: bigint;
  assignments: Array<{
    assignmentId: string;
    roleOnProject: string;
    projectId: string;
    projectName: string;
  }>;
}

function groupPeople(rows: ActivePersonRow[], projects: ProjectOption[]): PersonGroup[] {
  const projectMap = new Map(projects.map(p => [p.id, p.name]));
  const groups = new Map<string, PersonGroup>();

  for (const row of rows) {
    if (!groups.has(row.personId)) {
      groups.set(row.personId, {
        personId: row.personId,
        displayName: row.displayName,
        telegramUserId: row.telegramUserId,
        assignments: [],
      });
    }
    if (row.assignmentId && row.roleOnProject && row.projectId) {
      groups.get(row.personId)!.assignments.push({
        assignmentId: row.assignmentId,
        roleOnProject: row.roleOnProject,
        projectId: row.projectId,
        projectName: projectMap.get(row.projectId) ?? row.projectId,
      });
    }
  }
  return Array.from(groups.values());
}

function RemoveAssignmentDialog({
  open,
  onClose,
  personName,
  assignmentId,
}: {
  open: boolean;
  onClose: () => void;
  personName: string;
  assignmentId: string;
}) {
  const t = useTranslations('dashboard.people');
  const common = useTranslations('common');
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeAssignment(assignmentId);
      onClose();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('remove_assignment')}</DialogTitle>
          <DialogDescription>
            {t('remove_assignment_confirm', { personName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={removing}>
            {common('cancel')}
          </Button>
          <Button variant="destructive" onClick={handleRemove} disabled={removing}>
            {removing ? common('loading') : t('remove_assignment_cta')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualAddDialog({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
}) {
  const t = useTranslations('dashboard.people');
  const common = useTranslations('common');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'worker' | 'auditor' | ''>('');
  const [telegramUserId, setTelegramUserId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [errors, setErrors] = useState<{ name?: string; role?: string; telegram?: string; project?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  function reset() {
    setDisplayName('');
    setRole('');
    setTelegramUserId('');
    setProjectId('');
    setErrors({});
    setServerError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: typeof errors = {};
    if (!displayName.trim()) newErrors.name = t('name_required');
    if (!role) newErrors.role = t('role_required');
    const tgId = parseInt(telegramUserId, 10);
    if (!telegramUserId || isNaN(tgId) || tgId <= 0) newErrors.telegram = t('telegram_required');
    if (!projectId) newErrors.project = t('project_required');

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setServerError('');
    setSubmitting(true);
    try {
      await addManualPerson({
        displayName: displayName.trim(),
        role: role as 'worker' | 'auditor',
        telegramUserId: tgId,
        projectId,
      });
      reset();
      onClose();
    } catch {
      setServerError(common('error_generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('add_manually')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-4 py-2">
          {/* Display name */}
          <div className="space-y-1">
            <Label htmlFor="manual-name">{t('col_name')}</Label>
            <Input
              id="manual-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={submitting}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Role */}
          <div className="space-y-1">
            <Label>{t('col_role')}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'worker' | 'auditor')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('col_role')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="worker">{t('role_worker')}</SelectItem>
                <SelectItem value="auditor">{t('role_auditor')}</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && <p className="text-xs text-destructive">{errors.role}</p>}
          </div>

          {/* Telegram user ID */}
          <div className="space-y-1">
            <Label htmlFor="manual-telegram">{t('col_telegram_id')}</Label>
            <Input
              id="manual-telegram"
              type="number"
              value={telegramUserId}
              onChange={(e) => setTelegramUserId(e.target.value)}
              disabled={submitting}
              aria-invalid={!!errors.telegram}
            />
            {errors.telegram && <p className="text-xs text-destructive">{errors.telegram}</p>}
          </div>

          {/* Project */}
          <div className="space-y-1">
            <Label>{t('col_project')}</Label>
            <Select value={projectId} onValueChange={(v: string | null) => setProjectId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('col_project')} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.project && <p className="text-xs text-destructive">{errors.project}</p>}
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }} disabled={submitting}>
              {common('cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? common('loading') : common('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ActivePeopleTable({ activePeople, projects }: ActivePeopleTableProps) {
  const t = useTranslations('dashboard.people');
  const [removeDialogState, setRemoveDialogState] = useState<{
    open: boolean;
    personName: string;
    assignmentId: string;
  }>({ open: false, personName: '', assignmentId: '' });
  const [manualAddOpen, setManualAddOpen] = useState(false);

  const groups = groupPeople(activePeople, projects);

  return (
    <div className="space-y-4">
      {/* Active People header + Add button */}
      <div className="flex items-center justify-between">
        <div /> {/* spacer — heading is in PeopleTab */}
        <Button variant="outline" onClick={() => setManualAddOpen(true)}>
          {t('add_manually')}
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{t('empty_active')}</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('col_name')}</TableHead>
                <TableHead scope="col">{t('col_role')}</TableHead>
                <TableHead scope="col">{t('col_telegram_id')}</TableHead>
                <TableHead scope="col">{t('col_project')}</TableHead>
                <TableHead scope="col">{t('col_actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) =>
                group.assignments.length === 0 ? (
                  <TableRow key={group.personId}>
                    <TableCell className="font-medium">{group.displayName}</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell>
                      <code className="font-mono text-xs">{group.telegramUserId.toString()}</code>
                    </TableCell>
                    <TableCell>—</TableCell>
                    <TableCell />
                  </TableRow>
                ) : (
                  group.assignments.map((assignment, idx) => (
                    <TableRow key={assignment.assignmentId}>
                      {/* Name only on first row */}
                      {idx === 0 ? (
                        <TableCell className="font-medium" rowSpan={group.assignments.length}>
                          {group.displayName}
                        </TableCell>
                      ) : null}

                      {/* Role badge */}
                      <TableCell>
                        <Badge variant={assignment.roleOnProject === 'auditor' ? 'secondary' : 'outline'}>
                          {assignment.roleOnProject === 'auditor' ? t('role_auditor') : t('role_worker')}
                        </Badge>
                      </TableCell>

                      {/* Telegram ID only on first row */}
                      {idx === 0 ? (
                        <TableCell rowSpan={group.assignments.length}>
                          <code className="font-mono text-xs">{group.telegramUserId.toString()}</code>
                        </TableCell>
                      ) : null}

                      {/* Project name */}
                      <TableCell>{assignment.projectName}</TableCell>

                      {/* Actions */}
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontalIcon />
                                <span className="sr-only">Actions</span>
                              </Button>
                            }
                          />
                          <DropdownMenuContent side="bottom" align="end">
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() =>
                                setRemoveDialogState({
                                  open: true,
                                  personName: group.displayName,
                                  assignmentId: assignment.assignmentId,
                                })
                              }
                            >
                              <Trash2Icon className="size-3.5" />
                              {t('remove_assignment')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Remove assignment confirmation dialog */}
      <RemoveAssignmentDialog
        open={removeDialogState.open}
        onClose={() => setRemoveDialogState(s => ({ ...s, open: false }))}
        personName={removeDialogState.personName}
        assignmentId={removeDialogState.assignmentId}
      />

      {/* Manual add person dialog */}
      <ManualAddDialog
        open={manualAddOpen}
        onClose={() => setManualAddOpen(false)}
        projects={projects}
      />
    </div>
  );
}
