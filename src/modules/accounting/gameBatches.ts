import * as moment from 'moment-timezone';
import { CAFE_TIME_ZONE } from '../../utils/cafeTime';
import { StockHistoryStatusEnum as S } from './accounting.dto';

// Game batches of one stock location (the online depot by default).
//
// A batch is one arrival of a game at the depot: an expense entry or a manual
// stock entry. Arrivals on the same day are one batch. Batches are used up in
// arrival order (FIFO) by everything that leaves the depot: sales, transfers
// to other locations (a game sent to a slow cafe leaves the batch the day it
// leaves the depot) and other decreases (counts, losses). Order cancels,
// transfers back into the depot and other increases go back into the oldest
// open batch, or, when none is open, are used up first by the next decreases.
// Deleting or editing an expense corrects the batch it created instead of
// counting as a sale.

export const GAME_BATCH_DEPOT_LOCATION = 6;
const FINISH_RATIO = 0.9;
const PAIRED_UPDATE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type GameStockEvent = {
  _id: number;
  change: number;
  status: string;
  createdAt: Date;
  // For transfers out of the depot: where the games went, when known.
  transferLocation?: number;
};

export type GameBatch = {
  productId: string;
  batchNo: number;
  purchaseDate: string;
  purchasedQuantity: number;
  soldQuantity: number;
  transferredQuantity: number;
  transfers: { location: number | null; quantity: number }[];
  otherOutQuantity: number;
  returnedQuantity: number;
  remainingQuantity: number;
  isActive: boolean;
  sellStartDate: string | null;
  endDate: string | null;
  finish90Date: string | null;
  // Days from the first game leaving the batch until the last one did (today
  // while it is open), null while nothing has left it.
  duration: number | null;
  // Days from the first game leaving until 90% of the batch had left.
  duration90: number | null;
  // Days from arrival until the batch was used up (today while open).
  shelfDuration: number;
  averageSalesPerDay: number;
  stockHistoryId: number;
};

const SALE_STATUSES = new Set<string>([
  S.ORDERCREATE,
  S.IKASORDERCREATE,
  S.SHOPIFYORDERCREATE,
  S.TRENDYOLORDERCREATE,
  S.HEPSIBURADAORDERCREATE,
  S.N11ORDERCREATE,
  S.IDEFIXORDERCREATE,
  S.AMAZONORDERCREATE,
  S.ORDERCANCEL,
  S.IKASORDERCANCEL,
  S.SHOPIFYORDERCANCEL,
  S.TRENDYOLORDERCANCEL,
  S.HEPSIBURADAORDERCANCEL,
  S.N11ORDERCANCEL,
  S.IDEFIXORDERCANCEL,
  S.AMAZONORDERCANCEL,
  S.ORDERRETURN,
]);
const TRANSFER_STATUSES = new Set<string>([
  S.STOCKTRANSFER,
  S.PICKUPSTOCKTRANSFER,
]);
const ARRIVAL_STATUSES = new Set<string>([
  S.EXPENSEENTRY,
  S.EXPENSEUPDATEENTRY,
  S.STOCKENTRY,
]);
const EXPENSE_REMOVAL_STATUSES = new Set<string>([
  S.EXPENSEDELETE,
  S.EXPENSEUPDATEDELETE,
]);

const cafeDay = (date: Date) =>
  moment.tz(date, CAFE_TIME_ZONE).format('YYYY-MM-DD');

const daysBetween = (from: Date, to: Date) =>
  Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));

type OutKind = 'sale' | 'transfer' | 'other';
type OutChunk = { quantity: number; kind: OutKind; location: number | null };

type WorkingBatch = {
  arrival: Date;
  day: string;
  stockHistoryId: number;
  purchased: number;
  remaining: number;
  sold: number;
  transferred: Map<number | null, number>;
  otherOut: number;
  returned: number;
  sellStart: Date | null;
  end: Date | null;
  finish90: Date | null;
};

