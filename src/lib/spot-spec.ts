import { badRequest } from "@/lib/errors";

/**
 * Parse a human-friendly spot list like "1-10, 12, A3, 15-18" into individual
 * spot labels. Numeric ranges expand; other tokens are taken verbatim.
 * Pure function — safe to unit-test without a database.
 */
export function parseSpotSpec(spec: string): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const rawToken of spec.split(/[,\n;]+/)) {
    const token = rawToken.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = parseInt(range[1], 10);
      const to = parseInt(range[2], 10);
      // Bound the endpoints before iterating — above Number.MAX_SAFE_INTEGER
      // `n++` no longer changes the value and the loop would never end.
      if (from > 100000 || to > 100000) {
        throw badRequest(`Range "${token}" is out of bounds (max 100000).`);
      }
      if (to < from) throw badRequest(`Invalid range "${token}".`);
      if (to - from > 500) throw badRequest(`Range "${token}" is too large.`);
      for (let n = from; n <= to; n++) {
        const label = String(n);
        if (!seen.has(label)) {
          seen.add(label);
          labels.push(label);
        }
      }
    } else {
      if (token.length > 10) {
        throw badRequest(`Spot label "${token}" is too long (max 10 chars).`);
      }
      if (!/^[\w-]+$/.test(token)) {
        throw badRequest(
          `Spot label "${token}" may only contain letters, digits and dashes.`
        );
      }
      if (!seen.has(token)) {
        seen.add(token);
        labels.push(token);
      }
    }
  }
  if (labels.length === 0) throw badRequest("No spot numbers provided.");
  if (labels.length > 1000) throw badRequest("Too many spots (max 1000).");
  return labels;
}
