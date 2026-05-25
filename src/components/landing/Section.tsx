import React from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  id?: string;
  children: React.ReactNode;
  muted?: boolean;
  className?: string;
}

/**
 * Landing page section wrapper.
 * Enforces 8pt spacing grid (py-16) and max-w-5xl container matching TopNav.
 * Alternates bg-muted / bg-background via the muted prop.
 */
export function Section({ id, children, muted, className }: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'py-16 sm:py-20',
        muted ? 'bg-muted' : 'bg-background',
        className
      )}
    >
      <div className="max-w-5xl mx-auto px-6">
        {children}
      </div>
    </section>
  );
}
