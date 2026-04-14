# acb-manifest

A TypeScript reference implementation of the **Agent Cognitive Budget (ACB)** protocol — the metabolic-budget layer for deliberative multi-agent systems. ACB provides append-only journal entries, pricing models, habit-memory discounts, and settlement distribution that mirror the brain's resource allocation for routine vs. contested decisions.

This library is one of several reference implementations ([C#](https://git.marketally.com/ai-manifests/acb-ref-lib-csharp), [Python](https://git.marketally.com/ai-manifests/acb-ref-lib-py)) of the same spec. The spec itself is at [adp-manifest.dev](https://adp-manifest.dev) and is the source of truth; this library implements what the spec says.

Zero runtime dependencies. Pure TypeScript, ESM.

## Install

```bash
npm install acb-manifest
```

## Quick example

```ts
import {
  InMemoryBudgetStore,
  computeDisagreementMagnitude,
  selectRoutine,
  computeExpensiveDraw,
  buildSettlementRecord,
  Routine,
  TerminationState,
  type BudgetCommitted,
  type Tally,
} from 'acb-manifest';

const initialTally: Tally = { approveWeight: 0.71, rejectWeight: 0.64, abstainWeight: 0.18 };
const magnitude = computeDisagreementMagnitude(initialTally);  // ≈ 0.948 (contested)

const routine = selectRoutine(pricingProfile, initialTally, /*roundCount*/ 1, TerminationState.Converged);
// routine === Routine.Expensive (unlock threshold exceeded)

const draw = computeExpensiveDraw(pricingProfile, /*participants*/ 3, /*rounds*/ 1, /*habitDiscount*/ 0.80);
// draw = 200 × 3 × 1.5^1 × (1 − 0.80) = 180 EU
```

## API

All exports are re-exported from the package root.

### Entry types

`AcbEntry`, `BudgetCommitted`, `BudgetCancelled`, `SettlementRecorded`

### Value types

`Denomination`, `PricingProfile`, `SettlementProfile`, `SettlementMode`, `BudgetConstraints`, `SubstrateDistribution`, `EpistemicDistribution`, `ContributionBreakdown`, `Tally`, `HistoricalDeliberation`, `ParticipantContribution`, `SubstrateReport`, `SettlementInputs`, `BudgetState`

### Enums

`Routine`, `TerminationState`, `SettlementMode`

### Pricing

- `computeDisagreementMagnitude(tally)` — `1 − |approve − reject| / (approve + reject)`, in [0, 1]
- `selectRoutine(pricing, tally, roundCount, termination)` — returns `Routine.Cheap` when the decision is an agreed-on routine; `Routine.Expensive` when contested
- `computeCheapDraw(pricing, participantCount, habitDiscount?)` — cheap-routine draw
- `computeExpensiveDraw(pricing, participantCount, roundCount, habitDiscount?)` — expensive-routine draw with round multiplier
- `computeDraw(pricing, tally, participantCount, roundCount, termination, habitDiscount?)` — convenience wrapper that picks a routine and computes the draw
- `computeHabitDiscount(history)` — habit-memory discount function, capped at `MAX_HABIT_DISCOUNT` (0.80)
- `MAX_HABIT_DISCOUNT` — exported constant

### Settlement

- `distributeSubstrate(pool, reports)` — substrate pool distribution proportional to reported cycles
- `distributeEpistemic(pool, contributions)` — default-v0 epistemic scoring with the four equal-weight bonuses (base, falsification, load-bearing, outcome correctness) plus dissent-quality penalty
- `buildSettlementRecord(inputs)` — builds a complete `SettlementRecorded` entry from contributions and substrate reports

### Store

- `InMemoryBudgetStore` — thread-safe in-memory budget store suitable for tests and prototypes
- `BudgetStore` — interface for custom backends

## Testing

```bash
npm test
```

## Spec

This library implements the Agent Cognitive Budget protocol specification. Read the spec at [adp-manifest.dev](https://adp-manifest.dev). If the spec and this library disagree, the spec is correct and this is a bug.

## License

Apache-2.0 — see [`LICENSE`](LICENSE) for the full license text and [`NOTICE`](NOTICE) for attribution.
