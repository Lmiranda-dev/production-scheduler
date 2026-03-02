// ============================================================================
// Lightweight Test Runner (no external deps needed)
// ============================================================================

interface TestCase { name: string; fn: () => void; }
interface TestSuite { name: string; tests: TestCase[]; }

const suites: TestSuite[] = [];
let currentSuite: TestSuite | null = null;

export function describe(name: string, fn: () => void): void {
  currentSuite = { name, tests: [] };
  suites.push(currentSuite);
  fn();
  currentSuite = null;
}

export function it(name: string, fn: () => void): void {
  if (!currentSuite) throw new Error("it() must be inside describe()");
  currentSuite.tests.push({ name, fn });
}

export function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected)
        throw new Error("Expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
    },
    toEqual(expected: T) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error("Expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
    },
    toBeGreaterThan(expected: number) {
      if ((actual as number) <= (expected as number))
        throw new Error("Expected " + actual + " > " + expected);
    },
    toBeLessThan(expected: number) {
      if ((actual as number) >= (expected as number))
        throw new Error("Expected " + actual + " < " + expected);
    },
    toBeGreaterThanOrEqual(expected: number) {
      if ((actual as number) < (expected as number))
        throw new Error("Expected " + actual + " >= " + expected);
    },
    toBeTruthy() {
      if (!actual) throw new Error("Expected truthy, got " + JSON.stringify(actual));
    },
    toBeFalsy() {
      if (actual) throw new Error("Expected falsy, got " + JSON.stringify(actual));
    },
    toThrow(msg?: string) {
      if (typeof actual !== "function") throw new Error("toThrow() needs a function");
      let threw = false, errMsg = "";
      try { (actual as Function)(); } catch (e: any) { threw = true; errMsg = e.message; }
      if (!threw) throw new Error("Expected to throw, but did not");
      if (msg && !errMsg.includes(msg))
        throw new Error('Expected error containing "' + msg + '", got "' + errMsg + '"');
    },
    toContain(expected: any) {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected))
          throw new Error("Expected array to contain " + JSON.stringify(expected));
      } else if (typeof actual === "string") {
        if (!actual.includes(expected))
          throw new Error('Expected string to contain "' + expected + '"');
      }
    },
    toHaveLength(expected: number) {
      if ((actual as any).length !== expected)
        throw new Error("Expected length " + expected + ", got " + (actual as any).length);
    },
  };
}

export function runTests(): void {
  let passed = 0, failed = 0;
  const failures: { suite: string; test: string; error: string }[] = [];

  console.log("\n🧪 Running Tests...\n");

  for (const suite of suites) {
    console.log("  📦 " + suite.name);
    for (const test of suite.tests) {
      try {
        test.fn();
        console.log("    ✅ " + test.name);
        passed++;
      } catch (e: any) {
        console.log("    ❌ " + test.name);
        console.log("       " + e.message);
        failed++;
        failures.push({ suite: suite.name, test: test.name, error: e.message });
      }
    }
    console.log();
  }

  console.log("─".repeat(50));
  console.log("Results: " + passed + " passed, " + failed + " failed");

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log("  " + f.suite + " > " + f.test);
      console.log("    " + f.error);
    }
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
  }
}
