'use client';

/**
 * PdfViewer.tsx
 *
 * Inline PDF viewer for the Kaynak Belge section (D-06, RTE-03).
 *
 * 'use client' — react-pdf uses browser APIs (canvas, window).
 * Parent imports via dynamic(() => import('./PdfViewer'), { ssr: false })
 * to avoid Next.js SSR errors.
 *
 * Worker setup: MUST be at module scope, outside the component.
 * The import.meta.url pattern is the only approach that works correctly
 * in Next.js 15 App Router (import.meta.url resolves to the absolute
 * bundled URL at build time; no dynamic path manipulation needed).
 *
 * Accessibility: prev/next buttons use icon-only design with aria-labels
 * per UI-SPEC ("Önceki sayfa" / "Sonraki sayfa").
 */

import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BrandButton } from '@/components/brand/BrandButton';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Worker setup — module scope, outside component (UI-SPEC react-pdf notes)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  /** Vercel Blob public URL of the PDF file */
  url: string;
}

export function PdfViewer({ url }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loadError, setLoadError] = useState<boolean>(false);

  function onDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n);
    setCurrentPage(1);
  }

  function onDocumentLoadError() {
    setLoadError(true);
  }

  if (loadError) {
    return (
      <p className="text-sm text-muted-foreground">
        PDF yüklenemedi. Dosyayı doğrudan indirmeyi deneyin.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* PDF document — width 100% of card body */}
      <div className="w-full overflow-hidden rounded-md border border-slate-200">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              PDF yükleniyor…
            </div>
          }
        >
          <Page
            pageNumber={currentPage}
            width={undefined} // let CSS drive width
            className="w-full"
            renderTextLayer
            renderAnnotationLayer
          />
        </Document>
      </div>

      {/* Navigation (only shown for multi-page PDFs) */}
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <BrandButton
            variant="ghost"
            size="sm"
            aria-label="Önceki sayfa"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </BrandButton>
          <span className="text-xs text-muted-foreground tabular-nums">
            {currentPage} / {numPages}
          </span>
          <BrandButton
            variant="ghost"
            size="sm"
            aria-label="Sonraki sayfa"
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
          >
            <ChevronRight className="h-4 w-4" />
          </BrandButton>
        </div>
      )}
    </div>
  );
}