export function computeGameBatches(
  productId: string,
  events: GameStockEvent[],
  now: Date = new Date(),
): GameBatch[] {
  const sorted = [...events]
    .filter((e) => e.change !== 0)
    .sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a._id - b._id,
    );

  const batches: WorkingBatch[] = [];
  // Increases with no open batch to go back into.
  let loose = 0;
  // Decreases with no stock recorded; the next arrival covers them.
  const missing: OutChunk[] = [];

  const markFinished = (batch: WorkingBatch, date: Date) => {
    const left = batch.purchased - batch.remaining;
    if (!batch.finish90 && left >= Math.ceil(batch.purchased * FINISH_RATIO)) {
      batch.finish90 = date;
    }
    if (batch.remaining <= 0 && !batch.end) batch.end = date;
  };

  const countOut = (
    batch: WorkingBatch,
    used: number,
    date: Date,
    kind: OutKind,
    location: number | null,
  ) => {
    batch.remaining -= used;
    if (!batch.sellStart) batch.sellStart = date;
    if (kind === 'sale') batch.sold += used;
    else if (kind === 'other') batch.otherOut += used;
    else {
      batch.transferred.set(
        location,
        (batch.transferred.get(location) ?? 0) + used,
      );
    }
    markFinished(batch, date);
  };

  const takeOut = (
    quantity: number,
    date: Date,
    kind: OutKind,
    location: number | null = null,
  ) => {
    let rest = quantity;
    const fromLoose = Math.min(loose, rest);
    loose -= fromLoose;
    rest -= fromLoose;
    for (const batch of batches) {
      if (rest <= 0) break;
      if (batch.remaining <= 0) continue;
      const used = Math.min(batch.remaining, rest);
      rest -= used;
      countOut(batch, used, date, kind, location);
    }
    if (rest > 0) missing.push({ quantity: rest, kind, location });
  };

  const putBack = (quantity: number) => {
    let rest = quantity;
    while (rest > 0 && missing.length) {
      const chunk = missing[missing.length - 1];
      const used = Math.min(chunk.quantity, rest);
      chunk.quantity -= used;
      rest -= used;
      if (chunk.quantity <= 0) missing.pop();
    }
    if (rest <= 0) return;
    const open = batches.find((b) => b.remaining > 0);
    if (open) {
      open.remaining += rest;
      open.returned += rest;
    } else {
      loose += rest;
    }
  };

  // Corrects a batch's quantity after its expense was edited or deleted.
  // Games that already left the batch stay counted; the part of a decrease
  // that is no longer in the batch is taken from the depot like any decrease.
  const changeBatch = (batch: WorkingBatch, delta: number, date: Date) => {
    if (delta >= 0) {
      batch.purchased += delta;
      batch.remaining += delta;
      if (batch.remaining > 0) batch.end = null;
      return;
    }
    const fromBatch = Math.min(batch.remaining, -delta);
    batch.purchased -= fromBatch;
    batch.remaining -= fromBatch;
    if (fromBatch < -delta) takeOut(-delta - fromBatch, date, 'other');
    if (batch.purchased <= 0) {
      batches.splice(batches.indexOf(batch), 1);
    } else if (batch.remaining <= 0 && !batch.end && batch.sellStart) {
      batch.end = date;
    }
  };

  const arrive = (event: GameStockEvent) => {
    const day = cafeDay(event.createdAt);
    const last = batches[batches.length - 1];
    let batch: WorkingBatch;
    if (last && last.day === day) {
      batch = last;
      batch.purchased += event.change;
      batch.remaining += event.change;
      batch.end = null;
    } else {
      batch = {
        arrival: event.createdAt,
        day,
        stockHistoryId: event._id,
        purchased: event.change,
        remaining: event.change,
        sold: 0,
        transferred: new Map(),
        otherOut: 0,
        returned: 0,
        sellStart: null,
        end: null,
        finish90: null,
      };
      batches.push(batch);
    }
    // Games that left before this arrival was recorded came from it.
    while (missing.length && batch.remaining > 0) {
      const chunk = missing[0];
      const used = Math.min(chunk.quantity, batch.remaining);
      chunk.quantity -= used;
      countOut(batch, used, event.createdAt, chunk.kind, chunk.location);
      if (chunk.quantity <= 0) missing.shift();
    }
  };

  // The batch an expense of this size most likely created.
  const findExpenseBatch = (quantity: number) => {
    for (let i = batches.length - 1; i >= 0; i--) {
      if (batches[i].purchased === quantity) return batches[i];
    }
    return batches[batches.length - 1];
  };

  // An edited expense is written as a removal of the old one followed by
  // an entry of the new one; read the pair as one change of the batch.
  const pairedEntries = new Set<GameStockEvent>();
  const findPairedEntry = (index: number) => {
    const removal = sorted[index];
    for (let j = index + 1; j < sorted.length; j++) {
      const next = sorted[j];
      const gap = next.createdAt.getTime() - removal.createdAt.getTime();
      if (gap > PAIRED_UPDATE_MS) return undefined;
      if (
        next.status === S.EXPENSEUPDATEENTRY &&
        next.change > 0 &&
        !pairedEntries.has(next)
      ) {
        return next;
      }
    }
    return undefined;
  };

  for (let index = 0; index < sorted.length; index++) {
    const event = sorted[index];
    if (pairedEntries.has(event)) continue;
    const quantity = Math.abs(event.change);
    const isIncrease = event.change > 0;

    if (EXPENSE_REMOVAL_STATUSES.has(event.status) && !isIncrease) {
      const batch = findExpenseBatch(quantity);
      const entry =
        event.status === S.EXPENSEUPDATEDELETE
          ? findPairedEntry(index)
          : undefined;
      if (entry) pairedEntries.add(entry);
      const delta = (entry?.change ?? 0) - quantity;
      if (batch) {
        changeBatch(batch, delta, event.createdAt);
      } else if (delta < 0) {
        takeOut(-delta, event.createdAt, 'other');
      } else if (entry && delta > 0) {
        arrive({ ...entry, change: delta });
      }
      continue;
    }

    if (event.status === S.EXPENSEUPDATE) {
      const batch = batches[batches.length - 1];
      if (batch) changeBatch(batch, event.change, event.createdAt);
      else if (isIncrease) arrive(event);
      else takeOut(quantity, event.createdAt, 'other');
      continue;
    }

    if (isIncrease) {
      if (ARRIVAL_STATUSES.has(event.status)) arrive(event);
      else putBack(quantity);
      continue;
    }

    if (SALE_STATUSES.has(event.status)) {
      takeOut(quantity, event.createdAt, 'sale');
    } else if (TRANSFER_STATUSES.has(event.status)) {
      takeOut(
        quantity,
        event.createdAt,
        'transfer',
        event.transferLocation ?? null,
      );
    } else {
      takeOut(quantity, event.createdAt, 'other');
    }
  }

  return batches.map((batch, index) => {
    const isActive = batch.remaining > 0;
    const end = isActive ? now : batch.end ?? now;
    const left = batch.purchased - batch.remaining;
    const duration = batch.sellStart ? daysBetween(batch.sellStart, end) : null;
    const transfers = [...batch.transferred.entries()].map(
      ([location, quantity]) => ({ location, quantity }),
    );
    return {
      productId,
      batchNo: index + 1,
      purchaseDate: cafeDay(batch.arrival),
      purchasedQuantity: batch.purchased,
      soldQuantity: batch.sold,
      transferredQuantity: transfers.reduce((sum, t) => sum + t.quantity, 0),
      transfers,
      otherOutQuantity: batch.otherOut,
      returnedQuantity: batch.returned,
      remainingQuantity: batch.remaining,
      isActive,
      sellStartDate: batch.sellStart ? cafeDay(batch.sellStart) : null,
      endDate: !isActive && batch.end ? cafeDay(batch.end) : null,
      finish90Date: batch.finish90 ? cafeDay(batch.finish90) : null,
      duration,
      duration90:
        batch.sellStart && batch.finish90
          ? daysBetween(batch.sellStart, batch.finish90)
          : null,
      shelfDuration: daysBetween(batch.arrival, end),
      averageSalesPerDay:
        duration && left > 0 ? parseFloat((left / duration).toFixed(2)) : 0,
      stockHistoryId: batch.stockHistoryId,
    };
  });
}
