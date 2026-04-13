/**
 * ACB spec §8 worked example as an executable test.
 *
 * The same `dlb_01HMXJ3E9R` PR merge from the ADJ §9 worked example, with a
 * 12,000 EU budget posted, the contested deliberation running for one round,
 * the maximum habit discount applying (familiar repo with stable history),
 * and a 180 EU draw distributed across two substrate providers and three
 * agents per default-v0.
 */

import { describe, it, expect } from 'vitest';
import {
  InMemoryBudgetStore,
  computeDisagreementMagnitude,
  selectRoutine,
  computeCheapDraw,
  computeExpensiveDraw,
  computeHabitDiscount,
  buildSettlementRecord,
  MAX_HABIT_DISCOUNT,
  type BudgetCommitted,
  type ParticipantContribution,
  type SubstrateReport,
  type Tally,
  type PricingProfile,
  type SettlementProfile,
} from '../src/index.js';

const DLB = 'dlb_01HMXJ3E9R';
const BGT = 'bgt_01HMXJ3E9R';
const AUTHORITY = 'did:requester:acme-platform';
const TEST_RUNNER = 'did:adp:test-runner-v2';
const SCANNER = 'did:adp:security-scanner-v3';
const LINTER = 'did:adp:style-linter-v1';

const PRICING: PricingProfile = {
  profile: 'default-v0',
  cheapRoutineRate: 50,
  expensiveRoutineRate: 200,
  roundMultiplier: 1.5,
  unlockThreshold: 0.30,
  habitMemoryDiscount: 'default-v0',
};

const SETTLEMENT: SettlementProfile = {
  profile: 'default-v0',
  mode: 'deferred',
  outcomeWindowSeconds: 604800,
  substrateShare: 0.20,
  epistemicShare: 0.80,
  unspentReturnsTo: AUTHORITY,
};

function makeBudget(): BudgetCommitted {
  return {
    entryType: 'budget_committed',
    entryId: 'adj_01HMXM9A',
    deliberationId: DLB,
    timestamp: '2026-04-11T14:30:00.000Z',
    priorEntryHash: null,
    budgetId: BGT,
    budgetAuthority: AUTHORITY,
    postedAt: '2026-04-11T14:30:00.000Z',
    denomination: { unit: 'EU', externalUnit: 'USD', externalRate: 0.0001 },
    amountTotal: 12000,
    pricing: PRICING,
    settlement: SETTLEMENT,
    constraints: { maxParticipants: 8, maxRounds: 4, irrevocable: false },
    signature: 'ed25519:6f3a',
  };
}

