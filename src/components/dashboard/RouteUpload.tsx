'use client';

/**
 * RouteUpload.tsx
 *
 * Client component: handles .geojson file selection → calls uploadRoute →
 * shows Validating / success / specific-error Alert states per UI-SPEC #4b.
 *
 * D-07: accepts only .geojson files; server validates WGS84 LineString.
 * T-06-05: file type restricted to .geojson on the accept attribute.
 */

import { useRef, useState, useTransition } from 'react';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { uploadRoute } from '@/actions/routes';

interface RouteUploadProps {
  projectId: string;
  onSuccess?: (count: number) => void;
}

type UploadState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'valid'; count: number; fileContent: string }
  | { status: 'error'; errorCode: string; actualType?: string }
  | { status: 'saving' }
  | { status: 'saved'; count: number };

export function RouteUpload({ projectId, onSuccess }: RouteUploadProps) {
  const t = useTranslations('dashboard.route');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleFileSelect(file: File) {
    if (!file.name.endsWith('.geojson')) {
      setUploadState({ status: 'error', errorCode: 'NOT_GEOJSON_EXT' });
      return;
    }

    setUploadState({ status: 'validating' });

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        setUploadState({ status: 'error', errorCode: 'NOT_VALID_JSON' });
        return;
      }

      // Client-side parse to show immediate feedback; server re-validates on save
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        setUploadState({ status: 'error', errorCode: 'NOT_VALID_JSON' });
        return;
      }

      // Check geometry type for actualType error message
      const obj = parsed as Record<string, unknown>;
      if (obj?.type === 'Feature' || obj?.type === 'FeatureCollection') {
        const geomType =
          (obj?.geometry as Record<string, unknown>)?.type as string | undefined ??
          (obj?.features as Array<{ geometry: { type: string } }>)?.[0]?.geometry?.type;

        if (geomType && geomType !== 'LineString') {
          setUploadState({ status: 'error', errorCode: 'NOT_LINESTRING', actualType: geomType });
          return;
        }
      }

      // Looks plausible — keep content in state to pass to server on save
      // Count coordinates for optimistic preview
      let count = 0;
      try {
        if (obj?.type === 'Feature') {
          const coords = (obj as { geometry: { coordinates: unknown[] } }).geometry?.coordinates;
          count = Array.isArray(coords) ? coords.length : 0;
        } else if (obj?.type === 'FeatureCollection') {
          const feats = obj?.features as Array<{ geometry: { coordinates: unknown[] } }>;
          count = feats?.[0]?.geometry?.coordinates?.length ?? 0;
        }
      } catch {
        count = 0;
      }

      setUploadState({ status: 'valid', count, fileContent: content });
    };
    reader.readAsText(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    // Reset input value so same file can be re-selected
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleSave() {
    if (uploadState.status !== 'valid') return;
    const { fileContent } = uploadState;

    setUploadState({ status: 'saving' });
    startTransition(async () => {
      const result = await uploadRoute(projectId, fileContent);
      if (result.ok) {
        setUploadState({ status: 'saved', count: result.count });
        toast.success(t('valid_route', { count: result.count }));
        onSuccess?.(result.count);
      } else {
        setUploadState({
          status: 'error',
          errorCode: result.error ?? 'NOT_GEOJSON',
          actualType: result.actualType,
        });
      }
    });
  }

  function reset() {
    setUploadState({ status: 'idle' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Validating spinner ───────────────────────────────────────────────────
  if (uploadState.status === 'validating' || uploadState.status === 'saving') {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-sm">{t('validating')}</span>
      </div>
    );
  }

  // ── Valid file — show success alert + Save button ────────────────────────
  if (uploadState.status === 'valid') {
    return (
      <div className="space-y-4">
        <Alert className="border-[hsl(142_76%_36%)] bg-[hsl(142_76%_36%)]/10">
          <CheckCircle className="h-4 w-4 text-[hsl(142_76%_36%)]" />
          <AlertDescription className="text-[hsl(142_76%_36%)]">
            {t('valid_route', { count: uploadState.count })}
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isPending}>
            {t('save_route')}
          </Button>
          <Button variant="outline" onClick={reset}>
            {/* Cancel / pick another file */}
            İptal
          </Button>
        </div>
      </div>
    );
  }

  // ── Saved confirmation ───────────────────────────────────────────────────
  if (uploadState.status === 'saved') {
    return (
      <Alert className="border-[hsl(142_76%_36%)] bg-[hsl(142_76%_36%)]/10">
        <CheckCircle className="h-4 w-4 text-[hsl(142_76%_36%)]" />
        <AlertDescription className="text-[hsl(142_76%_36%)]">
          {t('valid_route', { count: uploadState.count })}
        </AlertDescription>
      </Alert>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (uploadState.status === 'error') {
    const { errorCode, actualType } = uploadState;
    let errorMessage: string;
    if (errorCode === 'NOT_VALID_JSON' || errorCode === 'NOT_GEOJSON_EXT') {
      errorMessage = t('error_not_json');
    } else if (errorCode === 'NOT_GEOJSON') {
      errorMessage = t('error_not_geojson');
    } else if (errorCode === 'NOT_LINESTRING') {
      errorMessage = t('error_not_linestring', { actualType: actualType ?? 'Unknown' });
    } else {
      errorMessage = t('error_not_geojson');
    }

    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={reset}>
          {t('choose_file')}
        </Button>
      </div>
    );
  }

  // ── Idle: drop zone ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson"
        className="hidden"
        onChange={handleInputChange}
        aria-label={t('upload_label')}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label={t('upload_label')}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        className={[
          'flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3',
          'rounded-lg border-2 border-dashed transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary hover:bg-primary/5',
        ].join(' ')}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('upload_label')}</p>
        <p className="text-xs text-muted-foreground">{t('upload_sublabel')}</p>
      </div>
      <div className="flex justify-center">
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          {t('choose_file')}
        </Button>
      </div>
    </div>
  );
}
