/**
 * Listing Rental Locking Example
 * 
 * This example demonstrates the listing rental locking feature that prevents
 * multiple deals from being created for the same listing.
 * 
 * Note: This example uses fetch which requires Node.js 18+ or the node-fetch package.
 * For older Node versions, install node-fetch: npm install node-fetch
 */

/* global fetch */

const BASE_URL = 'http://localhost:4000'

async function makeRequest(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  
  if (body) {
    options.body = JSON.stringify(body)
  }
  
  const response = await fetch(`${BASE_URL}${path}`, options)
  const data = await response.json()
  
  return { status: response.status, data }
}

async function main() {
  console.log('=== Listing Rental Locking Example ===\n')
  
  // Step 1: Create an approved listing
  console.log('1. Creating an approved listing...')
  const listingResponse = await makeRequest('POST', '/api/whistleblower/listings', {
    whistleblowerId: 'wb-001',
    address: '123 Main Street, Ikeja, Lagos',
    city: 'Lagos',
    area: 'Ikeja',
    bedrooms: 2,
    bathrooms: 2,
    annualRentNgn: 1200000,
    description: 'Beautiful 2-bedroom apartment',
    photos: [
      'https://example.com/photo1.jpg',
      'https://example.com/photo2.jpg',
      'https://example.com/photo3.jpg'
    ]
  })
  
  if (listingResponse.status !== 201) {
    console.error('Failed to create listing:', listingResponse.data)
    return
  }
  
  const listingId = listingResponse.data.listing.listingId
  console.log(`✓ Listing created with ID: ${listingId}`)
  console.log(`  Status: ${listingResponse.data.listing.status}`)
  console.log(`  DealId: ${listingResponse.data.listing.dealId || 'none'}\n`)
  
  // Step 2: Approve the listing (in real app, this would be done by admin)
  // For this example, we'll assume it's approved
  
  // Step 3: Create first deal with the listing
  console.log('2. Creating first deal with the listing...')
  const deal1Response = await makeRequest('POST', '/api/deals', {
    tenantId: 'tenant-001',
    landlordId: 'landlord-001',
    listingId: listingId,
    annualRentNgn: 1200000,
    depositNgn: 240000,
    termMonths: 12
  })
  
  if (deal1Response.status === 201) {
    const deal1Id = deal1Response.data.data.dealId
    console.log(`✓ First deal created successfully!`)
    console.log(`  Deal ID: ${deal1Id}`)
    console.log(`  Listing ID: ${deal1Response.data.data.listingId}`)
    console.log(`  Financed Amount: ₦${deal1Response.data.data.financedAmountNgn.toLocaleString()}\n`)
    
    // Check listing status after deal creation
    console.log('3. Checking listing status after deal creation...')
    const listingCheckResponse = await makeRequest('GET', `/api/whistleblower/listings/${listingId}`)
    
    if (listingCheckResponse.status === 200) {
      const listing = listingCheckResponse.data.listing
      console.log(`✓ Listing status updated:`)
      console.log(`  Status: ${listing.status}`)
      console.log(`  DealId: ${listing.dealId}\n`)
    }
  } else {
    console.error('Failed to create first deal:', deal1Response.data)
    return
  }
  
  // Step 4: Attempt to create second deal with same listing (should fail)
  console.log('4. Attempting to create second deal with same listing (should fail)...')
  const deal2Response = await makeRequest('POST', '/api/deals', {
    tenantId: 'tenant-002',
    landlordId: 'landlord-002',
    listingId: listingId,
    annualRentNgn: 1200000,
    depositNgn: 240000,
    termMonths: 12
  })
  
  if (deal2Response.status === 409) {
    console.log(`✓ Second deal correctly rejected!`)
    console.log(`  Status: ${deal2Response.status}`)
    console.log(`  Error Code: ${deal2Response.data.error.code}`)
    console.log(`  Message: ${deal2Response.data.error.message}\n`)
  } else {
    console.error('❌ Second deal should have been rejected but was not!')
    console.error('Response:', deal2Response)
  }
  
  // Step 5: Create a deal without a listing (should succeed)
  console.log('5. Creating a deal without a listing...')
  const deal3Response = await makeRequest('POST', '/api/deals', {
    tenantId: 'tenant-003',
    landlordId: 'landlord-003',
    annualRentNgn: 1200000,
    depositNgn: 240000,
    termMonths: 12
  })
  
  if (deal3Response.status === 201) {
    console.log(`✓ Deal without listing created successfully!`)
    console.log(`  Deal ID: ${deal3Response.data.data.dealId}`)
    console.log(`  Listing ID: ${deal3Response.data.data.listingId || 'none'}\n`)
  } else {
    console.error('Failed to create deal without listing:', deal3Response.data)
  }
  
  console.log('=== Example Complete ===\n')
  console.log('Summary:')
  console.log('✓ Listing rental locking prevents double-booking')
  console.log('✓ First deal locks the listing (status=rented, dealId set)')
  console.log('✓ Second deal on same listing is rejected with 409 error')
  console.log('✓ Deals without listings continue to work normally')
}

// Run the example
main().catch(console.error)
