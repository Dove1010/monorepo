/**
 * Example demonstrating Deal creation and repayment schedule generation
 * This script shows the deterministic schedule generation with documented rounding rules
 */

import { dealStore } from '../dist/models/dealStore.js'

async function demonstrateDealCreation() {
  console.log('=== ShelterFlex Deal Creation Example ===\n')

  // Example 1: 12-month deal with standard deposit
  console.log('Example 1: 12-month deal (₦1.2M annual rent, 20% deposit)')
  const deal1Input = {
    tenantId: 'tenant-001',
    landlordId: 'landlord-001',
    listingId: 'listing-001',
    annualRentNgn: 1200000,
    depositNgn: 240000, // 20% of annual rent
    termMonths: 12
  }

  const deal1 = await dealStore.create(deal1Input)
  console.log(`Deal ID: ${deal1.dealId}`)
  console.log(`Financed Amount: ₦${deal1.financedAmountNgn.toLocaleString()}`)
  console.log(`Monthly Payment: ₦${deal1.schedule[0].amountNgn.toLocaleString()}`)
  console.log(`Total Repayment: ₦${deal1.schedule.reduce((sum, item) => sum + item.amountNgn, 0).toLocaleString()}`)
  console.log('First 3 payments:')
  deal1.schedule.slice(0, 3).forEach(item => {
    console.log(`  Period ${item.period}: ₦${item.amountNgn.toLocaleString()} due ${new Date(item.dueDate).toLocaleDateString()}`)
  })
  console.log('...\n')

  // Example 2: 6-month deal with higher deposit
  console.log('Example 2: 6-month deal (₦2.4M annual rent, 25% deposit)')
  const deal2Input = {
    tenantId: 'tenant-002',
    landlordId: 'landlord-002',
    annualRentNgn: 2400000,
    depositNgn: 600000, // 25% of annual rent
    termMonths: 6
  }

  const deal2 = await dealStore.create(deal2Input)
  console.log(`Deal ID: ${deal2.dealId}`)
  console.log(`Financed Amount: ₦${deal2.financedAmountNgn.toLocaleString()}`)
  console.log(`Monthly Payment: ₦${deal2.schedule[0].amountNgn.toLocaleString()}`)
  console.log(`Total Repayment: ₦${deal2.schedule.reduce((sum, item) => sum + item.amountNgn, 0).toLocaleString()}`)
  console.log('All payments:')
  deal2.schedule.forEach(item => {
    console.log(`  Period ${item.period}: ₦${item.amountNgn.toLocaleString()} due ${new Date(item.dueDate).toLocaleDateString()}`)
  })
  console.log('')

  // Example 3: Demonstrate rounding strategy
  console.log('Example 3: Rounding strategy demonstration')
  console.log('For deals where financed amount is not evenly divisible by term months:')
  console.log('- Standard rounding applied to all but final payment')
  console.log('- Final payment adjusted to account for rounding discrepancy')
  
  const deal3Input = {
    tenantId: 'tenant-003',
    landlordId: 'landlord-003',
    annualRentNgn: 1000000,
    depositNgn: 200000, // 20% deposit
    termMonths: 3
  }

  const deal3 = await dealStore.create(deal3Input)
  const financedAmount = deal3Input.annualRentNgn - deal3Input.depositNgn // 800000
  const baseMonthly = financedAmount / deal3Input.termMonths // 266666.666...
  
  console.log(`Financed Amount: ₦${financedAmount.toLocaleString()}`)
  console.log(`Base Monthly (before rounding): ₦${baseMonthly.toFixed(2)}`)
  console.log('Schedule with rounding:')
  deal3.schedule.forEach(item => {
    console.log(`  Period ${item.period}: ₦${item.amountNgn.toLocaleString()}`)
  })
  console.log(`Total: ₦${deal3.schedule.reduce((sum, item) => sum + item.amountNgn, 0).toLocaleString()}`)
  console.log('')

  // Example 4: Show filtering and retrieval
  console.log('Example 4: Deal filtering and retrieval')
  
  // Get all deals
  const allDeals = await dealStore.findMany()
  console.log(`Total deals in system: ${allDeals.total}`)
  
  // Filter by tenant
  const tenantDeals = await dealStore.findMany({ tenantId: 'tenant-001' })
  console.log(`Deals for tenant-001: ${tenantDeals.total}`)
  
  // Get specific deal with schedule
  const specificDeal = await dealStore.findById(deal1.dealId)
  if (specificDeal) {
    console.log(`Retrieved deal ${specificDeal.dealId} with ${specificDeal.schedule.length} schedule items`)
  }

  console.log('\n=== Validation Rules ===')
  console.log('✓ Deposit must be >= 20% of annual rent')
  console.log('✓ Annual rent must be > 0')
  console.log('✓ Term months must be 3, 6, or 12')
  console.log('✓ Deposit must be < annual rent')
  console.log('✓ All amounts are rounded to 2 decimal places')
  console.log('✓ Final payment accounts for rounding discrepancy')
}

// Run the demonstration
demonstrateDealCreation().catch(console.error)
