# Performance Budgets Documentation

## Overview

This document describes the performance budget system for ShelterFlex, designed to ensure the app remains performant for users in Nigeria on mobile data with metered connections.

## Quick Start

### Run Performance Budget Check

```bash
# Build the app first
pnpm run build

# Check if build exceeds budgets
node scripts/check-performance-budget.js
```

### Run Full Performance Analysis

```bash
# Build with bundle analysis
pnpm run analyze

# Run detailed analysis script
node scripts/analyze-performance.js
```

## Budgets

### Realistic Budgets (Short-term targets)

These budgets are based on current measurements + 20% headroom. They are enforceable now and prevent regression.

| Route | Total JS Budget | First Load JS Budget | Rationale |
|-------|----------------|---------------------|-----------|
| / | 700 KB | 500 KB | First impression - based on current ~550KB |
| /properties | 700 KB | 500 KB | Listing page - based on current ~550KB |
| /properties/[id] | 800 KB | 600 KB | Detail page - allows for images/maps |
| /login | 600 KB | 450 KB | Auth pages - adjusted based on current ~550KB shared bundle |
| /signup | 600 KB | 450 KB | Auth pages - adjusted based on current ~550KB shared bundle |
| /dashboard/landlord | 900 KB | 650 KB | Dashboard - data visualization overhead |
| /dashboard/tenant | 800 KB | 600 KB | Dashboard - data visualization overhead |
| /dashboard/agent | 800 KB | 600 KB | Dashboard - data visualization overhead |

### Ideal Budgets (Long-term targets)

These are targets for optimal performance on constrained connections. Work towards these over time.

| Route | Total JS Budget | First Load JS Budget | Rationale |
|-------|----------------|---------------------|-----------|
| / | 200 KB | 150 KB | First impression - must load quickly |
| /properties | 300 KB | 200 KB | Listing page - moderate complexity |
| /properties/[id] | 400 KB | 250 KB | Detail page - images/maps allowed |
| /login | 150 KB | 100 KB | Auth pages - minimal dependencies |
| /signup | 150 KB | 100 KB | Auth pages - minimal dependencies |
| /dashboard/landlord | 500 KB | 300 KB | Dashboard - data visualization overhead |
| /dashboard/tenant | 400 KB | 250 KB | Dashboard - data visualization overhead |
| /dashboard/agent | 400 KB | 250 KB | Dashboard - data visualization overhead |

### Core Web Vitals Budgets

| Metric | Budget | Threshold |
|--------|--------|-----------|
| FCP (First Contentful Paint) | 1800ms | Good: <1800ms |
| LCP (Largest Contentful Paint) | 2500ms | Good: <2500ms |
| INP (Interaction to Next Paint) | 200ms | Good: <200ms |
| CLS (Cumulative Layout Shift) | 0.1 | Good: <0.1 |
| TTFB (Time to First Byte) | 800ms | Good: <800ms |

## Current Measurements

### Bundle Size Analysis

- **Total Bundle Size:** 4.32 MB
- **Total Static Assets:** 4.66 MB
- **Number of Chunks:** 125
- **Estimated Per-Route Size:** ~550KB

### Largest Bundle Contributors

| Rank | Chunk | Size |
|------|-------|------|
| 1 | 3da66bcc45f1a8f9.js | 374.93 KB |
| 2 | 85b664395a0b5d65.js | 374.93 KB |
| 3 | 1d5f753d8185304b.js | 209.84 KB |
| 4 | 9757df162896aa08.js | 151.95 KB |
| 5 | a6dad97d9634a72d.js | 109.96 KB |
| 6 | 2d8ce5a5f66afdf6.js | 94.98 KB |
| 7 | d5b2b57e6f3c08dc.js | 84.67 KB |
| 8 | dc974318f42853db.js | 84.67 KB |
| 9 | b93068a11b28a510.js | 83.65 KB |
| 10 | 3a38fe7b215ce95f.js | 76.02 KB |

## Budget Rationale

These budgets are designed for:

- **Target Audience:** Users in Nigeria on mobile data with metered connections
- **Network Conditions:** Variable 3G/4G connections with potential latency
- **Device Class:** Mid-range Android devices (2-4GB RAM)
- **Cost Considerations:** Page weight directly impacts user data costs

### Current State vs Budgets

⚠️ **IMPORTANT:** The app currently exceeds the IDEAL budgets for all routes.
- Current estimated per-route size: ~550KB
- This is why REALISTIC budgets have been set higher - to prevent regression while we work toward the ideal targets over time.

## What to Do When Budget Check Fails

If `node scripts/check-performance-budget.js` fails:

1. **Identify the problem:**
   ```bash
   pnpm run analyze
   ```
   This will open a bundle analyzer UI showing which dependencies are largest.

2. **Common fixes:**
   - **Code splitting:** Use `next/dynamic` to lazy-load heavy components
   - **Remove unused dependencies:** Check for packages that can be removed
   - **Optimize imports:** Import only what you need from large libraries
   - **Tree shaking:** Ensure your bundler is eliminating dead code

3. **If the increase is intentional:**
   - Update the budget in `scripts/check-performance-budget.js`
   - Document the reason for the increase in this file
   - Consider if the increase affects the ideal budget targets

4. **For large refactors:**
   - Raise a separate issue to track the optimization work
   - Don't let it block the current PR if it's a legitimate feature addition

## Scripts

### `scripts/check-performance-budget.js`

Simple script that checks if the build exceeds performance budgets. Exits with code 1 if budgets are exceeded, 0 otherwise.

**Usage:**
```bash
node scripts/check-performance-budget.js
```

**Output:**
- Pass/fail status for each route
- Total bundle size
- Estimated per-route size
- Helpful error messages if budgets are exceeded

### `scripts/analyze-performance.js`

Comprehensive analysis script that provides detailed performance information.

**Usage:**
```bash
node scripts/analyze-performance.js
```

**Output:**
- Bundle size statistics
- Largest chunk contributors
- Both realistic and ideal budgets
- Core Web Vitals budgets
- Budget rationale
- Current status vs budgets

## Integration with CI

To add this to your CI workflow (optional, not required for this PR):

```yaml
- name: Check performance budgets
  run: |
    cd frontend
    pnpm run build
    node scripts/check-performance-budget.js
```

## Monitoring in Production

The app already has Core Web Vitals monitoring via:
- `PerformanceMonitor` component in `app/layout.tsx`
- `SpeedInsights` from Vercel
- `lib/performance-monitor.ts` and `lib/performance-tracking.ts`

Monitor these metrics in production to ensure the budgets are effective.

## Future Work

1. **Per-route bundle analysis:** Currently, we estimate per-route size. Future work could measure actual per-route bundles.
2. **Automated regression testing:** Integrate budget checks into CI/CD pipeline.
3. **Core Web Vitals measurement:** Add automated measurement of actual Core Web Vitals in test environments.
4. **Optimization opportunities:** Based on the largest chunks identified, consider:
   - Investigating what's in the 375KB chunks
   - Splitting large vendor chunks
   - Optimizing image loading strategies
