import type { RentGuaranteeProvider } from './RentGuaranteeProvider.js'
import { MockRentGuaranteeProvider } from './MockRentGuaranteeProvider.js'
import { logger } from '../../utils/logger.js'

export function createRentGuaranteeProviderFromEnv(providerName?: string): RentGuaranteeProvider {
  const name = providerName ?? process.env.RENT_GUARANTEE_PROVIDER ?? 'mock'

  if (name === 'mock') {
    logger.info('Using MockRentGuaranteeProvider')
    return new MockRentGuaranteeProvider()
  }

  if (name === 'leatherback' || name === 'heirs') {
    logger.info(`Rent guarantee provider '${name}' selected — no real integration yet, falling back to mock`)
    return new MockRentGuaranteeProvider()
  }

  logger.warn(`Unknown RENT_GUARANTEE_PROVIDER '${name}', falling back to mock`)
  return new MockRentGuaranteeProvider()
}
