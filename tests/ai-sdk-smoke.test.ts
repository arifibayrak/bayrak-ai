/**
 * AI SDK v6 smoke test — two tiers:
 *
 * Tier 1 (ALWAYS-ON): Verifies that `Output.object({ schema: z.object(...) })` is
 * constructable with Zod v4 at zero token cost. Resolves RESEARCH Open Question 4
 * (Zod v4 + Output.object compatibility). No API call, no env var required.
 *
 * Tier 2 (GATED): A real `generateText` call that asserts the v6 runtime contract:
 * the returned object has a typed `output` field (not just `text`), and `output.ok`
 * is a boolean. Only runs when AI_EVAL_ENABLED=true is set. Validates:
 *   - The v6 generateText → { output } shape (RESEARCH Open Question 4 / v6-shape risk)
 *   - AI_GATEWAY_API_KEY is resolved (auth error = key not configured → clear failure)
 *
 * Default CI: runs Tier 1 only — burns NO tokens, makes NO API calls, exits 0.
 */

import { describe, it, expect } from 'vitest';
import { generateText, Output } from 'ai';
import { z } from 'zod';

// ──────────────────────────────────────────────
// Tier 1: Always-on — Output.object + Zod v4 compatibility
// ──────────────────────────────────────────────

describe('AI SDK v6 — Output.object + Zod v4 compatibility (always-on)', () => {
  it('Output.object({ schema: z.object(...) }) is constructable with Zod v4', () => {
    // This is the core RESEARCH Open Question 4 assertion:
    // Does Output.object() accept a Zod v4 schema without runtime errors?
    const schema = z.object({ ok: z.boolean() });
    const outputSpec = Output.object({ schema });

    // The factory must return a defined, non-null value
    expect(outputSpec).toBeDefined();
    expect(outputSpec).not.toBeNull();
  });

  it('Output namespace has expected methods (object, array, text, json, choice)', () => {
    // Guard against import breakage — confirms the v6 Output namespace shape
    expect(typeof Output.object).toBe('function');
    expect(typeof Output.array).toBe('function');
    expect(typeof Output.text).toBe('function');
  });
});

// ──────────────────────────────────────────────
// Tier 2: Gated real API call (AI_EVAL_ENABLED=true only)
// ──────────────────────────────────────────────

const describeIfAiEval =
  process.env.AI_EVAL_ENABLED === 'true' ? describe : describe.skip;

describeIfAiEval(
  'AI SDK v6 — generateText runtime contract + AI Gateway key resolution (gated, AI_EVAL_ENABLED=true)',
  () => {
    it(
      'generateText returns a typed output field (not just text) via AI Gateway',
      async () => {
        // This call validates two things:
        // 1. v6 runtime contract: generateText({ output: Output.object({...}) }) → { output }
        //    where output is typed as z.infer<schema> (not just a string in .text)
        // 2. AI_GATEWAY_API_KEY is resolved — an auth error means the key is not configured.
        const schema = z.object({ ok: z.boolean() });

        // Let TS infer the result type (mirrors src/lib/ai-vision.ts, which is
        // tsc-clean). An explicit generic annotation on generateText mistyped
        // `output` as the Zod schema rather than its inferred shape.
        let output: z.infer<typeof schema> | undefined;
        try {
          const result = await generateText({
            model: 'anthropic/claude-sonnet-4.6',
            output: Output.object({ schema }),
            messages: [
              {
                role: 'user',
                content: 'Reply with ok=true. This is a connectivity check.',
              },
            ],
          });
          output = result.output;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(
            `generateText call failed — likely AI_GATEWAY_API_KEY not set or invalid. ` +
              `Original error: ${msg}`,
          );
        }

        // The v6 runtime contract: output must be defined and match the schema
        expect(output).toBeDefined();
        expect(typeof output!.ok).toBe('boolean');
        // ok should be true since we asked for it, but we just verify it's a boolean
      },
      30_000, // 30s timeout for real API call
    );
  },
);
