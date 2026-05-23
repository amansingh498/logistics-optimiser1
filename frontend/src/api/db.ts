import { Node, Vehicle } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function saveConfig(name: string, nodes: Node[], vehicles: Vehicle[]) {
  const response = await fetch(`${API_BASE}/save-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, nodes, vehicles }),
  });
  return response.json();
}

export async function loadConfig(name: string) {
  const response = await fetch(`${API_BASE}/load-config/${name}`);
  if (!response.ok) throw new Error("Config not found");
  return response.json();
}

export async function listConfigs(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/list-configs`);
  return response.json();
}
