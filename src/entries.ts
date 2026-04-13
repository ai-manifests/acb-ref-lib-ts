/**
 * ACB entry types — extend the ADJ common envelope (spec §3.0) so they can
 * be appended to the same journal as ADJ entries and inherit hash chaining,
 * append-only guarantees, and replay verification.
 */

export interface Denomination {
  readonly unit: 'EU';
  readonly externalUnit?: string;
  readonly externalRate?: number;
  readonly rateSource?: string;
}

export interface PricingProfile {
  readonly profile: string;
  readonly cheapRoutineRate: number;
  readonly expensiveRoutineRate: number;
  readonly roundMultiplier: number;
  readonly unlockThreshold: number;
  readonly habitMemoryDiscount?: string;
}

export type SettlementMode = 'immediate' | 'deferred' | 'two_phase';

export interface SettlementProfile {
  readonly profile: string;
  readonly mode: SettlementMode;
  readonly outcomeWindowSeconds?: number;
  readonly substrateShare: number;
  readonly epistemicShare: number;
  readonly unspentReturnsTo: string;
}

export interface BudgetConstraints {
  readonly maxParticipants?: number;
  readonly maxRounds?: number;
  readonly irrevocable?: boolean;
}

export interface SubstrateDistribution {
  readonly recipient: string;
  readonly amount: number;
  readonly basis: string;
  readonly reportRef?: string;
}

export interface ContributionBreakdown {
  readonly baseShare: number;
  readonly falsificationBonus: number;
  readonly loadBearingBonus: number;
  readonly outcomeCorrectnessBonus: number;
  readonly dissentQualityPenalty: number;
}

export interface EpistemicDistribution {
  readonly recipient: string;
  readonly amount: number;
  readonly contributionBreakdown?: ContributionBreakdown;
}

interface BaseEntry {
  readonly entryId: string;
  readonly deliberationId: string;
  readonly timestamp: string;
  readonly priorEntryHash: string | null;
}

export interface BudgetCommitted extends BaseEntry {
  readonly entryType: 'budget_committed';
  readonly budgetId: string;
  readonly budgetAuthority: string;
  readonly postedAt?: string;
  readonly denomination: Denomination;
  readonly amountTotal: number;
  readonly pricing: PricingProfile;
  readonly settlement: SettlementProfile;
  readonly constraints?: BudgetConstraints;
  readonly signature: string;
}

export interface BudgetCancelled extends BaseEntry {
  readonly entryType: 'budget_cancelled';
  readonly budgetId: string;
  readonly budgetAuthority: string;
  readonly reason: string;
  readonly signature: string;
}

export interface SettlementRecorded extends BaseEntry {
  readonly entryType: 'settlement_recorded';
  readonly budgetId: string;
  readonly settlementProfile: string;
  readonly outcomeReferenced: string | null;
  readonly drawTotal: number;
  readonly amountTotal: number;
  readonly amountReturnedToRequester: number;
  readonly substrateDistributions: readonly SubstrateDistribution[];
  readonly epistemicDistributions: readonly EpistemicDistribution[];
  readonly habitDiscountApplied: number;
  readonly unlockTriggered: boolean;
  readonly disagreementMagnitudeInitial: number;
  readonly signature: string;
}

export type AcbEntry = BudgetCommitted | BudgetCancelled | SettlementRecorded;
