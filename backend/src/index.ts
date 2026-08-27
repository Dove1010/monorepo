import "./tracing.js"
import "dotenv/config"
import { createApp } from "./app.js"
import { maybeStartOutboxWorker } from "./outbox/workerEntry.js"
import { env } from "./schemas/env.js"
import { createRequire } from "node:module"
import { getUsdcTokenAddress } from "./utils/token.js"
import { runMigrationsIfNeeded } from "./migrations/runMigrations.js"
import { validateCreditScoringConfig } from "./config/creditScoring.js"
import { validatePiiEncryptionKey } from "./utils/piiEncryption.js"
import { startBackupJob } from "./jobs/backupJob.js"
import { ReconciliationWorker } from "./reconciliation/index.js"
import { notificationWSS } from "./services/websocket/NotificationWebSocketServer.js"
import { loadContractAddresses } from "./config/contractAddresses.js"
import { RentWalletWorker } from "./workers/rentWalletWorker.js"
import { createSorobanAdapter } from "./soroban/index.js"
import { getSorobanConfigFromEnv } from "./soroban/client.js"

const require = createRequire(import.meta.url)
const { version } = require("../package.json") as { version: string }

// Validate environment before starting the server
if (!process.env.WEBHOOK_KEY) {
  throw new Error("Missing WEBHOOK_KEY");
}

if (env.NODE_ENV === "production" && !process.env.SECURE_CONFIG) {
  process.exit(1);
}

if (env.NODE_ENV === 'production') {
  try {
    getUsdcTokenAddress()
    console.log(`[backend] Environment validation passed for ${env.SOROBAN_NETWORK} network`)
  } catch (error) {
    console.error(`[backend] Environment validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    console.error(`[backend] Please check your environment variables and restart the server`)
    process.exit(1)
  }
}

async function main() {
  try {
    loadContractAddresses(process.env)
    validatePiiEncryptionKey(env.ENCRYPTION_KEY, env.NODE_ENV)
    const { validateLatePaymentConfig } = await import('./config/latePayment.js')
    validateLatePaymentConfig()
    await runMigrationsIfNeeded()
    startBackupJob()
    const app = createApp()
    maybeStartOutboxWorker()
    const reconciliationWorker = new ReconciliationWorker()
    reconciliationWorker.start()
    
    // Start RentWalletWorker for on-chain rent wallet mirroring
    const sorobanConfig = getSorobanConfigFromEnv(process.env)
    const sorobanAdapter = createSorobanAdapter(sorobanConfig)
    const rentWalletWorker = new RentWalletWorker(sorobanAdapter)
    rentWalletWorker.start()
    
    const server = app.listen(env.PORT, () => {
      console.log(`[backend] listening on http://localhost:${env.PORT}`)
    })
    notificationWSS.attach(server)
  } catch (error) {
    console.error(`[backend] Fatal startup error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    process.exit(1)
  }
}

void main()
