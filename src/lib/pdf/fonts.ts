/**
 * src/lib/pdf/fonts.ts
 *
 * D-106: register DejaVu Sans + DejaVu Sans Bold for @react-pdf/renderer so the
 * EXP-04 hakkediş PDF renders Turkish glyphs (ğ ş ı ö ü ç) correctly.
 *
 * registerFonts() is called once at module scope from the PDF route handler so
 * the TTF parse cost is amortised across warm Vercel-function invocations.
 *
 * The two TTF files live in public/fonts/ (copied by Plan 11-01a Task 1) and
 * are bundled into the Vercel serverless function. Inside the function,
 * process.cwd() points to the project root, so path.join(process.cwd(),
 * 'public/fonts/DejaVuSans.ttf') resolves correctly (Research A3).
 *
 * WARNING 6 / T-11-04-FONT-MISSING mitigation: Font.register is wrapped in a
 * try/catch that logs a clear deployment-precondition error pointing at the
 * Plan 11-01a TTF copy step BEFORE re-throwing. This avoids a cryptic
 * read-eperm stack trace when the TTF files are accidentally missing from a
 * deployment bundle.
 */

import path from 'node:path';
import { Font } from '@react-pdf/renderer';

let registered = false;

export function registerFonts(): void {
  if (registered) return;
  try {
    Font.register({
      family: 'DejaVuSans',
      fonts: [
        { src: path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf') },
        {
          src: path.join(process.cwd(), 'public/fonts/DejaVuSans-Bold.ttf'),
          fontWeight: 'bold',
        },
      ],
    });
    registered = true;
  } catch (err) {
    console.error(
      'DejaVu TTF missing — PDF route will fail. ' +
      'Run Plan 11-01a TTF copy step: ' +
      'npm install dejavu-fonts-ttf && ' +
      'cp node_modules/dejavu-fonts-ttf/ttf/{DejaVuSans,DejaVuSans-Bold}.ttf public/fonts/',
      err,
    );
    throw err;
  }
}
