'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontalIcon, PencilIcon, Trash2Icon, FolderIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { deleteProject } from '@/actions/projects';

interface ProjectCardProps {
  id: string;
  name: string;
  createdAt: Date;
  boqCount: number;
  peopleCount: number;
}

export function ProjectCard({ id, name, createdAt, boqCount, peopleCount }: ProjectCardProps) {
  const t = useTranslations('dashboard.projects');
  const common = useTranslations('common');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const createdDate = createdAt
    ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(createdAt))
    : '';

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteProject(id);
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FolderIcon className="size-4 text-muted-foreground shrink-0" />
            <Link
              href={`/dashboard/projects/${id}`}
              className="text-base font-semibold leading-tight hover:underline truncate"
            >
              {name}
            </Link>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" className="shrink-0">
                  <MoreHorizontalIcon />
                  <span className="sr-only">Actions</span>
                </Button>
              }
            />
            <DropdownMenuContent side="bottom" align="end">
              <DropdownMenuItem>
                <Link href={`/dashboard/projects/${id}/edit`} className="flex items-center gap-2 w-full">
                  <PencilIcon className="size-3.5" />
                  {t('edit')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmOpen(true)}
              >
                <Trash2Icon className="size-3.5" />
                {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>{createdDate}</p>
          <p className="flex gap-4">
            <span>{boqCount} BOQ</span>
            <span>{peopleCount} Personel</span>
          </p>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete')}</DialogTitle>
            <DialogDescription>
              {common('delete_project_confirm', { projectName: name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              {common('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? common('loading') : common('yes_delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
