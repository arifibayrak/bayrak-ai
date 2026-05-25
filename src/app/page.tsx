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
import { cn } from '@/lib/utils';
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
        <Section
          id="hero"
          className="bg-gradient-to-b from-accent/60 via-background to-background pt-20 pb-20 sm:pt-28 sm:pb-28"
        >
          <div className="flex flex-col gap-7 max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {t('hero.eyebrow')}
            </span>
            <h1 className="text-display text-foreground">{t('hero.headline')}</h1>
            <p className="max-w-xl text-lg sm:text-xl leading-relaxed text-muted-foreground">
              {t('hero.tagline')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Link
                href="/auth/signin"
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'h-12 rounded-xl px-6 text-[0.95rem] shadow-sm',
                )}
              >
                {t('hero.cta_primary')}
              </Link>
              <a
                href="mailto:burakkbayrak@gmail.com"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'h-12 rounded-xl px-6 text-[0.95rem]',
                )}
              >
                {t('hero.cta_secondary')}
              </a>
            </div>
          </div>
        </Section>

        {/* ── PROBLEM → SOLUTION ────────────────────────────────── */}
        <Section id="problem" muted>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-10">
            {t('problem.heading')}
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Before */}
            <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <AlertTriangle className="size-5" aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold text-foreground">{t('problem.before_title')}</h3>
              </div>
              <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{t('problem.before_body')}</p>
            </div>
            {/* After */}
            <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold text-foreground">{t('problem.after_title')}</h3>
              </div>
              <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{t('problem.after_body')}</p>
            </div>
          </div>
        </Section>

        {/* ── HOW IT WORKS ──────────────────────────────────────── */}
        <Section id="how-it-works">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-10">
            {t('how.heading')}
          </h2>
          <div className="grid sm:grid-cols-3 gap-8 sm:gap-6">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center size-9 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm shrink-0 tabular-nums">
                    {step}
                  </span>
                  <h3 className="text-base font-semibold tracking-tight">
                    {t(`how.step${step}_title`)}
                  </h3>
                </div>
                <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
                  {t(`how.step${step}_body`)}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── KEY FEATURES ──────────────────────────────────────── */}
        <Section id="features" muted>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-10">
            {t('features.heading')}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { Icon: MessageSquare, key: 'telegram' },
              { Icon: CheckCircle2, key: 'audit' },
              { Icon: MapPin, key: 'map' },
              { Icon: FileSpreadsheet, key: 'boq' },
              { Icon: AlertTriangle, key: 'geo' },
              { Icon: Languages, key: 'bilingual' },
            ].map(({ Icon, key }) => (
              <Card key={key} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <CardTitle>{t(`features.${key}_title`)}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-relaxed">
                    {t(`features.${key}_body`)}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

      </main>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card py-10">
        <div className="max-w-5xl mx-auto px-6 flex flex-col items-center gap-3 text-center">
          <span className="text-base font-bold tracking-tight">bayrak.ai</span>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{t('footer.tagline')}</p>
          <p className="text-xs text-muted-foreground/80">{t('footer.copyright')}</p>
        </div>
      </footer>
    </>
  );
}
