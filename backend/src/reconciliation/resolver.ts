/**
 * Automated resolution workflows for reconciliation mismatches.
 * Each handler returns true when a resolution was attempted (success or fail).
 * The worker escalates after maxResolutionAttempts.
 */

import { logger } from '../utils/logger.js'
import { listMismatches, updateMismatchStatus, listOpenMismatchesPastSla } from './store.js'
import type { Mismatch } from './types.js'
import { DEFAULT_TOLERANCE_RULES } from './types.js'
import { applyIdempotentRepair, repairKey, hasRepairBeenApplied } from './repair.js'

const MAX_AUTO_ATTEMPTS_DEFAULT = 3

function getMaxAttempts(mismatch: Mismatch): number {
  const rule = DEFAULT_TOLERANCE_RULES.find((r) =>
    mismatch.traceContext.rail === r.rail,
  )
  return rule?.maxResolutionAttempts ?? MAX_AUTO_ATTEMPTS_DEFAULT
}

// ── Repair effect (injectable) ────────────────────────────────────────────────

/**
 * Posts the missing credit for a `missing_credit` mismatch. In production this
 * re-queries the PSP (`provider.fetchSettlement()`) and credits the ledger.
 * Injectable so it can be wired to the real poster and asserted in tests.
 */
export type MissingCreditPoster = (mismatch: Mismatch) => Promise<void>

let postMissingCredit: MissingCreditPoster = async (mismatch) => {
  // Placeholder until the PSP reconciliation integration lands.
  logger.info('[resolver] (placeholder) would post missing credit', { id: mismatch.id })
}

export function setMissingCreditPoster(fn: MissingCreditPoster): void {
  postMissingCredit = fn
}

// ── Per-class resolution handlers ─────────────────────────────────────────────

/**
 * Outcome of a resolution handler. `resolved: true` means the mismatch was
 * actually fixed and should transition to `auto_resolved`; `false` means an
 * attempt was made but the mismatch stays `open` (and escalates once attempts
 * run out).
 */
interface ResolutionOutcome {
  resolved: boolean
}

async function resolveMissingCredit(mismatch: Mismatch): Promise<ResolutionOutcome> {
  // The credit posting is guarded by a deterministic repair key so that retries
  // (the resolver re-attempts an open mismatch every pass, and passes can
  // overlap) never post the credit twice. The effect runs at most once per
  // mismatch; a failed effect is not recorded, so transient failures can retry.
  const key = repairKey(mismatch)
  await applyIdempotentRepair(key, () => postMissingCredit(mismatch))
  const posted = hasRepairBeenApplied(key)
  logger.info('[resolver] missing_credit repair', { id: mismatch.id, key, posted })
  // Once the credit is confirmed posted the mismatch is genuinely fixed, so it
  // resolves rather than looping until it escalates to finance.
  return { resolved: posted }
}

async function resolveDuplicateDebit(mismatch: Mismatch): Promise<ResolutionOutcome> {
  // Resolution: flag the duplicate provider events and request a PSP reversal.
  // No automated terminal fix yet — stays open until reversal confirms / it
  // escalates for manual review.
  logger.info('[resolver] Attempting duplicate_debit resolution', { id: mismatch.id })
  return { resolved: false }
}

async function resolveAmountMismatch(mismatch: Mismatch): Promise<ResolutionOutcome> {
  // Resolution: if the difference is within a secondary tolerance, auto-close.
  // Otherwise flag for finance team review. No automated terminal fix yet.
  const diff =
    mismatch.expectedAmountMinor != null && mismatch.actualAmountMinor != null
      ? mismatch.expectedAmountMinor > mismatch.actualAmountMinor
        ? mismatch.expectedAmountMinor - mismatch.actualAmountMinor
        : mismatch.actualAmountMinor - mismatch.expectedAmountMinor
      : null

  logger.info('[resolver] Attempting amount_mismatch resolution', {
    id: mismatch.id,
    diffMinor: diff?.toString(),
  })
  return { resolved: false }
}

async function resolveDelayedSettlement(mismatch: Mismatch): Promise<ResolutionOutcome> {
  // Delayed settlement already matched on amount — auto-close.
  logger.info('[resolver] Auto-closing delayed_settlement', { id: mismatch.id })
  return { resolved: true }
}

const HANDLERS: Record<Mismatch['mismatchClass'], (m: Mismatch) => Promise<ResolutionOutcome>> = {
  missing_credit:    resolveMissingCredit,
  duplicate_debit:   resolveDuplicateDebit,
  amount_mismatch:   resolveAmountMismatch,
  delayed_settlement: resolveDelayedSettlement,
}

// ── Main resolution pass ──────────────────────────────────────────────────────

export async function runResolutionPass(): Promise<{ resolved: number; escalated: number }> {
  const result = { resolved: 0, escalated: 0 }

  const openMismatches = await listMismatches({ status: 'open', limit: 200 })

  for (const mismatch of openMismatches) {
    const maxAttempts = getMaxAttempts(mismatch)

    if (mismatch.resolutionAttempts >= maxAttempts) {
      await updateMismatchStatus(mismatch.id, 'escalated', {
        escalatedAt: new Date(),
        resolutionAttempts: mismatch.resolutionAttempts,
      })
      logger.warn('[resolver] Mismatch escalated', {
        id: mismatch.id,
        class: mismatch.mismatchClass,
        attempts: mismatch.resolutionAttempts,
      })
      result.escalated++
      continue
    }

    try {
      const handler = HANDLERS[mismatch.mismatchClass]
      const { resolved } = await handler(mismatch)

      if (resolved) {
        // Terminally fixed — transition to auto_resolved so it stops being
        // retried (and never needlessly escalates a credit that already posted).
        await updateMismatchStatus(mismatch.id, 'auto_resolved', {
          resolutionWorkflow: mismatch.mismatchClass,
          lastResolutionAt: new Date(),
          resolutionAttempts: mismatch.resolutionAttempts + 1,
        })
        result.resolved++
      } else {
        await updateMismatchStatus(mismatch.id, 'open', {
          resolutionWorkflow: mismatch.mismatchClass,
          lastResolutionAt: new Date(),
          resolutionAttempts: mismatch.resolutionAttempts + 1,
        })
      }
    } catch (err) {
      logger.error('[resolver] Resolution handler threw', {
        id: mismatch.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Escalate anything past SLA regardless of attempt count
  const pastSla = await listOpenMismatchesPastSla()
  for (const mismatch of pastSla) {
    if (mismatch.status !== 'open') continue
    await updateMismatchStatus(mismatch.id, 'escalated', {
      escalatedAt: new Date(),
    })
    logger.warn('[resolver] Mismatch escalated due to SLA breach', {
      id: mismatch.id,
      class: mismatch.mismatchClass,
      slaDeadline: mismatch.slaDeadline?.toISOString(),
    })
    result.escalated++
  }

  return result
}
