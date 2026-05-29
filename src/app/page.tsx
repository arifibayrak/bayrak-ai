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
import {
  BrandButton,
  BrandCard,
  BrandHeading,
  BrandLogo,
} from '@/components/brand';

export default async function Home() {
  const t = await getTranslations('landing');

  return (
    <>
      {/* Skip-to-content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
      >
        {t('a11y.skip_to_content')}
      </a>

      <LandingHeader />

      <main id="main-content">

        {/* ── HERO ──────────────────────────────────────────────── */}
        <Section
          id="hero"
          className="bg-slate-50 pt-20 pb-20 sm:pt-28 sm:pb-28"
        >
          <div className="flex flex-col gap-7 max-w-2xl">
            <BrandLogo size="lg" />
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {t('hero.eyebrow')}
            </span>
            <BrandHeading as="h1" size="display">
              {t('hero.headline')}
            </BrandHeading>
            <p className="max-w-xl text-lg sm:text-xl leading-relaxed text-muted-foreground">
              {t('hero.tagline')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <BrandButton
                variant="primary"
                size="lg"
                render={<Link href="/auth/signin" />}
              >
                {t('hero.cta_primary')}
              </BrandButton>
              <BrandButton
                variant="outline"
                size="lg"
                render={<a href="mailto:burakkbayrak@gmail.com" />}
              >
                {t('hero.cta_secondary')}
              </BrandButton>
            </div>
          </div>
        </Section>

        {/* ── PROBLEM → SOLUTION ────────────────────────────────── */}
        <Section id="problem" muted>
          <BrandHeading as="h2" size="h1" className="mb-10">
            {t('problem.heading')}
          </BrandHeading>
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Before */}
            <BrandCard>
              <BrandCard.Body className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <AlertTriangle className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-base font-semibold text-foreground">{t('problem.before_title')}</h3>
                </div>
                <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{t('problem.before_body')}</p>
              </BrandCard.Body>
            </BrandCard>
            {/* After */}
            <BrandCard className="border-primary/25 bg-primary/[0.04]">
              <BrandCard.Body className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-base font-semibold text-foreground">{t('problem.after_title')}</h3>
                </div>
                <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{t('problem.after_body')}</p>
              </BrandCard.Body>
            </BrandCard>
          </div>
        </Section>

        {/* ── HOW IT WORKS ──────────────────────────────────────── */}
        <Section id="how-it-works">
          <BrandHeading as="h2" size="h1" className="mb-10">
            {t('how.heading')}
          </BrandHeading>
          <div className="grid sm:grid-cols-3 gap-8 sm:gap-6">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center size-9 rounded-md bg-primary text-sm font-bold text-primary-foreground shrink-0 tabular-nums">
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
          <BrandHeading as="h2" size="h1" className="mb-10">
            {t('features.heading')}
          </BrandHeading>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { Icon: MessageSquare, key: 'telegram' },
              { Icon: CheckCircle2, key: 'audit' },
              { Icon: MapPin, key: 'map' },
              { Icon: FileSpreadsheet, key: 'boq' },
              { Icon: AlertTriangle, key: 'geo' },
              { Icon: Languages, key: 'bilingual' },
            ].map(({ Icon, key }) => (
              <BrandCard key={key}>
                <BrandCard.Header className="pb-2">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="text-base font-semibold tracking-tight">
                      {t(`features.${key}_title`)}
                    </h3>
                  </div>
                </BrandCard.Header>
                <BrandCard.Body className="pt-0">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`features.${key}_body`)}
                  </p>
                </BrandCard.Body>
              </BrandCard>
            ))}
          </div>
        </Section>

      </main>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card py-10">
        <div className="max-w-5xl mx-auto px-6 flex flex-col items-center gap-3 text-center">
          <BrandLogo size="md" />
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{t('footer.tagline')}</p>
          <p className="text-xs text-muted-foreground/80">{t('footer.copyright')}</p>
        </div>
      </footer>
    </>
  );
}
