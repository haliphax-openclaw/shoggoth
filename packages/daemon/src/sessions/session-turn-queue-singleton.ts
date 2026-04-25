import { randomUUID } from "node:crypto";
import { log } from "../logging";
import type { Database } from "better-sqlite3";
import { TieredTurnQueue } from "./session-turn-queue";

/** @type {TieredTurnQueue | undefined} */
let turnQueueRef: TieredTurnQueue | undefined;

/**
 * Gets the singleton instance of the TieredTurnQueue.
 * @returns {TieredTurnQueue} The turn queue singleton instance.
 * @throws {Error} If the turn queue has not been initialized.
 */
export function getTurnQueue(): TieredTurnQueue {
  if (!turnQueueRef) {
    throw new Error("TurnQueue has not been initialized. Call setTurnQueue() first.");
  }
  return turnQueueRef;
}

/**
 * Sets the singleton instance of the TieredTurnQueue. Must be called early in daemon bootstrap.
 * @param queue The turn queue instance.
 */
export function setTurnQueue(queue: TieredTurnQueue): void {
  turnQueueRef = queue;
}
