'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { setUserRole } from '@/actions/users';

interface Props {
  userId: string;
  currentRole: string; // 'office_engineer' | 'audit_engineer'
}

/**
 * Inline role selector for the account panel. office_engineer ↔ audit_engineer
 * only (admin is domain-derived and not assignable). Persists via setUserRole.
 */
export function AccountRoleSelect({ userId, currentRole }: Props) {
  const t = useTranslations('dashboard.admin.users');
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const items: Record<string, string> = {
    office_engineer: t('role_office'),
    audit_engineer: t('role_audit'),
  };

  function handleChange(value: string | null) {
    const v = value ?? '';
    if (!v || v === role) return;
    const prev = role;
    setRole(v);
    setError('');
    startTransition(async () => {
      try {
        await setUserRole(userId, v);
        router.refresh();
      } catch {
        setRole(prev);
        setError(t('change_failed'));
      }
    });
  }

  return (
    <div className="space-y-1">
      <Select items={items} value={role} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="office_engineer">{t('role_office')}</SelectItem>
          <SelectItem value="audit_engineer">{t('role_audit')}</SelectItem>
        </SelectContent>
      </Select>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
