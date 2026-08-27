# Stake Delegation

A Soroban contract that lets a staker delegate their stake to a **delegatee**,
who runs the claim/compound loop on their behalf and earns a commission for it.

## Relationship to `staking_pool` / `staking_rewards` / `mvp_staking_pool`

`stake_delegation` is **standalone**, not a wrapper around any other staking
contract. It keeps its own ledger — `StakedBalance(user)`, `TotalStaked`, and
`RewardIndex` — and has its own `stake` / `unstake` entrypoints. It never calls
into `staking_pool` or `staking_rewards`, and no other contract in this
workspace calls into it.

Two practical consequences:

1. A user's delegation balance is a **second, independent position**. It must
   never be added to, or shown as a slice of, the `staking_pool` position that
   `/api/staking/position` returns. The backend and UI keep them separate.
2. The contract performs **no token transfers**. `stake`, `unstake` and
   `fund_rewards` move numbers in contract storage only; there is no token
   client and no custody of funds here. `fund_rewards` bumps the reward index,
   and `claim_*` zeroes an accrued balance and emits an event — settling those
   balances against real USDC is not implemented on-chain.

## Epoch and cooldown model

`init(admin, epoch_duration_secs)` starts the contract at epoch 1. Epochs do
not advance with wall-clock time — `advance_epoch(admin)` increments the counter
and is admin-driven; `epoch_duration_secs` is stored but not enforced by the
contract itself.

There are two independent exit paths from a delegation:

| Path | Gate | Entrypoints |
| --- | --- | --- |
| Epoch-based revocation | Requires a later epoch than the request | `request_revocation` → `finalize_revocation` |
| Time-based undelegation | Requires `UndelegationCooldown` seconds (default 604800 = 7 days) of ledger time | `request_undelegate` → `complete_undelegate` |

The revocation path removes the whole delegation; the undelegation path removes
a caller-chosen amount. The backend wires the time-based path, which is the one
that supports partial exits.

## Authorization

Every user-facing entrypoint is guarded by the **acting party's** `require_auth()`:

- `delegator.require_auth()` — `stake`, `unstake`, `delegate`,
  `request_revocation`, `finalize_revocation`, `request_undelegate`,
  `complete_undelegate`
- `delegatee.require_auth()` — `set_commission`, `claim_commission`,
  `claim_delegatee_rewards`
- `admin.require_auth()` — `init`, `advance_epoch`, `fund_rewards`,
  `set_undelegation_cooldown`, `set_slashing_authority`, `pause`, `unpause`,
  `slash_stake`
- `slash_authority.require_auth()` — `apply_delegatee_slash`

## Commission

A delegatee sets a rate in basis points (0–10000) with `set_commission`. On
every settlement the gross reward is split: `commission = gross * rate / 10000`
accrues to `DelegateeCommissionBalance`, and the remainder to `PendingRewards`.
`get_delegatee_claimable` returns the net figure and `get_commission_claimable`
the commission. There is **no getter for the configured rate itself**, so the
rate cannot be read back off-chain.

## Slashing

`slash_stake` (delegator-side, admin-gated) and `apply_delegatee_slash`
(delegatee-side, slashing-authority-gated) are implemented and tested but are
deliberately **not wired to any backend flow**. They belong with the broader
on-chain slashing work tracked separately alongside `slashing_module` /
`bond_collateral`.

## Backend integration

Deployed address: `SOROBAN_STAKE_DELEGATION_ID` (see
`backend/src/config/contractAddresses.ts`). The adapter methods live in
`backend/src/soroban/adapter.ts` and the HTTP surface in
`backend/src/routes/stakingDelegation.ts` (`/api/staking/delegation/*`).
