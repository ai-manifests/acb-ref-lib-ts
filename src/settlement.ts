/**
 * Settlement — spec §6.
 *
 * Distributes a draw across substrate providers and agent identities by their
 * journal-evidenced contribution. ACB v0 ships the `default-v0` profile with
 * four equal-weight epistemic bonus categories: base share, falsification
 * bonus, load-bearing bonus, and outcome correctness bonus, plus a dissent
 * quality penalty redistribution.
 */

import type {
  ContributionBreakdown,
  EpistemicDistribution,
  SettlementProfile,
  SettlementRecorded,
  SubstrateDistribution,
} from './entries.js';

export interface ParticipantContribution {
  readonly agentId: string;
  /** Whether the agent emitted a proposal_emitted entry. Required for any share. */
  readonly participated: boolean;
  /** Number of acknowledged falsification_evidence/amend events authored by this agent. */
  readonly acknowledgedFalsifications: number;
  /** Whether the agent's vote at deliberation_closed was load-bearing for convergence. */
  readonly loadBearing: boolean;
  /** Brier delta between agent's stated confidence and the realized outcome. Lower = better. Set to null when no outcome is available. */
  readonly outcomeBrierDelta: number | null;
  /** Whether the agent's contribution was flagged for dissent quality penalty. */
  readonly dissentQualityFlagged: boolean;
}

export interface SubstrateReport {
  readonly recipient: string;
  readonly cycles: number;
  readonly reportRef?: string;
}

/**
 * Compute the per-agent epistemic distribution under default-v0.
 *
 * The four bonus categories each get 25% of the epistemic pool:
 *  - base_share: split evenly across all participants
 *  - falsification_bonus: distributed proportionally to acknowledged falsifications
 *  - load_bearing_bonus: distributed evenly across agents whose votes were load-bearing
 *  - outcome_correctness_bonus: distributed inversely proportional to Brier delta (when outcome is known)
 *
 * The dissent_quality_penalty subtracts from flagged agents and redistributes
 * the recovered amount across non-flagged agents in proportion to their
 * pre-penalty totals.
 */
export function distributeEpistemic(
  pool: number,
  contributions: readonly ParticipantContribution[],
): EpistemicDistribution[] {
  const participants = contributions.filter((c) => c.participated);
  if (participants.length === 0) return [];

  const perBonus = pool / 4;

  // Base share — equal across all participants
  const baseShare = perBonus / participants.length;

  // Falsification bonus — proportional to acknowledged falsifications
  const totalFalsifications = participants.reduce((s, c) => s + c.acknowledgedFalsifications, 0);
  const falsificationFor = (c: ParticipantContribution): number =>
    totalFalsifications === 0 ? 0 : (perBonus * c.acknowledgedFalsifications) / totalFalsifications;

  // Load-bearing bonus — equal across load-bearing agents
  const loadBearingCount = participants.filter((c) => c.loadBearing).length;
  const loadBearingFor = (c: ParticipantContribution): number =>
    loadBearingCount === 0 ? 0 : c.loadBearing ? perBonus / loadBearingCount : 0;

  // Outcome correctness bonus — inverse Brier delta, normalized
  const withOutcomes = participants.filter((c) => c.outcomeBrierDelta != null);
  const inverseDeltas = withOutcomes.map((c) => 1 - (c.outcomeBrierDelta ?? 0));
  const totalInverse = inverseDeltas.reduce((s, v) => s + v, 0);
  const outcomeFor = (c: ParticipantContribution): number => {
    if (c.outcomeBrierDelta == null) return 0;
    if (totalInverse === 0) return 0;
    return (perBonus * (1 - c.outcomeBrierDelta)) / totalInverse;
  };

  const breakdowns = participants.map<{
    agent: string;
    breakdown: ContributionBreakdown;
    preTotal: number;
    flagged: boolean;
  }>((c) => {
    const breakdown: ContributionBreakdown = {
      baseShare,
      falsificationBonus: falsificationFor(c),
      loadBearingBonus: loadBearingFor(c),
      outcomeCorrectnessBonus: outcomeFor(c),
      dissentQualityPenalty: 0,
    };
    const preTotal =
      breakdown.baseShare
      + breakdown.falsificationBonus
      + breakdown.loadBearingBonus
      + breakdown.outcomeCorrectnessBonus;
    return { agent: c.agentId, breakdown, preTotal, flagged: c.dissentQualityFlagged };
  });

  // Dissent quality penalty — flagged agents lose up to 25% of their pre-total,
  // recovered amount redistributes across non-flagged agents pro-rata.
  const flaggedRecovered = breakdowns
    .filter((b) => b.flagged)
    .reduce((sum, b) => {
      const penalty = b.preTotal * 0.25;
      b.breakdown = { ...b.breakdown, dissentQualityPenalty: penalty };
      return sum + penalty;
    }, 0);

  if (flaggedRecovered > 0) {
    const nonFlagged = breakdowns.filter((b) => !b.flagged);
    const nonFlaggedTotal = nonFlagged.reduce((s, b) => s + b.preTotal, 0);
    if (nonFlaggedTotal > 0) {
      for (const b of nonFlagged) {
        const share = (flaggedRecovered * b.preTotal) / nonFlaggedTotal;
        // Distribute recovered amount into base_share so it's accounted for.
        b.breakdown = { ...b.breakdown, baseShare: b.breakdown.baseShare + share };
      }
    }
  }

  return breakdowns.map<EpistemicDistribution>((b) => ({
    recipient: b.agent,
    amount: round2(
      b.breakdown.baseShare
      + b.breakdown.falsificationBonus
      + b.breakdown.loadBearingBonus
      + b.breakdown.outcomeCorrectnessBonus
      - b.breakdown.dissentQualityPenalty,
    ),
    contributionBreakdown: {
      baseShare: round2(b.breakdown.baseShare),
      falsificationBonus: round2(b.breakdown.falsificationBonus),
      loadBearingBonus: round2(b.breakdown.loadBearingBonus),
      outcomeCorrectnessBonus: round2(b.breakdown.outcomeCorrectnessBonus),
      dissentQualityPenalty: round2(b.breakdown.dissentQualityPenalty),
    },
  }));
}

