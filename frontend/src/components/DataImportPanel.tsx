import React, { useState } from 'react';
import { ImportFiles, importScenarioData } from '../api/importData';
import { ImportedScenarioData } from '../types';

interface DataImportPanelProps {
  onImport: (data: ImportedScenarioData, mode: 'replace' | 'append') => void;
}

export const DataImportPanel: React.FC<DataImportPanelProps> = ({ onImport }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [files, setFiles] = useState<ImportFiles>({});
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [loading, setLoading] = useState(false);

  const updateFile = (key: keyof ImportFiles, fileList: FileList | null) => {
    setFiles({ ...files, [key]: fileList?.[0] || null });
  };

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!files.depots && !files.orders && !files.vehicles) {
      alert('Choose at least one CSV or Excel file.');
      return;
    }

    setLoading(true);
    try {
      const imported = await importScenarioData(files);
      onImport(imported, mode);
    } catch (error: any) {
      alert(`Import failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="workspace-section">
      <button className="section-toggle" type="button" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span>
          <strong>Import Data</strong>
          <small>Upload depots, orders, and fleet files</small>
        </span>
        <span className={`toggle-icon ${!isCollapsed ? 'open' : ''}`}>v</span>
      </button>

      <div className={`collapsible-content ${isCollapsed ? 'collapsed' : ''}`}>
        <form className="node-form" onSubmit={handleImport}>
          <label className="file-input-label">
            Depots CSV/XLSX
            <input type="file" accept=".csv,.xlsx" onChange={(event) => updateFile('depots', event.target.files)} />
          </label>
          <label className="file-input-label">
            Orders CSV/XLSX
            <input type="file" accept=".csv,.xlsx" onChange={(event) => updateFile('orders', event.target.files)} />
          </label>
          <label className="file-input-label">
            Vehicles CSV/XLSX
            <input type="file" accept=".csv,.xlsx" onChange={(event) => updateFile('vehicles', event.target.files)} />
          </label>

          <select value={mode} onChange={(event) => setMode(event.target.value as 'replace' | 'append')}>
            <option value="replace">Replace current scenario</option>
            <option value="append">Add to current scenario</option>
          </select>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Importing...' : 'Import Files'}
          </button>
        </form>

        <div className="import-help">
          Required headers: depots need name, lat, lon. Orders need name, lat, lon, demand. Vehicles need name,
          capacity, max_range_km, and depot_id or depot_name.
        </div>
      </div>
    </section>
  );
};
