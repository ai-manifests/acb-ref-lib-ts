/**
 * Budget store — the ACB query contract.
 *
 * A BudgetStore is the ACB analogue of ADJ's JournalStore. It indexes
 * budget_committed, budget_cancelled, and settlement_recorded entries by
 * deliberation_id and by budget_id so deliberation runners and validators
 * can ask "what budget funds this deliberation" or "has this budget been
 * settled yet".
 *
 * The in-memory implementation is suitable for testing, prototypes, and
 * single-process runners. Production deployments will typically back
 * BudgetStore with a SQLite or Postgres journal that ALSO stores ADJ
 * entries — the ACB entries follow the ADJ common envelope precisely so
 * they can share storage.
 */

import type { AcbEntry, BudgetCancelled, BudgetCommitted, SettlementRecorded } from './entries.js';

export type BudgetState = 'posted' | 'active' | 'awaiting_outcome' | 'settled' | 'cancelled' | 'expired';

export interface BudgetStore {
  getBudgetForDeliberation(deliberationId: string): BudgetCommitted | null;
  getSettlementForDeliberation(deliberationId: string): SettlementRecorded | null;
  getCancellationForDeliberation(deliberationId: string): BudgetCancelled | null;
  getBudgetById(budgetId: string): BudgetCommitted | null;
  getBudgetState(budgetId: string): BudgetState;
  getAllEntries(): AcbEntry[];
}

export class InMemoryBudgetStore implements BudgetStore {
  private readonly entries: AcbEntry[] = [];

  append(entry: AcbEntry): void {
    this.entries.push(entry);
  }

  appendRange(entries: readonly AcbEntry[]): void {
    this.entries.push(...entries);
  }

  getBudgetForDeliberation(deliberationId: string): BudgetCommitted | null {
    return (
      this.entries.find(
        (e): e is BudgetCommitted =>
          e.entryType === 'budget_committed' && e.deliberationId === deliberationId,
      ) ?? null
    );
  }

  getSettlementForDeliberation(deliberationId: string): SettlementRecorded | null {
    const settlements = this.entries.filter(
      (e): e is SettlementRecorded =>
        e.entryType === 'settlement_recorded' && e.deliberationId === deliberationId,
    );
    if (settlements.length === 0) return null;
    return settlements.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )[0];
  }

  getCancellationForDeliberation(deliberationId: string): BudgetCancelled | null {
    return (
      this.entries.find(
        (e): e is BudgetCancelled =>
          e.entryType === 'budget_cancelled' && e.deliberationId === deliberationId,
      ) ?? null
    );
  }

  getBudgetById(budgetId: string): BudgetCommitted | null {
    return (
      this.entries.find(
        (e): e is BudgetCommitted =>
          e.entryType === 'budget_committed' && e.budgetId === budgetId,
      ) ?? null
    );
  }

  getBudgetState(budgetId: string): BudgetState {
    const budget = this.getBudgetById(budgetId);
    if (!budget) return 'posted';

    const cancelled = this.entries.find(
      (e): e is BudgetCancelled =>
        e.entryType === 'budget_cancelled' && e.budgetId === budgetId,
    );
    if (cancelled) return 'cancelled';

    const settled = this.entries.find(
      (e): e is SettlementRecorded =>
        e.entryType === 'settlement_recorded' && e.budgetId === budgetId,
    );
    if (settled) return 'settled';

    return 'active';
  }

  getAllEntries(): AcbEntry[] {
    return [...this.entries];
  }
}
