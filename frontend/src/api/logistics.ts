import { Node, Edge, Vehicle, VRPSolution } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function solveVRP(
  nodes: Node[],
  edges: Edge[],
  vehicles: Vehicle[],
  depots: number[],
  customers: number[],
  warehouses: number[]
): Promise<VRPSolution> {
  const response = await fetch(`${API_BASE}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodes,
      edges,
      vehicles,
      depots,
      customers,
      warehouses,
      return_to_depot: true,
      w_distance: 1.0,
      w_time: 0.5,
      w_cost: 0.3,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = 'Failed to solve VRP';
    try {
      const errorData = JSON.parse(errorBody);
      errorMessage = errorData.detail || errorMessage;
    } catch {
      errorMessage = errorBody || errorMessage;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function compareVRP(
  nodes: Node[],
  edges: Edge[],
  vehicles: Vehicle[],
  depots: number[],
  customers: number[],
  warehouses: number[]
): Promise<VRPSolution[]> {
  const response = await fetch(`${API_BASE}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodes,
      edges,
      vehicles,
      depots,
      customers,
      warehouses,
      return_to_depot: true,
      w_distance: 1.0,
      w_time: 0.5,
      w_cost: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error('Comparison failed');
  }

  return response.json();
}
