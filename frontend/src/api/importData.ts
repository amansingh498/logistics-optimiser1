import { ImportedScenarioData } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface ImportFiles {
  depots?: File | null;
  orders?: File | null;
  vehicles?: File | null;
}

async function fileToPayload(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return {
    filename: file.name,
    content_base64: btoa(binary),
  };
}

export async function importScenarioData(files: ImportFiles): Promise<ImportedScenarioData> {
  const payload: Record<string, unknown> = {};

  if (files.depots) payload.depots = await fileToPayload(files.depots);
  if (files.orders) payload.orders = await fileToPayload(files.orders);
  if (files.vehicles) payload.vehicles = await fileToPayload(files.vehicles);

  const response = await fetch(`${API_BASE}/import-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Import endpoint was not found. Restart the backend so it loads the latest /import-data route.');
    }

    const errorBody = await response.text();
    let errorMessage = errorBody || 'Import failed';
    try {
      const errorData = JSON.parse(errorBody);
      errorMessage = errorData.detail || errorMessage;
    } catch {
      // Keep the raw response text when the server did not return JSON.
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
