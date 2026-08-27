import { describe, test, expect, beforeEach, vi } from 'vitest'
import { StubSorobanAdapter } from './stub-adapter.js'
import { TestSorobanAdapter } from './test-adapter.js'
import { SorobanConfig } from './client.js'
import { TxType } from '../outbox/types.js'

describe('StubSorobanAdapter', () => {
    const baseConfig: SorobanConfig = {
        rpcUrl: 'http://localhost:8000',
        networkPassphrase: 'Test SDF Network ; September 2015',
    }

    beforeEach(() => {
        StubSorobanAdapter._testOnlyReset()
    })

    test('deterministic behavior with same seed', async () => {
        const config1 = { ...baseConfig, seed: 'test-seed' }
        const adapter1 = new StubSorobanAdapter(config1)
        const balance1 = await adapter1.getBalance('GABC')

        const config2 = { ...baseConfig, seed: 'test-seed' }
        const adapter2 = new StubSorobanAdapter(config2)
        const balance2 = await adapter2.getBalance('GABC')

        expect(balance1).toBe(balance2)
    })

    test('different behavior with different seeds', async () => {
        const config1 = { ...baseConfig, seed: 'deterministic-seed-1' }
        const adapter1 = new StubSorobanAdapter(config1)
        const balance1 = await adapter1.getBalance('GABC')

        StubSorobanAdapter._testOnlyReset()

        const config2 = { ...baseConfig, seed: 'deterministic-seed-2' }
        const adapter2 = new StubSorobanAdapter(config2)
        const balance2 = await adapter2.getBalance('GABC')

        expect(balance1).not.toBe(balance2)
    })

    test('reset clears balances', async () => {
        const adapter = new StubSorobanAdapter(baseConfig)
        await adapter.credit('GABC', 5000n)
        const balanceBefore = await adapter.getBalance('GABC')

        StubSorobanAdapter._testOnlyReset()
        
        const adapterNew = new StubSorobanAdapter(baseConfig)
        const balanceAfter = await adapterNew.getBalance('GABC')
        
        expect(balanceBefore).toBeGreaterThan(balanceAfter) // Credit was lost
    })

    test('instance reset clears ledger', async () => {
        const adapter = new StubSorobanAdapter(baseConfig)
        await adapter.getReceiptEvents(1000)
        // Internal _ledger is now 1001

        adapter._testOnlyReset()

        const events = await adapter.getReceiptEvents(null)
        expect(events[0].ledger).toBe(1001) // Starts from 1000 + 1
    })

    describe('recordReceipt', () => {
        test('resolves without making network calls', async () => {
            const adapter = new StubSorobanAdapter(baseConfig)
            const fetchSpy = vi.spyOn(globalThis, 'fetch' as any)

            await expect(
                adapter.recordReceipt({
                    txId: 'deadbeef',
                    txType: TxType.TENANT_REPAYMENT,
                    amountUsdc: '100.00',
                    tokenAddress: 'CDUSDC',
                    dealId: 'deal-1',
                })
            ).resolves.toBeUndefined()

            expect(fetchSpy).not.toHaveBeenCalled()
            fetchSpy.mockRestore()
        })

        test('does not require contractId or adminSecret', async () => {
            const adapter = new StubSorobanAdapter({
                rpcUrl: 'http://localhost:8000',
                networkPassphrase: 'Test SDF Network ; September 2015',
            })

            await expect(
                adapter.recordReceipt({
                    txId: 'cafe',
                    txType: TxType.STAKE,
                    amountUsdc: '0',
                    tokenAddress: 'CDUSDC',
                    dealId: 'staking-transaction',
                })
            ).resolves.toBeUndefined()
        })
    })
})

describe('StubSorobanAdapter delegation ledger (#1489)', () => {
    const baseConfig: SorobanConfig = {
        rpcUrl: 'http://localhost:8000',
        networkPassphrase: 'Test SDF Network ; September 2015',
    }

    const delegator = 'GDELEGATOR'
    const delegatee = 'GDELEGATEE'

    beforeEach(() => {
        StubSorobanAdapter._testOnlyReset()
    })

    test('delegating reduces the free stake and records the delegation', async () => {
        const adapter = new StubSorobanAdapter(baseConfig)
        const staked = await adapter.getDelegationStakedBalance(delegator)

        await adapter.delegateStake(delegator, delegatee, 1_000_000n)

        const delegations = await adapter.getDelegations(delegator)
        expect(delegations).toEqual([
            { delegatee, amount: 1_000_000n, activatedEpoch: 1 },
        ])
        await expect(
            adapter.delegateStake(delegator, delegatee, staked),
        ).rejects.toThrow('InsufficientStake')
    })

    test('undelegation is gated on the cooldown', async () => {
        const adapter = new StubSorobanAdapter(baseConfig)
        await adapter.delegateStake(delegator, delegatee, 2_000_000n)

        await expect(
            adapter.completeUndelegate(delegator, delegatee),
        ).rejects.toThrow('NoPendingUndelegation')

        await adapter.requestUndelegate(delegator, delegatee, 2_000_000n)
        await expect(
            adapter.completeUndelegate(delegator, delegatee),
        ).rejects.toThrow('CooldownNotElapsed')

        StubSorobanAdapter._testOnlyElapseUndelegationCooldown()
        await adapter.completeUndelegate(delegator, delegatee)

        expect(await adapter.getDelegations(delegator)).toEqual([])
    })

    test('commission splits the delegatee reward the way the contract does', async () => {
        const adapter = new StubSorobanAdapter(baseConfig)
        const gross = await adapter.getDelegateeClaimable(delegatee)
        expect(await adapter.getDelegateeCommissionClaimable(delegatee)).toBe(0n)

        await adapter.setDelegateeCommission(delegatee, 2_500)

        const commission = await adapter.getDelegateeCommissionClaimable(delegatee)
        const net = await adapter.getDelegateeClaimable(delegatee)
        expect(commission).toBe((gross * 2_500n) / 10_000n)
        expect(net + commission).toBe(gross)

        await expect(
            adapter.setDelegateeCommission(delegatee, 10_001),
        ).rejects.toThrow('CommissionTooHigh')
    })
})

describe('TestSorobanAdapter', () => {
    const baseConfig: SorobanConfig = {
        rpcUrl: 'http://localhost:8000',
        networkPassphrase: 'Test SDF Network ; September 2015',
    }

    test('reset clears parent stub state', async () => {
        const adapter = new TestSorobanAdapter(baseConfig)
        await adapter.credit('GABC', 5000n)
        
        adapter.reset()
        
        const balance = await adapter.getBalance('GABC')
        expect(balance).toBeLessThan(5000n) // Should be the initial hash-based balance
    })
})