describe('ACB PR Merge Budget', () => {
  it('disagreement magnitude on a 50/50 split is 1.0', () => {
    const tally: Tally = { approveWeight: 0.71, rejectWeight: 0.71, abstainWeight: 0 };
    expect(computeDisagreementMagnitude(tally)).toBeCloseTo(1.0, 5);
  });

  it('disagreement magnitude on full agreement is 0.0', () => {
    const tally: Tally = { approveWeight: 0.89, rejectWeight: 0, abstainWeight: 0.18 };
    expect(computeDisagreementMagnitude(tally)).toBe(0);
  });

  it('disagreement magnitude on total abstention is 1.0', () => {
    const tally: Tally = { approveWeight: 0, rejectWeight: 0, abstainWeight: 1.5 };
    expect(computeDisagreementMagnitude(tally)).toBe(1);
  });

  it('low-signal outlier (90/10) stays under unlock threshold by default', () => {
    const tally: Tally = { approveWeight: 0.9, rejectWeight: 0.1, abstainWeight: 0 };
    const magnitude = computeDisagreementMagnitude(tally);
    expect(magnitude).toBeLessThan(PRICING.unlockThreshold);
  });

  it('cheap routine fires on agreement with no rounds', () => {
    const tally: Tally = { approveWeight: 0.95, rejectWeight: 0.05, abstainWeight: 0 };
    const routine = selectRoutine(PRICING, tally, 0, 'converged');
    expect(routine).toBe('cheap');
  });

  it('expensive routine fires on disagreement above threshold', () => {
    const tally: Tally = { approveWeight: 0.71, rejectWeight: 0.64, abstainWeight: 0.18 };
    const routine = selectRoutine(PRICING, tally, 0, 'converged');
    expect(routine).toBe('expensive');
  });

  it('expensive routine fires when round_count > 0 even with low magnitude', () => {
    const tally: Tally = { approveWeight: 0.95, rejectWeight: 0.05, abstainWeight: 0 };
    const routine = selectRoutine(PRICING, tally, 1, 'converged');
    expect(routine).toBe('expensive');
  });

  it('expensive routine fires on deadlock', () => {
    const tally: Tally = { approveWeight: 0.5, rejectWeight: 0.5, abstainWeight: 0 };
    expect(selectRoutine(PRICING, tally, 0, 'deadlocked')).toBe('expensive');
  });

  it('cheap draw matches spec §4.3 trivial PR scenario', () => {
    expect(computeCheapDraw(PRICING, 3, 0)).toBe(150);
  });

  it('cheap draw with 80% habit discount drops to 30 EU', () => {
    expect(computeCheapDraw(PRICING, 3, 0.80)).toBeCloseTo(30, 5);
  });

  it('expensive draw with one round matches spec §4.3', () => {
    expect(computeExpensiveDraw(PRICING, 3, 1, 0)).toBe(900);
  });

  it('expensive draw with three rounds compounds correctly', () => {
    // 200 × 4 × 1.5^3 = 800 × 3.375 = 2700
    expect(computeExpensiveDraw(PRICING, 4, 3, 0)).toBe(2700);
  });

  it('habit discount caps at 0.80', () => {
    const history = Array.from({ length: 100 }, () => ({
      similarity: 1.0,
      successfulOutcome: true,
    }));
    expect(computeHabitDiscount(history)).toBe(MAX_HABIT_DISCOUNT);
  });

  it('habit discount with high similarity but unstable history shrinks', () => {
    const history = Array.from({ length: 100 }, (_, i) => ({
      similarity: 0.9,
      successfulOutcome: i < 50,
    }));
    const discount = computeHabitDiscount(history);
    // 0.9 max similarity × 0.5 stability = 0.45
    expect(discount).toBeCloseTo(0.45, 2);
  });

  it('habit discount is zero when there is no prior history', () => {
    expect(computeHabitDiscount([])).toBe(0);
  });

  it('reproduces the spec §8 worked example end-to-end (180 EU draw)', () => {
    const budget = makeBudget();
    const initialTally: Tally = { approveWeight: 0.71, rejectWeight: 0.64, abstainWeight: 0.18 };
    const roundCount = 1;

    const magnitude = computeDisagreementMagnitude(initialTally);
    expect(magnitude).toBeGreaterThan(budget.pricing.unlockThreshold);

    const routine = selectRoutine(budget.pricing, initialTally, roundCount, 'converged');
    expect(routine).toBe('expensive');

    // 47 prior similar deliberations, 96% successful → discount caps at 0.80
    const history = Array.from({ length: 47 }, (_, i) => ({
      similarity: 0.85,
      successfulOutcome: i < 45,
    }));
    const habitDiscount = computeHabitDiscount(history);
    expect(habitDiscount).toBe(MAX_HABIT_DISCOUNT);

    const draw = computeExpensiveDraw(budget.pricing, 3, roundCount, habitDiscount);
    expect(draw).toBeCloseTo(180, 5);
  });

  it('builds a settlement record that returns the unspent budget to the requester', () => {
    const budget = makeBudget();
    const drawTotal = 180;

    const contributions: ParticipantContribution[] = [
      {
        agentId: TEST_RUNNER,
        participated: true,
        acknowledgedFalsifications: 2,
        loadBearing: true,
        outcomeBrierDelta: 0.0196, // (0.86 − 1.0)²
        dissentQualityFlagged: false,
      },
      {
        agentId: SCANNER,
        participated: true,
        acknowledgedFalsifications: 1,
        loadBearing: false,
        outcomeBrierDelta: 0.0441, // (0.79 − 1.0)²
        dissentQualityFlagged: false,
      },
      {
        agentId: LINTER,
        participated: true,
        acknowledgedFalsifications: 0,
        loadBearing: false,
        outcomeBrierDelta: 0.1444, // (0.62 − 1.0)²
        dissentQualityFlagged: false,
      },
    ];

    const reports: SubstrateReport[] = [
      { recipient: 'did:substrate:acme-cluster-eu', cycles: 200, reportRef: 'cluster/8821443' },
      { recipient: 'did:substrate:openai-azure', cycles: 100, reportRef: 'openai/run-9912' },
    ];

    const record = buildSettlementRecord({
      entryId: 'adj_01HMZQ7K',
      deliberationId: DLB,
      timestamp: '2026-04-14T09:30:00.000Z',
      priorEntryHash: null,
      budgetId: BGT,
      amountTotal: budget.amountTotal,
      drawTotal,
      settlement: budget.settlement,
      contributions,
      substrateReports: reports,
      habitDiscountApplied: 0.80,
      unlockTriggered: true,
      disagreementMagnitudeInitial: 0.948,
      outcomeReferenced: 'adj_01HMZP2D',
      signature: 'ed25519:7a4b',
    });

    // 180 EU drawn, 12000 − 180 = 11820 returned
    expect(record.amountReturnedToRequester).toBe(11820);
    expect(record.drawTotal).toBe(180);

    // Substrate distributions: 36 EU split 2/3 + 1/3 by cycles
    expect(record.substrateDistributions).toHaveLength(2);
    expect(record.substrateDistributions[0]?.amount).toBe(24);
    expect(record.substrateDistributions[1]?.amount).toBe(12);

    // Distributions sum to drawTotal within rounding tolerance
    const subSum = record.substrateDistributions.reduce((s, d) => s + d.amount, 0);
    const epiSum = record.epistemicDistributions.reduce((s, d) => s + d.amount, 0);
    expect(Math.abs(subSum + epiSum - drawTotal)).toBeLessThan(0.5);

    // The agent that did the falsification work earns the most
    const tr = record.epistemicDistributions.find((d) => d.recipient === TEST_RUNNER);
    const lt = record.epistemicDistributions.find((d) => d.recipient === LINTER);
    expect(tr).toBeDefined();
    expect(lt).toBeDefined();
    expect(tr!.amount).toBeGreaterThan(lt!.amount);
  });

  it('store tracks budget lifecycle states', () => {
    const store = new InMemoryBudgetStore();
    const budget = makeBudget();
    store.append(budget);
    expect(store.getBudgetState(BGT)).toBe('active');

    const settlement = buildSettlementRecord({
      entryId: 'adj_01HMZQ7K',
      deliberationId: DLB,
      timestamp: '2026-04-14T09:30:00.000Z',
      priorEntryHash: null,
      budgetId: BGT,
      amountTotal: budget.amountTotal,
      drawTotal: 150,
      settlement: budget.settlement,
      contributions: [
        {
          agentId: TEST_RUNNER,
          participated: true,
          acknowledgedFalsifications: 0,
          loadBearing: true,
          outcomeBrierDelta: 0.05,
          dissentQualityFlagged: false,
        },
      ],
      substrateReports: [],
      habitDiscountApplied: 0,
      unlockTriggered: false,
      disagreementMagnitudeInitial: 0.1,
      outcomeReferenced: null,
      signature: 'ed25519:7a4b',
    });

    store.append(settlement);
    expect(store.getBudgetState(BGT)).toBe('settled');
    expect(store.getSettlementForDeliberation(DLB)).not.toBeNull();
  });

  it('cancellation locks the budget out of settlement', () => {
    const store = new InMemoryBudgetStore();
    store.append({
      entryType: 'budget_cancelled',
      entryId: 'adj_cancel',
      deliberationId: DLB,
      timestamp: '2026-04-11T14:31:00.000Z',
      priorEntryHash: null,
      budgetId: BGT,
      budgetAuthority: AUTHORITY,
      reason: 'no longer needed',
      signature: 'ed25519:9c8d',
    });
    store.append(makeBudget());
    expect(store.getBudgetState(BGT)).toBe('cancelled');
  });
});
