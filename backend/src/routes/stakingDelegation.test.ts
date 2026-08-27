import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { sessionStore, userStore } from '../models/authStore.js'
import { StubSorobanAdapter } from '../soroban/stub-adapter.js'

/**
 * Route coverage for the stake_delegation surface (#1489).
 *
 * These run against the stub adapter, whose in-memory delegation ledger
 * mirrors the contract's rules (free-stake check, pending undelegation,
 * cooldown gate) so the delegate → request → complete flow is exercised
 * end-to-end without a chain.
 */
describe('Delegated staking API', () => {
  let app: any
  let authToken: string

  const delegator = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
  const delegatee = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'

  beforeEach(() => {
    StubSorobanAdapter._testOnlyReset()
    app = createApp()
    vi.clearAllMocks()

    const email = 'delegation-test@example.com'
    userStore.getOrCreateByEmail(email)
    authToken = 'test-token-delegation'
    sessionStore.create(email, authToken)
  })

  function authed(method: 'get' | 'post', path: string) {
    return request(app)[method](path)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-wallet-address', delegator)
  }

  async function stakedBalance(): Promise<number> {
    const res = await authed('get', '/api/staking/delegation/position').expect(200)
    return Number(res.body.position.staked)
  }

  it('requires authentication', async () => {
    await request(app).get('/api/staking/delegation/position').expect(401)
  })

  it('reports an undelegated position with no delegations', async () => {
    const response = await authed('get', '/api/staking/delegation/position').expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.position.delegated).toBe('0.000000')
    expect(response.body.position.free).toBe(response.body.position.staked)
    expect(response.body.position.delegations).toEqual([])
    expect(response.body.position.currentEpoch).toBe(1)
  })

  it('delegates stake and reflects it in the position', async () => {
    const staked = await stakedBalance()
    expect(staked).toBeGreaterThan(0)

    const amountUsdc = '10.000000'
    const delegateRes = await authed('post', '/api/staking/delegation/delegate')
      .send({ delegatee, amountUsdc })
      .expect(200)

    expect(delegateRes.body.success).toBe(true)
    expect(delegateRes.body.txHash).toBe('stub_tx_hash_delegate')

    const position = await authed('get', '/api/staking/delegation/position').expect(200)
    expect(position.body.position.delegated).toBe('10.000000')
    expect(Number(position.body.position.free)).toBe(staked - 10)
    expect(position.body.position.delegations).toEqual([
      { delegatee, amountUsdc: '10.000000', activatedEpoch: 1 },
    ])
  })

  it('rejects delegating more than the free stake', async () => {
    const staked = await stakedBalance()

    const response = await authed('post', '/api/staking/delegation/delegate')
      .send({ delegatee, amountUsdc: `${staked + 1}.000000` })
      .expect(500)

    expect(response.body.error.message).toContain('InsufficientStake')
  })

  it('rejects self-delegation', async () => {
    const response = await authed('post', '/api/staking/delegation/delegate')
      .send({ delegatee: delegator, amountUsdc: '1.000000' })
      .expect(400)

    expect(response.body.error.message).toContain('own address')
  })

  it('rejects a malformed delegatee address', async () => {
    await authed('post', '/api/staking/delegation/delegate')
      .send({ delegatee: 'not-an-address', amountUsdc: '1.000000' })
      .expect(400)
  })

  it('holds an undelegation request until the cooldown elapses', async () => {
    await authed('post', '/api/staking/delegation/delegate')
      .send({ delegatee, amountUsdc: '10.000000' })
      .expect(200)

    const requested = await authed('post', '/api/staking/delegation/undelegate/request')
      .send({ delegatee, amountUsdc: '4.000000' })
      .expect(202)
    expect(requested.body.txHash).toBe('stub_tx_hash_request_undelegate')

    // Still fully delegated: requesting does not move the stake.
    const midway = await authed('get', '/api/staking/delegation/position').expect(200)
    expect(midway.body.position.delegated).toBe('10.000000')

    const tooEarly = await authed('post', '/api/staking/delegation/undelegate/complete')
      .send({ delegatee })
      .expect(500)
    expect(tooEarly.body.error.message).toContain('CooldownNotElapsed')
  })

  it('completes an undelegation once the cooldown has elapsed', async () => {
    await authed('post', '/api/staking/delegation/delegate')
      .send({ delegatee, amountUsdc: '10.000000' })
      .expect(200)
    await authed('post', '/api/staking/delegation/undelegate/request')
      .send({ delegatee, amountUsdc: '4.000000' })
      .expect(202)

    StubSorobanAdapter._testOnlyElapseUndelegationCooldown()

    const completed = await authed('post', '/api/staking/delegation/undelegate/complete')
      .send({ delegatee })
      .expect(200)
    expect(completed.body.txHash).toBe('stub_tx_hash_complete_undelegate')

    const position = await authed('get', '/api/staking/delegation/position').expect(200)
    expect(position.body.position.delegated).toBe('6.000000')
  })

  it('rejects completing an undelegation that was never requested', async () => {
    const response = await authed('post', '/api/staking/delegation/undelegate/complete')
      .send({ delegatee })
      .expect(500)

    expect(response.body.error.message).toContain('NoPendingUndelegation')
  })

  it('lets a delegatee set a commission and read their split of the rewards', async () => {
    const zeroCommission = await authed('get', '/api/staking/delegation/delegatee-earnings').expect(200)
    expect(zeroCommission.body.earnings.commissionClaimable).toBe('0.000000')
    const gross = Number(zeroCommission.body.earnings.claimable)
    expect(gross).toBeGreaterThan(0)

    await authed('post', '/api/staking/delegation/commission')
      .send({ rateBps: 1000 })
      .expect(200)

    const earnings = await authed('get', '/api/staking/delegation/delegatee-earnings').expect(200)
    expect(earnings.body.delegatee).toBe(delegator)
    expect(Number(earnings.body.earnings.commissionClaimable)).toBeCloseTo(gross * 0.1, 6)
    expect(Number(earnings.body.earnings.claimable)).toBeCloseTo(gross * 0.9, 6)
  })

  it('rejects a commission above 100%', async () => {
    await authed('post', '/api/staking/delegation/commission')
      .send({ rateBps: 10_001 })
      .expect(400)
  })

  it('claims delegatee rewards and commission', async () => {
    const rewards = await authed('post', '/api/staking/delegation/claim-rewards').expect(200)
    expect(rewards.body.txHash).toBe('stub_tx_hash_claim_delegatee_rewards')

    const commission = await authed('post', '/api/staking/delegation/claim-commission').expect(200)
    expect(commission.body.txHash).toBe('stub_tx_hash_claim_commission')
  })

  it('does not conflate the delegated position with the staking_pool position', async () => {
    const delegation = await authed('get', '/api/staking/delegation/position').expect(200)
    const pool = await authed('get', '/api/staking/position').expect(200)

    // Distinct response shapes backed by distinct contracts: the delegation
    // payload carries delegated/free/currentEpoch, the pool payload does not.
    expect(delegation.body.position).toHaveProperty('delegated')
    expect(delegation.body.position).toHaveProperty('currentEpoch')
    expect(pool.body.position).not.toHaveProperty('delegated')
    expect(pool.body.position).not.toHaveProperty('currentEpoch')
  })
})
