# Production Schedule Reflow System

A production scheduler that reschedules work orders when disruptions occur, respecting dependencies, shift schedules, work center constraints, and maintenance windows.

## Quick Start

```bash
npm install
npm start                           # Quick demo
npm run scenario:all                # All 4 scenarios
npm run scenario:delay              # Delay cascade
npm run scenario:maintenance        # Maintenance conflict
npm run scenario:shift              # Shift spanning
npm run scenario:complex            # Multi-constraint
npm run test                        # Test suite (35+ tests)
npm run validate                    # Type check
npm run scenario:scale              # Default 500 orders
npm run scenario:scale:small        # 100 orders
npm run scenario:scale:medium       # 500 orders  
npm run scenario:scale:large        # 1,000 orders
npm run scenario:scale:stress       # 2,000 orders
```

## Project Structure

```
src/
  reflow/
    types.ts                   # TypeScript interfaces
    dag.ts                     # DAG + topological sort + cycle detection
    constraint-checker.ts      # Schedule validation
    reflow.service.ts          # Main reflow algorithm
  utils/
    date-utils.ts              # Shift-aware date calculations
    display.ts                 # Console output formatting
  data/
    sample-data.ts             # Shared factories
  scenarios/                   # 4 demo scenarios
  tests/                       # Test suite
prompts/                       # AI prompt documentation
```

## Algorithm

**Topological sort + greedy forward scheduling:**

1. Build dependency DAG, detect cycles
2. Topological sort (Kahn's algorithm) for processing order
3. For each work order (parents first):
   - Earliest start = max(original start, dependency ends, work center free)
   - Snap to valid working time (shift + maintenance aware)
   - End date = shift-aware duration calculation
4. Validate output, generate change log + metrics

### Shift-Aware Duration

Work pauses outside shifts and during maintenance, resumes next available slot.

**Example:** 120 min, starts Mon 4PM, shift ends 5PM:
Mon 4-5PM (60min) -> pause -> Tue 8-9AM (60min) -> done

## Hard Constraints

- No overlapping orders on same work center
- All parent dependencies complete before child starts
- Work only during shift hours
- No work during maintenance windows
- Maintenance orders cannot be rescheduled

## Bonus Features

- DAG with cycle detection (Kahn's algorithm)
- Automated test suite (35+ tests)
- Optimization metrics (total delay, utilization)
- 4 scenarios covering all constraint types
- Setup time handling support
- AI prompt documentation
