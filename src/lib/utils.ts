import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Loose UUID matcher — any 8-4-4-4-12 hex string. Use for validating IDs that
 * are also FK-checked at the database (e.g. projectId), where the DB is the real
 * guard. Zod v4's `.uuid()` is strict about the RFC version/variant nibbles and
 * rejects deterministic fixture/seed IDs (e.g. dd000000-0000-0000-0000-...) that
 * Postgres's own `uuid` type accepts — this avoids that mismatch.
 */
export const UUID_LIKE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
