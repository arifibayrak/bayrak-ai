import { describe, it, expect } from 'vitest';
import {
  deriveProjectStatus,
  projectStatusBadgeVariant,
  PROJECT_STATUS,
  type ProjectStatusInput,
} from '@/lib/project-status';

const NOW = new Date('2026-06-02T12:00:00Z');
const THRESHOLDS = { stalledDays: 7, rejectionRateThreshold: 0.3 };

function base(overrides: Partial<ProjectStatusInput> = {}): ProjectStatusInput {
  return {
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    lastApprovedAt: null,
    contractedValueByCurrency: {},
    earnedValueByCurrency: {},
    ...overrides,
  };
}

describe('deriveProjectStatus', () => {
  it('NOT_STARTED when there are no submissions', () => {
    const r = deriveProjectStatus(base(), THRESHOLDS, NOW);
    expect(r.status).toBe(PROJECT_STATUS.NOT_STARTED);
    expect(r.progressPct).toBeNull();
  });

  it('COMPLETE when earned >= contracted, even with recent activity', () => {
    const r = deriveProjectStatus(
      base({
        approvedCount: 5,
        lastApprovedAt: '2026-06-02T10:00:00Z',
        contractedValueByCurrency: { TRY: '1000' },
        earnedValueByCurrency: { TRY: '1000' },
      }),
      THRESHOLDS,
      NOW,
    );
    expect(r.status).toBe(PROJECT_STATUS.COMPLETE);
    expect(r.progressPct).toBe(100);
    expect(r.primaryCurrency).toBe('TRY');
  });

  it('STALLED when started but no approval within stalledDays', () => {
    const r = deriveProjectStatus(
      base({
        approvedCount: 2,
        lastApprovedAt: '2026-05-20T12:00:00Z', // 13 days before NOW
        contractedValueByCurrency: { TRY: '1000' },
        earnedValueByCurrency: { TRY: '200' },
      }),
      THRESHOLDS,
      NOW,
    );
    expect(r.status).toBe(PROJECT_STATUS.STALLED);
  });

  it('STALLED when submissions exist but none ever approved', () => {
    const r = deriveProjectStatus(
      base({ pendingCount: 3, lastApprovedAt: null }),
      THRESHOLDS,
      NOW,
    );
    expect(r.status).toBe(PROJECT_STATUS.STALLED);
  });

  it('AT_RISK when rejection rate exceeds threshold (and recently active)', () => {
    const r = deriveProjectStatus(
      base({
        approvedCount: 5,
        rejectedCount: 5, // 50% > 30%
        lastApprovedAt: '2026-06-01T12:00:00Z',
        contractedValueByCurrency: { TRY: '1000' },
        earnedValueByCurrency: { TRY: '300' },
      }),
      THRESHOLDS,
      NOW,
    );
    expect(r.status).toBe(PROJECT_STATUS.AT_RISK);
    expect(r.rejectionRate).toBeCloseTo(0.5, 5);
  });

  it('ON_TRACK when active, low rejection, below completion', () => {
    const r = deriveProjectStatus(
      base({
        approvedCount: 8,
        rejectedCount: 1,
        lastApprovedAt: '2026-06-02T09:00:00Z',
        contractedValueByCurrency: { TRY: '1000' },
        earnedValueByCurrency: { TRY: '400' },
      }),
      THRESHOLDS,
      NOW,
    );
    expect(r.status).toBe(PROJECT_STATUS.ON_TRACK);
    expect(r.progressPct).toBe(40);
  });

  it('picks the largest-contract currency as primary', () => {
    const r = deriveProjectStatus(
      base({
        approvedCount: 1,
        lastApprovedAt: '2026-06-02T09:00:00Z',
        contractedValueByCurrency: { TRY: '500', USD: '9000' },
        earnedValueByCurrency: { USD: '1000' },
      }),
      THRESHOLDS,
      NOW,
    );
    expect(r.primaryCurrency).toBe('USD');
  });

  it('progressPct is null when nothing is priced', () => {
    const r = deriveProjectStatus(
      base({ approvedCount: 3, lastApprovedAt: '2026-06-02T09:00:00Z' }),
      THRESHOLDS,
      NOW,
    );
    expect(r.progressPct).toBeNull();
    expect(r.status).toBe(PROJECT_STATUS.ON_TRACK);
  });
});

describe('projectStatusBadgeVariant', () => {
  it('maps each status to a badge variant', () => {
    expect(projectStatusBadgeVariant(PROJECT_STATUS.COMPLETE)).toBe('success');
    expect(projectStatusBadgeVariant(PROJECT_STATUS.ON_TRACK)).toBe('info');
    expect(projectStatusBadgeVariant(PROJECT_STATUS.AT_RISK)).toBe('warning');
    expect(projectStatusBadgeVariant(PROJECT_STATUS.STALLED)).toBe('destructive');
    expect(projectStatusBadgeVariant(PROJECT_STATUS.NOT_STARTED)).toBe('neutral');
  });
});
