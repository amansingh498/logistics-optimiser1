import { Node, Vehicle } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface SavedConfigData {
  nodes: Node[];
  vehicles: Vehicle[];
}

async function getErrorMessage(response: Response, fallback: string) {
  const body = await response.text();
  if (!body) return fallback;

  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.detail === 'string') return parsed.detail;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // Use the raw body below for non-JSON API errors.
  }

  return body;
}

export async function saveConfig(name: string, nodes: Node[], vehicles: Vehicle[]) {
  const response = await fetch(`${API_BASE}/save-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, nodes, vehicles }),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to save scenario'));
  }

  return response.json();
}

export async function loadConfig(name: string): Promise<SavedConfigData> {
  const response = await fetch(`${API_BASE}/load-config/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Scenario not found'));
  }

  const data = await response.json();
  if (!Array.isArray(data.nodes) || !Array.isArray(data.vehicles)) {
    throw new Error('Saved scenario data is invalid');
  }

  return data;
}

export async function listConfigs(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/list-configs`);
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to load saved scenarios'));
  }

  return response.json();
}
