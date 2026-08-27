import { z } from 'zod'

/**
 * Request/response schemas for the stake_delegation contract surface (#1489).
 *
 * Amounts are USDC decimal strings, matching the rest of the staking API.
 * Addresses are Stellar account StrKeys (G...), validated for shape here and
 * again by the Stellar SDK when the adapter builds the contract call.
 */

const stellarAddress = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, 'Must be a Stellar account address (G...)')

const usdcAmount = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, 'Must be a positive decimal with up to 6 places (USDC is canonical)')

export const delegateSchema = z.object({
  delegatee: stellarAddress.describe('Address that will manage the delegated stake'),
  amountUsdc: usdcAmount.describe('Amount of free stake to delegate, in USDC'),
})

export type DelegateRequest = z.infer<typeof delegateSchema>

export const requestUndelegateSchema = z.object({
  delegatee: stellarAddress.describe('Delegatee to withdraw stake from'),
  amountUsdc: usdcAmount.describe('Amount of delegated stake to withdraw, in USDC'),
})

export type RequestUndelegateRequest = z.infer<typeof requestUndelegateSchema>

export const completeUndelegateSchema = z.object({
  delegatee: stellarAddress.describe('Delegatee whose pending undelegation should be settled'),
})

export type CompleteUndelegateRequest = z.infer<typeof completeUndelegateSchema>

export const setCommissionSchema = z.object({
  rateBps: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .describe('Commission the delegatee charges, in basis points (0-10000)'),
})

export type SetCommissionRequest = z.infer<typeof setCommissionSchema>
