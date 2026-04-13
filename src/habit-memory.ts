/**
 * Habit memory discount — spec §7.
 *
 * The default-v0 discount function is:
 *
 *   habitDiscount(d) = min(0.80, similarity(d, history) × stability(history))
 *
 * Where similarity ∈ [0, 1] is action-similarity against prior committed
 * actions, and stability ∈ [0, 1] is the fraction of prior similar
 * deliberations whose outcome was observed and was successful.
 *
 * The 0.80 cap is intentional: a 100% discount would drive familiar
 * decisions to zero cost and remove the federation's incentive to keep
 * checking, which is the analogue of the brain's continued (cheap but
 * non-zero) attention to habitual stimuli.
 */

export interface HistoricalDeliberation {
  /** A scalar in [0, 1] capturing how similar this prior is to the current action. */
  readonly similarity: number;
  /** Whether the deliberation's outcome was observed AND was successful. */
  readonly successfulOutcome: boolean;
}

export const MAX_HABIT_DISCOUNT = 0.80;

/**
 * Compute the habit discount from a list of similar prior deliberations.
 * Implementations supply their own similarity function (string match,
 * embedding distance, etc.) and pass the resulting per-prior records here.
 */
export function computeHabitDiscount(history: readonly HistoricalDeliberation[]): number {
  if (history.length === 0) return 0;

  let weightSum = 0;
  let weightedSuccess = 0;
  let maxSimilarity = 0;
  for (const h of history) {
    weightSum += h.similarity;
    if (h.successfulOutcome) weightedSuccess += h.similarity;
    if (h.similarity > maxSimilarity) maxSimilarity = h.similarity;
  }

  if (weightSum === 0) return 0;

  // Stability is the success fraction weighted by similarity — a prior that
  // is barely similar contributes proportionally less to the stability signal.
  const stability = weightedSuccess / weightSum;

  // The product of how similar the priors are and how stable they were.
  const raw = maxSimilarity * stability;
  return Math.min(MAX_HABIT_DISCOUNT, raw);
}
