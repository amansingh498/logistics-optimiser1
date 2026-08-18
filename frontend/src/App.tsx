import { useState, useEffect } from 'react';
import './App.css';
import { Node, Vehicle, Edge, VRPSolution, ValidationReport } from './types';
import { solveVRP, compareVRP, validateScenario } from './api/logistics';
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
  const [comparisonResults, setComparisonResults] = useState<VRPSolution[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<'optimize' | 'scenario'>('optimize');
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
      setComparisonResults(null);
      setValidationReport(null);
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
    setComparisonResults(null);
    if (data.warnings.length > 0) {
      alert(`Imported with warnings:\n${data.warnings.join('\n')}`);
    }
  };

  const prepareSolveData = () => {
    const depots = nodes.filter(n => n.type === 'DEPOT').map(n => n.id);
    const customers = nodes.filter(n => n.type === 'CUSTOMER').map(n => n.id);
    const warehouses = nodes.filter(n => n.type === 'WAREHOUSE').map(n => n.id);

    const dynamicEdges: Edge[] = [];
    let eid = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const n1 = nodes[i], n2 = nodes[j];
        const dist = Math.sqrt(Math.pow(n1.lat - n2.lat, 2) + Math.pow(n1.lon - n2.lon, 2)) * 111;
        dynamicEdges.push({ id: eid++, from_node: n1.id, to_node: n2.id, distance_km: dist, time_min: dist * 1.5 });
      }
    }

    return { depots, customers, warehouses, dynamicEdges };
  };

  const handleSolve = async () => {
    const { depots, customers, warehouses, dynamicEdges } = prepareSolveData();
    if (depots.length === 0 || customers.length === 0 || vehicles.length === 0) {
      return alert('Setup nodes and vehicles first!');
    }

    setLoading(true);
    setComparisonResults(null);
    try {
      const report = await runValidation(false);
      if (report && !report.is_valid) {
        alert(`Fix validation errors before solving:\n${report.errors.join('\n')}`);
        return;
      }
      const result = await solveVRP(nodes, dynamicEdges, vehicles, depots, customers, warehouses);
      setSolution(result);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async () => {
    const { depots, customers, warehouses, dynamicEdges } = prepareSolveData();
    if (depots.length === 0 || customers.length === 0 || vehicles.length === 0) {
      return alert('Setup nodes and vehicles first!');
    }

    setLoading(true);
    setSolution(null);
    try {
      const report = await runValidation(false);
      if (report && !report.is_valid) {
        alert(`Fix validation errors before comparing:\n${report.errors.join('\n')}`);
        return;
      }
      const results = await compareVRP(nodes, dynamicEdges, vehicles, depots, customers, warehouses);
      setComparisonResults(results);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <span>Aslan Operations</span>
          <h1>Logistics Optimiser</h1>
        </div>
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
          <div className="toolbar-group">
            <button
              className="toolbar-toggle-btn"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {isSidebarCollapsed ? 'Menu' : 'Hide'}
            </button>
            <div className="toolbar-separator"></div>
            <button className={activeView === 'optimize' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveView('optimize')}>
              Optimize
            </button>
            <button className={activeView === 'scenario' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveView('scenario')}>
              Scenario Setup
            </button>
            <div className="toolbar-scenario-name">{configName}</div>
          </div>

          {activeView === 'optimize' && (
            <div className="toolbar-group">
              <button className="btn-secondary" onClick={() => runValidation(true)} disabled={validating}>
                {validating ? 'Checking...' : 'Validate'}
              </button>
              <div className="toolbar-separator"></div>
              <button className="btn-primary" onClick={handleSolve} disabled={loading} style={{ minWidth: '120px' }}>
                {loading ? 'Solving...' : 'Solve VRP'}
              </button>
              <button className="btn-secondary" onClick={handleCompare} disabled={loading} style={{ minWidth: '120px' }}>
                {loading ? 'Comparing...' : 'Compare DAA'}
              </button>
            </div>
          )}
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
              <div className="optimize-status">
                {validationReport?.is_valid === false ? 'Needs scenario fixes' : 'Ready for analysis'}
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
              <RouteMap nodes={nodes} solution={solution || (comparisonResults ? comparisonResults[1] : null)} />
            </section>

            <div className="runtime-note">{demoPersistenceNotice}</div>

            <ValidationPanel report={validationReport} />

            {(solution || comparisonResults) && (
              <section className="results-container">
                <div className="collapsible-header" onClick={() => setResultsCollapsed(!resultsCollapsed)} style={{ marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                  <h2 style={{ margin: 0 }}>Optimization Results & Analysis</h2>
                  <span className={`toggle-icon ${!resultsCollapsed ? 'open' : ''}`}>v</span>
                </div>

                <div className={`collapsible-content ${resultsCollapsed ? 'collapsed' : ''}`}>
                  {solution && <SolutionPanel solution={solution} nodes={nodes} vehicles={vehicles} />}

                  {comparisonResults && (
                    <div className="comparison-view">
                      <h3>DAA Algorithm Comparison</h3>
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Metric</th>
                              {comparisonResults.map((res, i) => (
                                <th key={i}>{res.algorithm_used}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>Total Distance (km)</td>
                              {comparisonResults.map((res, i) => (
                                <td key={i}><strong>{res.total_distance_km.toFixed(2)}</strong></td>
                              ))}
                            </tr>
                            <tr>
                              <td>Total Time (min)</td>
                              {comparisonResults.map((res, i) => (
                                <td key={i}>{res.total_time_min.toFixed(2)}</td>
                              ))}
                            </tr>
                            <tr>
                              <td>Execution Time (ms)</td>
                              {comparisonResults.map((res, i) => (
                                <td key={i}>{res.execution_time_ms.toFixed(2)}</td>
                              ))}
                            </tr>
                            <tr>
                              <td>Improvement %</td>
                              {comparisonResults.map((res, i) => (
                                <td key={i} style={{ color: i > 0 ? 'var(--success)' : 'inherit' }}>
                                  {i === 0 ? '-' : `${(((comparisonResults[0].total_distance_km - res.total_distance_km) / comparisonResults[0].total_distance_km) * 100).toFixed(1)}%`}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
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
