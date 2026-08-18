export type NodeType = 'DEPOT' | 'CUSTOMER' | 'WAREHOUSE';

export interface Node {
  id: number;
  name: string;
  type: NodeType;
  lat: number;
  lon: number;
  demand: number;
}

export interface Vehicle {
  id: number;
  name: string;
  depot_id: number;
  capacity: number;
  max_range_km: number;
  speed_kmh?: number;
  cost_per_km?: number;
}

export interface ImportedScenarioData {
  nodes: Node[];
  vehicles: Vehicle[];
  warnings: string[];
}

export interface ValidationSummary {
  locations: number;
  depots: number;
  orders: number;
  warehouses: number;
  vehicles: number;
  total_demand: number;
  total_capacity: number;
}

export interface ValidationReport {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  summary: ValidationSummary;
}

export interface Edge {
  id: number;
  from_node: number;
  to_node: number;
  distance_km: number;
  time_min: number;
}

export interface DistanceMatrixResult {
  edges: Edge[];
  provider: 'osrm' | 'straight_line' | 'straight_line_fallback' | 'none';
  warnings: string[];
}

export interface Route {
  vehicle_id: number;
  stops: number[];
  total_distance_km: number;
  total_time_min: number;
  total_cost: number;
  load: number;
  feasible: boolean;
}

export interface VRPSolution {
  total_distance_km: number;
  total_time_min: number;
  total_cost: number;
  unserved_customers: number;
  algorithm_used: string;
  is_complete: boolean;
  routes: Route[];
  execution_time_ms?: number;
}
