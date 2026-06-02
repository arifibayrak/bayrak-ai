'use client';

/**
 * LandXmlUpload — import a LandXML/InfraModel alignment as the project route.
 *
 * Reads the file client-side, lets the engineer pick the projected CRS (same
 * Turkey presets as the DXF flow), and calls uploadLandXml(). When the file
 * carries a vertical profile, designed elevation is imported automatically and
 * shows in the elevation profile chart below.
 */

import { useState, useTransition, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Mountain, Upload } from 'lucide-react';
import { BrandButton } from '@/components/brand';
import { uploadLandXml } from '@/actions/routes';

const CRS_PRESETS: { epsg: number; labelKey: string }[] = [
  { epsg: 5254, labelKey: 'crs_5254' },
  { epsg: 5253, labelKey: 'crs_5253' },
  { epsg: 5255, labelKey: 'crs_5255' },
  { epsg: 23035, labelKey: 'crs_23035' },
  { epsg: 23036, labelKey: 'crs_23036' },
  { epsg: 32635, labelKey: 'crs_32635' },
  { epsg: 32636, labelKey: 'crs_32636' },
];

export function LandXmlUpload({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: (count: number, routeId: string) => void;
}) {
  const t = useTranslations('dashboard.route');
  const tl = useTranslations('dashboard.route.landxml');
  const [crs, setCrs] = useState(5254);
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; count: number; hasVerticalProfile: boolean; warnings: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setFileName(file.name);
    setContent(await file.text());
  }

  function handleImport() {
    if (!content) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await uploadLandXml(projectId, content, crs);
      if (!res.ok) {
        setError(res.error || tl('error'));
        return;
      }
      setResult({ name: res.name, count: res.count, hasVerticalProfile: res.hasVerticalProfile, warnings: res.warnings });
      onSuccess(res.count, res.id);
    });
  }

  const warnKey = (w: string) =>
    w === 'spiral_linear'
      ? tl('warn_spiral')
      : w === 'vertical_circular_approx'
        ? tl('warn_vertical_linear')
        : w === 'outside_turkey_bbox'
          ? tl('warn_outside')
          : null;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Mountain className="size-4 text-primary" aria-hidden="true" />
        {tl('section_label')}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">{tl('choose_file')}</label>
          <input
            ref={inputRef}
            type="file"
            accept=".xml,.landxml,application/xml,text/xml"
            onChange={handleFile}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{tl('crs_label')}</label>
          <select
            value={String(crs)}
            onChange={(e) => setCrs(Number(e.target.value))}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CRS_PRESETS.map((p) => (
              <option key={p.epsg} value={p.epsg}>
                {t(p.labelKey as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </div>
        <BrandButton variant="secondary" size="sm" onClick={handleImport} disabled={!content || pending}>
          <Upload className="size-4" aria-hidden="true" />
          {pending ? tl('importing') : tl('import')}
        </BrandButton>
      </div>

      {fileName ? <p className="text-xs text-muted-foreground">{fileName}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {result ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium text-emerald-700">
            {tl('success', { name: result.name, count: result.count })}
          </p>
          <p className="text-muted-foreground">
            {result.hasVerticalProfile ? tl('with_profile_note') : tl('no_profile_note')}
          </p>
          {result.warnings.map((w) => {
            const msg = warnKey(w);
            return msg ? (
              <p key={w} className="text-xs text-amber-600">⚠ {msg}</p>
            ) : null;
          })}
        </div>
      ) : null}
    </div>
  );
}
