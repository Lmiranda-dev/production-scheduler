# Algorithm Design Prompts

## Prompt: Core Algorithm Approach
"I need to build a production schedule reflow system. Work orders have dependencies, must respect shift hours, avoid maintenance windows, and not overlap on work centers. What algorithm approach would you recommend?"

**Key insight:** Topological sort + greedy forward scheduling. Process orders in dependency order, schedule each at its earliest valid time.

## Prompt: Shift Calculation
"How should I calculate when a work order ends if it needs to pause outside shift hours?"

**Key insight:** Iterate through shifts consuming available minutes per segment. Track working minutes separately from elapsed clock time. Handle maintenance windows as gaps within shifts.

## Prompt: Dependency Resolution
"Work orders can have multiple parents. How to handle when parents finish at different times?"

**Key insight:** Child earliest start = max(all parent end dates). Topological sort guarantees all parents process before children.

## Prompt: Maintenance Window Handling
"How to handle when a work order partially overlaps with a maintenance window?"

**Key insight:** Break the shift into work segments around maintenance windows. The order works until maintenance starts, pauses, then resumes after maintenance ends within the same shift.
