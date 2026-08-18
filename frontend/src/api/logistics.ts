import { Node, Edge, Vehicle, VRPSolution, ValidationReport, DistanceMatrixResult } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function getErrorMessage(errorBody: string, fallback: string) {
  try {
    const errorData = JSON.parse(errorBody);
    const detail = errorData.detail;
    if (typeof detail === 'string') return detail;
    if (detail?.message && Array.isArray(detail.errors)) {
      return `${detail.message}\n${detail.errors.join('\n')}`;
    }
    if (detail?.message) return detail.message;
  } catch {
    // Keep fallback handling below for non-JSON responses.
  }
  return errorBody || fallback;
}

export async function validateScenario(nodes: Node[], vehicles: Vehicle[]): Promise<ValidationReport> {
  const response = await fetch(`${API_BASE}/validate-scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, vehicles }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(getErrorMessage(errorBody, 'Validation failed'));
  }

  return response.json();
}

export async function buildDistanceMatrix(nodes: Node[]): Promise<DistanceMatrixResult> {
  const response = await fetch(`${API_BASE}/distance-matrix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, provider: 'osrm', fallback: true }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(getErrorMessage(errorBody, 'Failed to build distance matrix'));
  }

  return response.json();
}

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
    throw new Error(getErrorMessage(errorBody, 'Failed to solve VRP'));
  }

  return response.json();
}

