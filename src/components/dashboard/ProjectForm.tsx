'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createProject, updateProject } from '@/actions/projects';

const MAX_DESCRIPTION_CHARS = 500;

interface ProjectFormProps {
  mode: 'new' | 'edit';
  projectId?: string;
  defaultName?: string;
  defaultDescription?: string;
}

export function ProjectForm({
  mode,
  projectId,
  defaultName = '',
  defaultDescription = '',
}: ProjectFormProps) {
  const t = useTranslations('dashboard.projects');
  const common = useTranslations('common');
  const router = useRouter();

  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [nameError, setNameError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate on submit (not on blur — per UI-SPEC)
    if (!name.trim()) {
      setNameError(t('name_required'));
      nameRef.current?.focus();
      return;
    }
    setNameError('');
    setServerError('');
    setSubmitting(true);

    try {
      if (mode === 'new') {
        const project = await createProject({ name: name.trim(), description: description.trim() || undefined });
        router.push(`/dashboard/projects/${project.id}`);
      } else if (mode === 'edit' && projectId) {
        await updateProject(projectId, { name: name.trim(), description: description.trim() || undefined });
        router.push(`/dashboard/projects/${projectId}`);
      }
    } catch {
      setServerError(common('error_generic'));
    } finally {
      setSubmitting(false);
    }
  }

  const ctaText = mode === 'new' ? t('create_project') : t('save_changes');
  const backHref = mode === 'new' ? '/dashboard/projects' : `/dashboard/projects/${projectId}`;
  const backText = mode === 'new' ? t('back_to_projects') : t('back_to_project');
  const descRemaining = MAX_DESCRIPTION_CHARS - description.length;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6 max-w-xl">
      <div className="space-y-1.5">
        <Label htmlFor="project-name">{t('project_name_label')}</Label>
        <Input
          id="project-name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          aria-invalid={!!nameError}
          aria-describedby={nameError ? 'name-error' : undefined}
          disabled={submitting}
          placeholder={t('project_name_label')}
        />
        {nameError && (
          <p id="name-error" className="text-sm text-destructive">
            {nameError}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="project-description">{t('description_label')}</Label>
        <textarea
          id="project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_CHARS))}
          rows={4}
          maxLength={MAX_DESCRIPTION_CHARS}
          disabled={submitting}
          className="flex min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          placeholder={t('description_label')}
        />
        <p className="text-xs text-muted-foreground text-right">
          {descRemaining}/{MAX_DESCRIPTION_CHARS}
        </p>
      </div>

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? common('loading') : ctaText}
        </Button>
        <Button variant="ghost" disabled={submitting} render={<Link href={backHref} />}>
          {backText}
        </Button>
      </div>
    </form>
  );
}
