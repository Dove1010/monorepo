/**
 * Background Check Provider Factory
 * Selects the appropriate provider based on configuration
 */

import { BackgroundCheckProvider } from "./BackgroundCheckProvider.js";
import { MockBackgroundCheckProvider } from "./MockBackgroundCheckProvider.js";
import { logger } from "../../utils/logger.js";

const PROVIDER = process.env.BACKGROUND_CHECK_PROVIDER || "mock";

let providerInstance: BackgroundCheckProvider | null = null;
let mockProviderInstance: MockBackgroundCheckProvider | null = null;

export function getBackgroundCheckProvider(): BackgroundCheckProvider {
  if (providerInstance) {
    return providerInstance;
  }

  switch (PROVIDER.toLowerCase()) {
    case "mock":
      mockProviderInstance = new MockBackgroundCheckProvider();
      providerInstance = mockProviderInstance;
      logger.info("Initialized MockBackgroundCheckProvider");
      break;
    case "mono":
      // Placeholder for Mono provider implementation
      logger.warn("Mono provider not yet implemented, falling back to mock");
      mockProviderInstance = new MockBackgroundCheckProvider();
      providerInstance = mockProviderInstance;
      break;
    case "okra":
      // Placeholder for Okra provider implementation
      logger.warn("Okra provider not yet implemented, falling back to mock");
      mockProviderInstance = new MockBackgroundCheckProvider();
      providerInstance = mockProviderInstance;
      break;
    default:
      logger.warn(`Unknown provider ${PROVIDER}, using mock`);
      mockProviderInstance = new MockBackgroundCheckProvider();
      providerInstance = mockProviderInstance;
  }

  return providerInstance;
}

/**
 * Get the mock provider instance for testing configuration
 */
export function getMockBackgroundCheckProvider(): MockBackgroundCheckProvider | null {
  return mockProviderInstance;
}

/**
 * Reset provider instance (for testing)
 */
export function resetProviderForTesting(): void {
  providerInstance = null;
  mockProviderInstance = null;
}
