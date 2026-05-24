'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { approvePending, rejectPending } from '@/actions/people';

interface PendingPerson {
  id: string;
  telegramUserId: bigint;
  telegramName: string | null;
  startedAt: Date;
  tenantId: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface PendingPeopleTableProps {
  pendingPeople: PendingPerson[];
  projects: ProjectOption[];
}

function RelativeTime({ date }: { date: Date }) {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return <span>{diffMins} dk önce</span>;
  if (diffHours < 24) return <span>{diffHours} saat önce</span>;
  return <span>{diffDays} gün önce</span>;
}

function PendingRow({
  person,
  projects,
}: {
  person: PendingPerson;
  projects: ProjectOption[];
}) {
  const t = useTranslations('dashboard.people');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'worker' | 'auditor' | ''>('');
  const [projectId, setProjectId] = useState('');
  const [nameError, setNameError] = useState('');
  const [roleError, setRoleError] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  async function handleApprove() {
    // Validate on submit
    let valid = true;
    if (!displayName.trim()) {
      setNameError(t('name_required'));
      valid = false;
    } else {
      setNameError('');
    }
    if (!role) {
      setRoleError(t('role_required'));
      valid = false;
    } else {
      setRoleError('');
    }
    if (!valid) return;

    setApproving(true);
    try {
      await approvePending(person.id, {
        displayName: displayName.trim(),
        role: role as 'worker' | 'auditor',
        projectId: projectId || projects[0]?.id || '',
      });
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    setRejecting(true);
    try {
      await rejectPending(person.id);
    } finally {
      setRejecting(false);
    }
  }

  return (
    <TableRow>
      {/* Telegram Name */}
      <TableCell className="font-medium">{person.telegramName ?? '—'}</TableCell>

      {/* Telegram ID */}
      <TableCell>
        <code className="font-mono text-xs">{person.telegramUserId.toString()}</code>
      </TableCell>

      {/* Joined relative time */}
      <TableCell className="text-muted-foreground text-xs">
        <RelativeTime date={person.startedAt} />
      </TableCell>

      {/* Display name input */}
      <TableCell>
        <div className="space-y-1">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('col_name')}
            className="h-7 text-xs w-32"
            aria-invalid={!!nameError}
            disabled={approving}
          />
          {nameError && <p className="text-[11px] text-destructive">{nameError}</p>}
        </div>
      </TableCell>

      {/* Role select */}
      <TableCell>
        <div className="space-y-1">
          <Select value={role} onValueChange={(v: string | null) => setRole((v ?? '') as 'worker' | 'auditor' | '')}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue placeholder={t('col_role')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="worker">{t('role_worker')}</SelectItem>
              <SelectItem value="auditor">{t('role_auditor')}</SelectItem>
            </SelectContent>
          </Select>
          {roleError && <p className="text-[11px] text-destructive">{roleError}</p>}
        </div>
      </TableCell>

      {/* Project select */}
      <TableCell>
        <Select
          value={projectId}
          onValueChange={(v: string | null) => setProjectId(v ?? '')}
        >
          <SelectTrigger size="sm" className="w-36">
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
      </TableCell>

      {/* Actions */}
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={approving || rejecting}
          >
            {approving ? '...' : t('approve')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleReject}
            disabled={approving || rejecting}
          >
            {rejecting ? '...' : t('reject')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function PendingPeopleTable({ pendingPeople, projects }: PendingPeopleTableProps) {
  const t = useTranslations('dashboard.people');

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('col_telegram_name')}</TableHead>
            <TableHead scope="col">{t('col_telegram_id')}</TableHead>
            <TableHead scope="col">{t('col_joined')}</TableHead>
            <TableHead scope="col">{t('col_name')}</TableHead>
            <TableHead scope="col">{t('col_role')}</TableHead>
            <TableHead scope="col">{t('col_project')}</TableHead>
            <TableHead scope="col">{t('col_actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendingPeople.map((person) => (
            <PendingRow key={person.id} person={person} projects={projects} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
