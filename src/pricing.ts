/**
 * Pricing model — spec §4 and §5.
 *
 * Disagreement magnitude (§5.1) is the unlock signal. It is a scalar in [0, 1]
 * computed from a tally of weighted votes:
 *
 *   magnitude = 1 − |approve − reject| / (approve + reject)
 *
 * If non_abstaining_weight is 0 (everyone abstained) magnitude is 1.0 — total
 * abstention is treated as maximal disagreement because the cheap routine has
 * failed to find anyone willing to commit.
 */

import type { PricingProfile } from './entries.js';

export interface Tally {
  readonly approveWeight: number;
  readonly rejectWeight: number;
  readonly abstainWeight: number;
}

export type Routine = 'cheap' | 'expensive';

export type TerminationState = 'converged' | 'partial_commit' | 'deadlocked';

/**
 * Compute disagreement magnitude from a weighted tally. Spec §5.1.
 */
export function computeDisagreementMagnitude(tally: Tally): number {
  const nonAbstaining = tally.approveWeight + tally.rejectWeight;
  if (nonAbstaining === 0) return 1.0;
  return 1 - Math.abs(tally.approveWeight - tally.rejectWeight) / nonAbstaining;
}

/**
 * Decide which routine applies. Spec §4.1 / §4.2 / §5.2.
 *
 * The cheap routine MUST apply when ALL of:
 *  - roundCount === 0
 *  - disagreementMagnitude(initialTally) < pricing.unlockThreshold
 *  - termination === 'converged'
 *
 * The expensive routine MUST apply when ANY of:
 *  - disagreementMagnitude(initialTally) >= pricing.unlockThreshold
 *  - roundCount > 0
 *  - termination is 'partial_commit' or 'deadlocked'
 */
export function selectRoutine(
  pricing: PricingProfile,
  initialTally: Tally,
  roundCount: number,
  termination: TerminationState,
): Routine {
  if (roundCount > 0) return 'expensive';
  if (termination !== 'converged') return 'expensive';
  const magnitude = computeDisagreementMagnitude(initialTally);
  if (magnitude >= pricing.unlockThreshold) return 'expensive';
  return 'cheap';
}

/**
 * Compute the cheap-routine draw. Spec §4.1.
 *
 *   draw = cheapRoutineRate × participantCount × (1 − habitDiscount)
 */
export function computeCheapDraw(
  pricing: PricingProfile,
  participantCount: number,
  habitDiscount: number = 0,
): number {
  return pricing.cheapRoutineRate * participantCount * (1 - habitDiscount);
}

/**
 * Compute the expensive-routine draw. Spec §4.2.
 *
 *   draw = expensiveRoutineRate × participantCount × roundMultiplier^roundCount × (1 − habitDiscount)
 *
 * The exponential round multiplier reflects that each additional belief-update
 * round addresses, by selection, the disagreement the prior round failed to
 * resolve — the remaining work is harder.
 */
export function computeExpensiveDraw(
  pricing: PricingProfile,
  participantCount: number,
  roundCount: number,
  habitDiscount: number = 0,
): number {
  const base = pricing.expensiveRoutineRate * participantCount;
  return base * Math.pow(pricing.roundMultiplier, roundCount) * (1 - habitDiscount);
}

/**
 * Compute the draw given a routine. Convenience wrapper around the two helpers.
 */
export function computeDraw(
  pricing: PricingProfile,
  routine: Routine,
  participantCount: number,
  roundCount: number,
  habitDiscount: number = 0,
): number {
  return routine === 'cheap'
    ? computeCheapDraw(pricing, participantCount, habitDiscount)
    : computeExpensiveDraw(pricing, participantCount, roundCount, habitDiscount);
}
