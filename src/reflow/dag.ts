import { WorkOrder, DAGResult, DAGNode } from "./types";

// ============================================================================
// Directed Acyclic Graph (DAG) for Dependency Management
// ============================================================================

/** Build a DAG from work orders and their dependencies. */
export function buildDAG(workOrders: WorkOrder[]): Map<string, DAGNode> {
  const graph = new Map<string, DAGNode>();

  for (const wo of workOrders) {
    graph.set(wo.docId, {
      workOrderId: wo.docId,
      dependsOn: [...wo.data.dependsOnWorkOrderIds],
      dependedBy: [],
    });
  }

  // Build reverse edges
  for (const wo of workOrders) {
    for (const parentId of wo.data.dependsOnWorkOrderIds) {
      const parentNode = graph.get(parentId);
      if (parentNode) {
        parentNode.dependedBy.push(wo.docId);
      }
    }
  }

  return graph;
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns work order IDs in dependency order (parents first).
 * Detects cycles — returns hasCycle: true if circular dependencies exist.
 */
export function topologicalSort(workOrders: WorkOrder[]): DAGResult {
  const graph = buildDAG(workOrders);

  // In-degree: count of unresolved dependencies per node
  const inDegree = new Map<string, number>();
  for (const [id, node] of graph) {
    const validDeps = node.dependsOn.filter(depId => graph.has(depId));
    inDegree.set(id, validDeps.length);
  }

  // Start with nodes that have zero dependencies
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sortedOrder: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sortedOrder.push(current);

    const node = graph.get(current)!;
    for (const childId of node.dependedBy) {
      const newDegree = (inDegree.get(childId) ?? 0) - 1;
      inDegree.set(childId, newDegree);
      if (newDegree === 0) queue.push(childId);
    }
  }

  if (sortedOrder.length < graph.size) {
    const cycleNodes = [...graph.keys()].filter(id => !sortedOrder.includes(id));
    return { sortedOrder: [], hasCycle: true, cycleDetails: cycleNodes };
  }

  return { sortedOrder, hasCycle: false };
}

/** Find dependency references that don't point to existing work orders. */
export function findMissingDependencies(workOrders: WorkOrder[]): string[] {
  const allIds = new Set(workOrders.map(wo => wo.docId));
  const missing: string[] = [];

  for (const wo of workOrders) {
    for (const depId of wo.data.dependsOnWorkOrderIds) {
      if (!allIds.has(depId)) missing.push(depId);
    }
  }

  return [...new Set(missing)];
}
