# Production Schedule Reflow System

A production scheduler that reschedules work orders when disruptions occur, respecting dependencies, shift schedules, work center constraints, and maintenance windows.

## Quick Start

```bash
npm install
npm install typescript tsx @types/node --save-dev

npm start                      # Quick demo
npm run test                   # Test suite (36 tests)
npm run scenario:all           # All 4 core scenarios
```

## Scenarios

### Core Scenarios (Handcrafted)

```bash
npm run scenario:delay         # Delay cascade (A->B->C chain)
npm run scenario:maintenance   # Work pauses around maintenance window
npm run scenario:shift         # Order spanning multiple shifts overnight
npm run scenario:complex       # Cross-center deps + maintenance + shifts
```

### Large-Scale Scenarios (Generated)

```bash
npm run scenario:scale              # Default: 500 work orders
npm run scenario:scale:small        # 100 work orders, 5 centers
npm run scenario:scale:medium       # 500 work orders, 10 centers
npm run scenario:scale:large        # 1,000 work orders, 15 centers
npm run scenario:scale:stress       # 2,000 work orders, 20 centers
npx tsx src/scenarios/large-scale.ts -- --count 5000   # Custom count
```

### Performance Benchmarks

| Scale | Work Orders | Work Centers | Dependencies | Reflow Time | Valid |
|-------|-------------|--------------|-------------|-------------|-------|
| Small | 100 | 5 | 50 | ~12ms | ✅ |
| Medium | 500 | 10 | 289 | ~85ms | ✅ |
| Large | 1,000 | 15 | 361 | ~109ms | ✅ |
| Stress | 2,000 | 20 | 632 | ~198ms | ✅ |
| Custom | 5,000 | 100 | 2,409 | ~473ms | ✅ |

All scales produce fully validated schedules with zero constraint violations.

## Project Structure

```
src/
  reflow/
    types.ts                   # TypeScript interfaces
    dag.ts                     # DAG + topological sort + cycle detection
    constraint-checker.ts      # Schedule validation
    reflow.service.ts          # Main reflow algorithm
    index.ts                   # Barrel export
  utils/
    date-utils.ts              # Shift-aware date calculations
    display.ts                 # Console output formatting
  data/
    sample-data.ts             # Shared factories for handcrafted scenarios
    generator.ts               # Large-scale data generator (100-5000+ orders)
  scenarios/
    delay-cascade.ts           # Scenario 1: Dependency chain delay
    maintenance-conflict.ts    # Scenario 2: Maintenance window avoidance
    shift-spanning.ts          # Scenario 3: Multi-shift spanning
    complex-multi-constraint.ts # Scenario 4: All constraints combined
    large-scale.ts             # Scenario 5: Configurable scale (100-5000+)
    run-all.ts                 # Run all core scenarios
  tests/
    test-runner.ts             # Lightweight test framework
    run-tests.ts               # 36 tests
prompts/                       # AI prompt documentation
```

## Algorithm

**Topological sort + greedy forward scheduling:**

1. Build dependency DAG, detect cycles (Kahn's algorithm)
2. Topological sort to determine processing order
3. For each work order (parents first):
   - Earliest start = max(original start, all dependency end times, work center availability)
   - Snap to valid working time (shift + maintenance aware)
   - End date = shift-aware duration calculation (pauses outside shifts and during maintenance)
4. Validate output against all constraints
5. Generate change log with human-readable reasons + optimization metrics

### Shift-Aware Duration Calculation

Work pauses outside shift hours and during maintenance windows, then resumes in the next available slot.

**Example:** 120 min order, starts Mon 4PM, shift ends 5PM (Mon-Fri 8AM-5PM):
- Mon 4-5PM: works 60 min
- Mon 5PM - Tue 8AM: paused (outside shift)
- Tue 8-9AM: works remaining 60 min → done

## Hard Constraints

- **Work center conflicts:** Only one order at a time per work center (no overlaps)
- **Dependencies:** All parent orders must complete before child starts
- **Shift boundaries:** Work only during scheduled shift hours
- **Maintenance windows:** No work during maintenance; work pauses and resumes after
- **Immovable orders:** Maintenance work orders cannot be rescheduled

## Data Generator

The large-scale generator (`src/data/generator.ts`) creates realistic manufacturing data:

- **Configurable scale:** 100 to 5,000+ work orders
- **5 shift templates:** Standard, Extended, Full Week, Early Shift, Late Shift
- **Realistic disruptions:** 15-25% of orders have delays or late starts
- **Dependency chains:** Configurable probability and max depth
- **Maintenance windows:** Random placement across work centers
- **23 product types:** Pipes, fittings, conduits, tubing
- **Setup times:** ~20% of orders include setup time (bonus feature)
- **Seeded RNG:** Reproducible results for consistent testing

## Design Decisions

- **Native Date vs Luxon:** Uses native JS Date in UTC for zero external dependencies
- **Greedy scheduling:** Process in topological order and schedule ASAP — simple, deterministic, and fast
- **Forward-only:** Orders only move forward in time, avoiding infinite loops
- **Segment-based shift calculation:** Breaks shifts into work segments around maintenance windows for precise duration tracking

## Known Limitations

- No backward scheduling (orders only move forward)
- Greedy approach may not find globally optimal schedule
- No partial work center availability within a shift
- 30-day maximum lookahead for finding next shift start

## Bonus Features

- ✅ DAG with cycle detection (Kahn's algorithm)
- ✅ Automated test suite (36 tests)
- ✅ Large-scale data generator (up to 5,000+ orders)
- ✅ Optimization metrics (total delay, affected orders, utilization)
- ✅ 5 scenarios (4 handcrafted + 1 scalable)
- ✅ Setup time handling support
- ✅ Performance benchmarking with throughput metrics
- ✅ AI prompt documentation
- ✅ Clean git history with meaningful commits
