import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  MessageSquare,
  CheckCircle2,
  MapPin,
  FileSpreadsheet,
  AlertTriangle,
  Languages,
} from 'lucide-react';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { Section } from '@/components/landing/Section';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

export default async function Home() {
  const t = await getTranslations('landing');

  return (
    <>
      {/* Skip-to-content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg"
      >
        {t('a11y.skip_to_content')}
      </a>

      <LandingHeader />

      <main id="main-content">

        {/* ── HERO ──────────────────────────────────────────────── */}
        <Section id="hero">
          <div className="flex flex-col gap-6 max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
              {t('hero.title')}
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              {t('hero.tagline')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/auth/signin"
                className={buttonVariants({ size: 'lg' })}
              >
                {t('hero.cta_primary')}
              </Link>
              <a
                href="mailto:burakkbayrak@gmail.com"
                className={buttonVariants({ variant: 'outline', size: 'lg' })}
              >
                {t('hero.cta_secondary')}
              </a>
            </div>
          </div>
        </Section>

        {/* ── PROBLEM → SOLUTION ────────────────────────────────── */}
        <Section id="problem" muted>
          <h2 className="text-xl font-semibold mb-8">{t('problem.heading')}</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Before */}
            <div className="rounded-xl border border-border bg-background p-6 flex flex-col gap-3">
              <h3 className="font-semibold text-foreground">{t('problem.before_title')}</h3>
              <p className="text-sm text-muted-foreground">{t('problem.before_body')}</p>
            </div>
            {/* After */}
            <div className="rounded-xl border border-border bg-background p-6 flex flex-col gap-3">
              <h3 className="font-semibold text-foreground">{t('problem.after_title')}</h3>
              <p className="text-sm text-muted-foreground">{t('problem.after_body')}</p>
            </div>
          </div>
        </Section>

        {/* ── HOW IT WORKS ──────────────────────────────────────── */}
        <Section id="how-it-works">
          <h2 className="text-xl font-semibold mb-8">{t('how.heading')}</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center size-8 rounded-full bg-muted text-sm font-semibold text-foreground shrink-0">
                  1
                </span>
                <h3 className="font-semibold">{t('how.step1_title')}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{t('how.step1_body')}</p>
            </div>
            {/* Step 2 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center size-8 rounded-full bg-muted text-sm font-semibold text-foreground shrink-0">
                  2
                </span>
                <h3 className="font-semibold">{t('how.step2_title')}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{t('how.step2_body')}</p>
            </div>
            {/* Step 3 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center size-8 rounded-full bg-muted text-sm font-semibold text-foreground shrink-0">
                  3
                </span>
                <h3 className="font-semibold">{t('how.step3_title')}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{t('how.step3_body')}</p>
            </div>
          </div>
        </Section>

        {/* ── KEY FEATURES ──────────────────────────────────────── */}
        <Section id="features" muted>
          <h2 className="text-xl font-semibold mb-8">{t('features.heading')}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle>{t('features.telegram_title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{t('features.telegram_body')}</CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle>{t('features.audit_title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{t('features.audit_body')}</CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle>{t('features.map_title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{t('features.map_body')}</CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle>{t('features.boq_title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{t('features.boq_body')}</CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle>{t('features.geo_title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{t('features.geo_body')}</CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Languages className="size-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle>{t('features.bilingual_title')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{t('features.bilingual_body')}</CardDescription>
              </CardContent>
            </Card>

          </div>
        </Section>

      </main>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col items-center gap-2 text-sm text-muted-foreground text-center">
          <p>{t('footer.tagline')}</p>
          <p>{t('footer.copyright')}</p>
        </div>
      </footer>
    </>
  );
}
