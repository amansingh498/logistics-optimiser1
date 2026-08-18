import { useState, useEffect } from 'react';
import './App.css';
import { Node, Vehicle, Edge, VRPSolution, ValidationReport } from './types';
import { solveVRP, validateScenario, buildDistanceMatrix } from './api/logistics';
import { saveConfig, loadConfig, listConfigs } from './api/db';
import { NodeList } from './components/NodeList';
import { VehicleList } from './components/VehicleList';
import { SolutionPanel } from './components/SolutionPanel';
import { RouteMap } from './components/RouteMap';
import { DataImportPanel } from './components/DataImportPanel';
import { ValidationPanel } from './components/ValidationPanel';

function App() {
  const [nodes, setNodes] = useState<Node[]>([
    { id: 0, name: 'Central Depot', type: 'DEPOT', lat: 28.61, lon: 77.20, demand: 0 },
    { id: 1, name: 'Warehouse North', type: 'WAREHOUSE', lat: 28.65, lon: 77.21, demand: 0 },
    { id: 2, name: 'Customer A', type: 'CUSTOMER', lat: 28.67, lon: 77.23, demand: 30 },
    { id: 3, name: 'Customer B', type: 'CUSTOMER', lat: 28.62, lon: 77.18, demand: 25 },
    { id: 4, name: 'Customer C', type: 'CUSTOMER', lat: 28.68, lon: 77.19, demand: 40 },
  ]);

  const [vehicles, setVehicles] = useState<Vehicle[]>([
    { id: 0, name: 'Heavy Truck', depot_id: 0, capacity: 80, max_range_km: 300 },
    { id: 1, name: 'Light Van', depot_id: 0, capacity: 50, max_range_km: 200 },
  ]);

  const [configName, setConfigName] = useState('Default Scenario');
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);
  const [solution, setSolution] = useState<VRPSolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<'optimize' | 'scenario'>('optimize');
  const [matrixStatus, setMatrixStatus] = useState('Road matrix not built yet');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = window.localStorage.getItem('routeforge-theme');
    return savedTheme === 'dark' ? 'dark' : 'light';
  });
  const demoPersistenceNotice = 'Demo mode: saved scenarios may reset whenever the free backend restarts.';
  const depotCount = nodes.filter((node) => node.type === 'DEPOT').length;
  const customerCount = nodes.filter((node) => node.type === 'CUSTOMER').length;
  const totalDemand = nodes
    .filter((node) => node.type === 'CUSTOMER')
    .reduce((sum, node) => sum + Math.max(0, node.demand), 0);
  const totalCapacity = vehicles.reduce((sum, vehicle) => sum + Math.max(0, vehicle.capacity), 0);

  useEffect(() => {
    fetchConfigs();
  }, []);

  useEffect(() => {
    window.localStorage.setItem('routeforge-theme', theme);
  }, [theme]);

  useEffect(() => {
    setMatrixStatus('Road matrix not built yet');
    const timeoutId = window.setTimeout(() => {
      runValidation(false);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [nodes, vehicles]);

  const fetchConfigs = async () => {
    try {
      const names = await listConfigs();
      setSavedConfigs(names);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    const name = configName.trim();
    if (!name) return alert('Enter a name');

    try {
      await saveConfig(name, nodes, vehicles);
      setConfigName(name);
      alert('Saved!');
      fetchConfigs();
    } catch (error: any) {
      alert(`Save failed: ${error.message}`);
    }
  };

  const handleLoad = async (name: string) => {
    if (!name) return;

    try {
      const data = await loadConfig(name);
      setNodes(data.nodes);
      setVehicles(data.vehicles);
      setConfigName(name);
      setSolution(null);
      setValidationReport(null);
      setMatrixStatus('Road matrix not built yet');
      setResultsCollapsed(false);
    } catch (error: any) {
      alert(`Load failed: ${error.message}`);
    }
  };

  const handleAddNode = (node: Node) => setNodes([...nodes, node]);
  const handleRemoveNode = (id: number) => {
    setNodes(nodes.filter(n => n.id !== id));
    setVehicles(vehicles.filter(v => v.depot_id !== id));
  };
  const handleAddVehicle = (vehicle: Vehicle) => setVehicles([...vehicles, vehicle]);
  const handleRemoveVehicle = (id: number) => setVehicles(vehicles.filter(v => v.id !== id));

  const runValidation = async (showAlert: boolean) => {
    setValidating(true);
    try {
      const report = await validateScenario(nodes, vehicles);
      setValidationReport(report);
      if (showAlert) {
        alert(report.is_valid ? 'Scenario validation passed.' : `Scenario has errors:\n${report.errors.join('\n')}`);
      }
      return report;
    } catch (error: any) {
      if (showAlert) alert(`Validation failed: ${error.message}`);
      return null;
    } finally {
      setValidating(false);
    }
  };

  const handleImport = (data: { nodes: Node[]; vehicles: Vehicle[]; warnings: string[] }, mode: 'replace' | 'append') => {
    if (mode === 'replace') {
      setNodes(data.nodes);
      setVehicles(data.vehicles);
    } else {
      const nodeIdMap = new Map<number, number>();
      const usedNodeIds = new Set(nodes.map((node) => node.id));
      let nextNodeId = Math.max(0, ...nodes.map((node) => node.id)) + 1;

      const importedNodes = data.nodes.map((node) => {
        let id = node.id;
        if (usedNodeIds.has(id)) {
          while (usedNodeIds.has(nextNodeId)) nextNodeId += 1;
          id = nextNodeId;
        }
        usedNodeIds.add(id);
        nodeIdMap.set(node.id, id);
        return { ...node, id };
      });

      const usedVehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));
      let nextVehicleId = Math.max(0, ...vehicles.map((vehicle) => vehicle.id)) + 1;

      const importedVehicles = data.vehicles.map((vehicle) => {
        let id = vehicle.id;
        if (usedVehicleIds.has(id)) {
          while (usedVehicleIds.has(nextVehicleId)) nextVehicleId += 1;
          id = nextVehicleId;
        }
        usedVehicleIds.add(id);

        return {
          ...vehicle,
          id,
          depot_id: nodeIdMap.get(vehicle.depot_id) ?? vehicle.depot_id,
        };
      });

      setNodes([...nodes, ...importedNodes]);
      setVehicles([...vehicles, ...importedVehicles]);
    }

    setSolution(null);
    setMatrixStatus('Road matrix not built yet');
    if (data.warnings.length > 0) {
      alert(`Imported with warnings:\n${data.warnings.join('\n')}`);
    }
  };

  const buildStraightLineEdges = () => {
    const dynamicEdges: Edge[] = [];
    let eid = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const n1 = nodes[i], n2 = nodes[j];
        const latKm = (n1.lat - n2.lat) * 111.32;
        const lonKm = (n1.lon - n2.lon) * 111.32 * Math.cos(((n1.lat + n2.lat) / 2) * Math.PI / 180);
        const dist = Math.sqrt((latKm * latKm) + (lonKm * lonKm));
        dynamicEdges.push({ id: eid++, from_node: n1.id, to_node: n2.id, distance_km: dist, time_min: dist * 1.5 });
      }
    }
    return dynamicEdges;
  };

  const prepareScenarioParts = () => {
    const depots = nodes.filter(n => n.type === 'DEPOT').map(n => n.id);
    const customers = nodes.filter(n => n.type === 'CUSTOMER').map(n => n.id);
    const warehouses = nodes.filter(n => n.type === 'WAREHOUSE').map(n => n.id);

    return { depots, customers, warehouses };
  };

  const prepareDistanceMatrix = async () => {
    setMatrixStatus('Building road travel matrix...');
    try {
      const matrix = await buildDistanceMatrix(nodes);
      if (matrix.provider === 'osrm') {
        setMatrixStatus(`Using OSRM road travel matrix (${matrix.edges.length} directed edges)`);
      } else if (matrix.provider === 'straight_line_fallback') {
        setMatrixStatus(`Using estimated straight-line fallback (${matrix.edges.length} directed edges)`);
      } else {
        setMatrixStatus(`Using ${matrix.provider.replaceAll('_', ' ')} matrix (${matrix.edges.length} directed edges)`);
      }
      return matrix.edges;
    } catch (error: any) {
      const fallbackEdges = buildStraightLineEdges();
      setMatrixStatus(`Using local straight-line fallback (${fallbackEdges.length} directed edges)`);
      console.error(error);
      return fallbackEdges;
    }
  };

  const handleSolve = async () => {
    const { depots, customers, warehouses } = prepareScenarioParts();
    if (depots.length === 0 || customers.length === 0 || vehicles.length === 0) {
      return alert('Setup nodes and vehicles first!');
    }

    setLoading(true);
    try {
      const report = await runValidation(false);
      if (report && !report.is_valid) {
        alert(`Fix validation errors before solving:\n${report.errors.join('\n')}`);
        return;
      }
      const dynamicEdges = await prepareDistanceMatrix();
      const result = await solveVRP(nodes, dynamicEdges, vehicles, depots, customers, warehouses);
      setSolution(result);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" data-theme={theme}>
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-content">
          <nav className="sidebar-nav">
            <button className={`nav-button ${activeView === 'optimize' ? 'active' : ''}`} onClick={() => setActiveView('optimize')}>
              Optimize
            </button>
            <button className={`nav-button ${activeView === 'scenario' ? 'active' : ''}`} onClick={() => setActiveView('scenario')}>
              Scenario Setup
            </button>
          </nav>

          <div className="scenario-summary">
            <div>
              <span>Locations</span>
              <strong>{nodes.length}</strong>
            </div>
            <div>
              <span>Customers</span>
              <strong>{customerCount}</strong>
            </div>
            <div>
              <span>Vehicles</span>
              <strong>{vehicles.length}</strong>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-viewport">
        <header className="top-toolbar">
          <div className="toolbar-left">
            <button
              className="toolbar-toggle-btn"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {isSidebarCollapsed ? 'Menu' : 'Hide'}
            </button>
          </div>
          <div className="toolbar-product-name">RouteForge</div>
          <div className="toolbar-right">
            <button
              className="theme-toggle-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              <span className="theme-toggle-icon">{theme === 'dark' ? '☀' : '☾'}</span>
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </header>

        {activeView === 'scenario' ? (
          <section className="scenario-page">
            <div className="scenario-page-header">
              <div>
                <h2>Scenario Setup</h2>
                <p>{demoPersistenceNotice}</p>
              </div>

              <div className="scenario-actions">
                <input
                  className="scenario-input"
                  value={configName}
                  onChange={e => setConfigName(e.target.value)}
                  placeholder="Scenario Name"
                  title={demoPersistenceNotice}
                />
                <button className="btn-primary" onClick={handleSave} title={demoPersistenceNotice}>Save</button>
                <select className="toolbar-select" onChange={e => handleLoad(e.target.value)} value="" title={demoPersistenceNotice}>
                  <option value="">Load Scenario...</option>
                  {savedConfigs.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button className="btn-secondary" onClick={() => runValidation(true)} disabled={validating}>
                  {validating ? 'Checking...' : 'Validate'}
                </button>
              </div>
            </div>

            <div className="scenario-kpis">
              <div>
                <span>Depots</span>
                <strong>{depotCount}</strong>
              </div>
              <div>
                <span>Customers</span>
                <strong>{customerCount}</strong>
              </div>
              <div>
                <span>Total Demand</span>
                <strong>{totalDemand.toFixed(0)}</strong>
              </div>
              <div>
                <span>Fleet Capacity</span>
                <strong>{totalCapacity.toFixed(0)}</strong>
              </div>
            </div>

            <div className="scenario-grid">
              <div className="scenario-column">
                <DataImportPanel onImport={handleImport} />
                <NodeList nodes={nodes} onAdd={handleAddNode} onRemove={handleRemoveNode} />
              </div>
              <div className="scenario-column">
                <VehicleList vehicles={vehicles} nodes={nodes} onAdd={handleAddVehicle} onRemove={handleRemoveVehicle} />
                <ValidationPanel report={validationReport} />
              </div>
            </div>
          </section>
        ) : (
          <section className="optimize-page">
            <div className="optimize-page-header">
              <div>
                <h2>Route Optimization</h2>
                <p>{configName}</p>
              </div>
              <div className="optimize-header-actions">
                <div className="optimize-status">
                  {validationReport?.is_valid === false ? 'Needs scenario fixes' : 'Ready for analysis'}
                </div>
                <button className="btn-secondary" onClick={() => runValidation(true)} disabled={validating}>
                  {validating ? 'Checking...' : 'Validate'}
                </button>
                <button className="btn-primary" onClick={handleSolve} disabled={loading}>
                  {loading ? 'Optimizing...' : 'Optimize Routes'}
                </button>
              </div>
            </div>

            <div className="scenario-kpis">
              <div>
                <span>Locations</span>
                <strong>{nodes.length}</strong>
              </div>
              <div>
                <span>Vehicles</span>
                <strong>{vehicles.length}</strong>
              </div>
              <div>
                <span>Total Demand</span>
                <strong>{totalDemand.toFixed(0)}</strong>
              </div>
              <div>
                <span>Fleet Capacity</span>
                <strong>{totalCapacity.toFixed(0)}</strong>
              </div>
            </div>

            <section className="map-panel">
              <RouteMap nodes={nodes} vehicles={vehicles} solution={solution} />
            </section>

            <div className="runtime-note">{demoPersistenceNotice}</div>
            <div className="matrix-note">{matrixStatus}</div>

            <ValidationPanel report={validationReport} />

            {solution && (
              <section className="results-container">
                <div className="collapsible-header" onClick={() => setResultsCollapsed(!resultsCollapsed)} style={{ marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                  <h2 style={{ margin: 0 }}>Optimization Results</h2>
                  <span className={`toggle-icon ${!resultsCollapsed ? 'open' : ''}`}>v</span>
                </div>

                <div className={`collapsible-content ${resultsCollapsed ? 'collapsed' : ''}`}>
                  <SolutionPanel solution={solution} nodes={nodes} vehicles={vehicles} />
                </div>
              </section>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
