/**
 * Soroban Event Indexer Worker
 * Polls the Soroban RPC for new events and indexes them into PostgreSQL
 */

import { getPool, type PgPoolLike } from '../db.js'
import { getContractAddresses } from '../config/contractAddresses.js'
import { parseEvent } from '../services/soroban/eventParsers.js'
import { logger } from '../utils/logger.js'

const INDEXER_ENABLED = process.env.SOROBAN_INDEXER_ENABLED !== 'false'
const POLL_INTERVAL_MS = parseInt(process.env.SOROBAN_INDEXER_INTERVAL_MS || '5000', 10)
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || ''

interface IndexerState {
  contractId: string
  lastLedgerSequence: number
  updatedAt: Date
}

class SorobanEventIndexer {
  private isRunning = false
  private isPaused = false
  private pollTimer?: NodeJS.Timeout

  constructor() {
    if (!INDEXER_ENABLED) {
      logger.info('Soroban Event Indexer is disabled via SOROBAN_INDEXER_ENABLED')
    }
  }

  /**
   * Start the indexer
   */
  async start(): Promise<void> {
    if (!INDEXER_ENABLED) {
      logger.info('Soroban Event Indexer is disabled, not starting')
      return
    }

    if (this.isRunning) {
      logger.warn('Soroban Event Indexer is already running')
      return
    }

    if (!SOROBAN_RPC_URL) {
      logger.warn('SOROBAN_RPC_URL not configured, indexer will not start')
      return
    }

    this.isRunning = true
    this.isPaused = false
    logger.info('Starting Soroban Event Indexer', {
      interval: POLL_INTERVAL_MS,
      rpcUrl: SOROBAN_RPC_URL,
    })

    // Run initial poll
    await this.poll()

    // Schedule recurring polls
    this.pollTimer = setInterval(() => {
      this.poll().catch((error) => {
        logger.error('Error in indexer poll', { error })
      })
    }, POLL_INTERVAL_MS)
  }

  /**
   * Stop the indexer
   */
  async stop(): Promise<void> {
    this.isRunning = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
    logger.info('Soroban Event Indexer stopped')
  }

  /**
   * Pause the indexer
   */
  pause(): void {
    this.isPaused = true
    logger.info('Soroban Event Indexer paused')
  }

  /**
   * Resume the indexer
   */
  resume(): void {
    this.isPaused = false
    logger.info('Soroban Event Indexer resumed')
  }

  /**
   * Poll for new events
   */
  private async poll(): Promise<void> {
    if (!this.isRunning || this.isPaused) {
      return
    }

    try {
      const pool = await getPool()
      if (!pool) {
        logger.warn('Database pool not available, skipping indexer poll')
        return
      }

      const contractAddresses = getContractAddresses()
      if (contractAddresses.length === 0) {
        logger.debug('No contract addresses configured, skipping indexer poll')
        return
      }

      // Get current indexer state for each contract
      const states = await this.getIndexerStates(pool, contractAddresses)

      // Fetch new events from Soroban RPC
      const events = await this.fetchEventsFromRpc(states)

      // Parse and index events
      await this.indexEvents(pool, events)

      // Update indexer state
      await this.updateIndexerStates(pool, events)

      logger.debug('Indexer poll completed', {
        eventsIndexed: events.length,
      })
    } catch (error) {
      logger.error('Error in indexer poll', { error })
    }
  }

  /**
   * Get indexer state for contracts
   */
  private async getIndexerStates(
    pool: PgPoolLike,
    contractAddresses: string[]
  ): Promise<Map<string, number>> {
    const states = new Map<string, number>()

    for (const contractId of contractAddresses) {
      const result = await pool.query(
        'SELECT last_ledger_sequence FROM indexer_state WHERE contract_id = $1',
        [contractId]
      )

      if (result.rows.length > 0) {
        states.set(contractId, parseInt(result.rows[0].last_ledger_sequence))
      } else {
        // Initialize state for new contract
        await pool.query(
          'INSERT INTO indexer_state (contract_id, last_ledger_sequence) VALUES ($1, 0)',
          [contractId]
        )
        states.set(contractId, 0)
      }
    }

    return states
  }

  /**
   * Fetch events from Soroban RPC
   */
  private async fetchEventsFromRpc(
    states: Map<string, number>
  ): Promise<any[]> {
    const allEvents: any[] = []

    for (const [contractId, lastLedgerSequence] of states.entries()) {
      try {
        // In a real implementation, this would call the Soroban RPC getEvents endpoint
        // For now, we'll simulate this with a placeholder
        // const response = await fetch(`${SOROBAN_RPC_URL}/events`, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({
        //     contractId,
        //     fromLedger: lastLedgerSequence + 1,
        //   }),
        // })
        // const data = await response.json()
        
        // Placeholder: Return empty array for now
        // When real RPC integration is added, this will return actual events
        logger.debug('Would fetch events from RPC', {
          contractId,
          fromLedger: lastLedgerSequence + 1,
        })
      } catch (error) {
        logger.error('Error fetching events from RPC', {
          contractId,
          error,
        })
      }
    }

    return allEvents
  }

  /**
   * Index events into database
   */
  private async indexEvents(pool: PgPoolLike, events: any[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      for (const event of events) {
        const parsedEvent = parseEvent(event)
        if (!parsedEvent) {
          continue
        }

        // Upsert event (insert or update if exists)
        await client.query(
          `INSERT INTO indexed_contract_events 
           (contract_id, ledger_sequence, transaction_hash, event_type, topic_1, topic_2, data_json, indexed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (transaction_hash, ledger_sequence) 
           DO UPDATE SET 
             event_type = EXCLUDED.event_type,
             topic_1 = EXCLUDED.topic_1,
             topic_2 = EXCLUDED.topic_2,
             data_json = EXCLUDED.data_json,
             indexed_at = EXCLUDED.indexed_at`,
          [
            parsedEvent.contractId,
            parsedEvent.ledgerSequence,
            parsedEvent.transactionHash,
            parsedEvent.eventType,
            parsedEvent.topic1 || null,
            parsedEvent.topic2 || null,
            JSON.stringify(parsedEvent.dataJson),
            parsedEvent.indexedAt,
          ]
        )
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Update indexer state after processing events
   */
  private async updateIndexerStates(pool: PgPoolLike, events: any[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    // Group events by contract and find max ledger sequence
    const maxLedgerByContract = new Map<string, number>()
    for (const event of events) {
      const currentMax = maxLedgerByContract.get(event.contractId) || 0
      if (event.ledgerSequence > currentMax) {
        maxLedgerByContract.set(event.contractId, event.ledgerSequence)
      }
    }

    // Update state for each contract
    for (const [contractId, maxLedger] of maxLedgerByContract.entries()) {
      await pool.query(
        `UPDATE indexer_state 
         SET last_ledger_sequence = $2, updated_at = NOW()
         WHERE contract_id = $1`,
        [contractId, maxLedger]
      )
    }
  }

  /**
   * Get indexer metrics
   */
  getMetrics(): {
    isRunning: boolean
    isPaused: boolean
    pollInterval: number
    enabled: boolean
  } {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      pollInterval: POLL_INTERVAL_MS,
      enabled: INDEXER_ENABLED,
    }
  }
}

// Export singleton instance
export const sorobanEventIndexer = new SorobanEventIndexer()