/**
 * Distribute the substrate share across reported cycle providers proportional
 * to reported cycles. Spec §6.3.
 *
 * If no reports exist the returned list is empty; callers should add the
 * unallocated substrate share to the epistemic pool per the spec.
 */
export function distributeSubstrate(
  pool: number,
  reports: readonly SubstrateReport[],
): SubstrateDistribution[] {
  if (reports.length === 0) return [];
  const totalCycles = reports.reduce((s, r) => s + r.cycles, 0);
  if (totalCycles === 0) return [];
  return reports.map((r) => ({
    recipient: r.recipient,
    amount: round2((pool * r.cycles) / totalCycles),
    basis: 'cycles',
    reportRef: r.reportRef,
  }));
}

export interface SettlementInputs {
  readonly entryId: string;
  readonly deliberationId: string;
  readonly timestamp: string;
  readonly priorEntryHash: string | null;
  readonly budgetId: string;
  readonly amountTotal: number;
  readonly drawTotal: number;
  readonly settlement: SettlementProfile;
  readonly contributions: readonly ParticipantContribution[];
  readonly substrateReports: readonly SubstrateReport[];
  readonly habitDiscountApplied: number;
  readonly unlockTriggered: boolean;
  readonly disagreementMagnitudeInitial: number;
  readonly outcomeReferenced: string | null;
  readonly signature: string;
}

/**
 * Build a settlement_recorded entry from the inputs by running the default-v0
 * distribution pipeline. The result is auditable end-to-end via acb-validate.
 */
export function buildSettlementRecord(inputs: SettlementInputs): SettlementRecorded {
  let substratePool = inputs.drawTotal * inputs.settlement.substrateShare;
  let epistemicPool = inputs.drawTotal * inputs.settlement.epistemicShare;

  let substrateDistributions = distributeSubstrate(substratePool, inputs.substrateReports);
  if (substrateDistributions.length === 0 && substratePool > 0) {
    // Spec §6.3: if no substrate reports, fold into epistemic pool.
    epistemicPool += substratePool;
    substratePool = 0;
    substrateDistributions = [];
  }

  const epistemicDistributions = distributeEpistemic(epistemicPool, inputs.contributions);

  return {
    entryType: 'settlement_recorded',
    entryId: inputs.entryId,
    deliberationId: inputs.deliberationId,
    timestamp: inputs.timestamp,
    priorEntryHash: inputs.priorEntryHash,
    budgetId: inputs.budgetId,
    settlementProfile: inputs.settlement.profile,
    outcomeReferenced: inputs.outcomeReferenced,
    drawTotal: round2(inputs.drawTotal),
    amountTotal: inputs.amountTotal,
    amountReturnedToRequester: round2(inputs.amountTotal - inputs.drawTotal),
    substrateDistributions,
    epistemicDistributions,
    habitDiscountApplied: inputs.habitDiscountApplied,
    unlockTriggered: inputs.unlockTriggered,
    disagreementMagnitudeInitial: inputs.disagreementMagnitudeInitial,
    signature: inputs.signature,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
