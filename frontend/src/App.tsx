import { useState, useEffect } from 'react';
import './App.css';
import { Node, Vehicle, Edge, VRPSolution } from './types';
import { solveVRP, compareVRP } from './api/logistics';
import { saveConfig, loadConfig, listConfigs } from './api/db';
import { NodeList } from './components/NodeList';
import { VehicleList } from './components/VehicleList';
import { SolutionPanel } from './components/SolutionPanel';
import { RouteMap } from './components/RouteMap';

function App() {
  const [nodes, setNodes] = useState<Node[]>([
    { id: 0, name: "Central Depot", type: 'DEPOT', lat: 28.61, lon: 77.20, demand: 0 },
    { id: 1, name: "Warehouse North", type: 'WAREHOUSE', lat: 28.65, lon: 77.21, demand: 0 },
    { id: 2, name: "Customer A", type: 'CUSTOMER', lat: 28.67, lon: 77.23, demand: 30 },
    { id: 3, name: "Customer B", type: 'CUSTOMER', lat: 28.62, lon: 77.18, demand: 25 },
    { id: 4, name: "Customer C", type: 'CUSTOMER', lat: 28.68, lon: 77.19, demand: 40 },
  ]);

  const [vehicles, setVehicles] = useState<Vehicle[]>([
    { id: 0, name: "Heavy Truck", depot_id: 0, capacity: 80, max_range_km: 300 },
    { id: 1, name: "Light Van", depot_id: 0, capacity: 50, max_range_km: 200 },
  ]);

  const [configName, setConfigName] = useState("Default Scenario");
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);
  const [solution, setSolution] = useState<VRPSolution | null>(null);
  const [comparisonResults, setComparisonResults] = useState<VRPSolution[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const demoPersistenceNotice = 'Demo mode: saved scenarios may reset whenever the free backend restarts.';

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const names = await listConfigs();
      setSavedConfigs(names);
    } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    if (!configName) return alert("Enter a name");
    await saveConfig(configName, nodes, vehicles);
    alert("Saved!");
    fetchConfigs();
  };

  const handleLoad = async (name: string) => {
    try {
      const data = await loadConfig(name);
      setNodes(data.nodes);
      setVehicles(data.vehicles);
      setConfigName(name);
      setSolution(null);
      setComparisonResults(null);
    } catch (e) { alert("Load failed"); }
  };

  const handleAddNode = (node: Node) => setNodes([...nodes, node]);
  const handleRemoveNode = (id: number) => {
    setNodes(nodes.filter(n => n.id !== id));
    setVehicles(vehicles.filter(v => v.depot_id !== id));
  };
  const handleAddVehicle = (vehicle: Vehicle) => setVehicles([...vehicles, vehicle]);
  const handleRemoveVehicle = (id: number) => setVehicles(vehicles.filter(v => v.id !== id));

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
      return alert("Setup nodes and vehicles first!");
    }

    setLoading(true);
    setComparisonResults(null);
    try {
      const result = await solveVRP(nodes, dynamicEdges, vehicles, depots, customers, warehouses);
      setSolution(result);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  const handleCompare = async () => {
    const { depots, customers, warehouses, dynamicEdges } = prepareSolveData();
    if (depots.length === 0 || customers.length === 0 || vehicles.length === 0) {
      return alert("Setup nodes and vehicles first!");
    }

    setLoading(true);
    setSolution(null);
    try {
      const results = await compareVRP(nodes, dynamicEdges, vehicles, depots, customers, warehouses);
      setComparisonResults(results);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="app-container">
      {/* Sidebar Area: Data Entry & Configuration */}
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <h1>LOGISTICS OPTIMISER</h1>
        </div>
        <div className="sidebar-content">
          <NodeList nodes={nodes} onAdd={handleAddNode} onRemove={handleRemoveNode} />
          <VehicleList vehicles={vehicles} nodes={nodes} onAdd={handleAddVehicle} onRemove={handleRemoveVehicle} />
        </div>
      </aside>

      {/* Main Area: Map & Visualization */}
      <main className="main-viewport">
        {/* Top Toolbar */}
        <header className="top-toolbar">
          <div className="toolbar-group">
            <button 
              className="toolbar-toggle-btn" 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isSidebarCollapsed ? '☰' : '◀'}
            </button>
            <div className="toolbar-separator"></div>
            <input 
              className="scenario-input"
              value={configName} 
              onChange={e => setConfigName(e.target.value)} 
              placeholder="Scenario Name"
              title={demoPersistenceNotice}
            />
            <button className="btn-primary" onClick={handleSave} title={demoPersistenceNotice}>Save</button>
            <select 
              className="toolbar-select"
              onChange={e => handleLoad(e.target.value)} 
              value=""
              title={demoPersistenceNotice}
            >
              <option value="">Load Scenario...</option>
              {savedConfigs.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="toolbar-group">
            <div className="toolbar-separator"></div>
            <button className="btn-primary" onClick={handleSolve} disabled={loading} style={{ minWidth: '120px' }}>
              {loading ? 'Solving...' : '🚀 Solve VRP'}
            </button>
            <button className="btn-secondary" onClick={handleCompare} disabled={loading} style={{ minWidth: '120px' }}>
              {loading ? 'Comparing...' : '⚖️ Compare DAA'}
            </button>
          </div>
        </header>

        {/* Map Section */}
        <section className="map-container">
          <RouteMap nodes={nodes} solution={solution || (comparisonResults ? comparisonResults[1] : null)} />
        </section>

        <div style={{ padding: '0 24px 12px', color: 'var(--text-muted, #666)', fontSize: '0.9rem' }}>
          {demoPersistenceNotice}
        </div>

        {/* Results Section (Appears when solved) */}
        {(solution || comparisonResults) && (
          <section className="results-container">
            <div className="collapsible-header" onClick={() => setResultsCollapsed(!resultsCollapsed)} style={{marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px'}}>
              <h2 style={{margin: 0}}>📊 Optimization Results & Analysis</h2>
              <span className={`toggle-icon ${!resultsCollapsed ? 'open' : ''}`}>▼</span>
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
                            <td key={i} style={{color: i > 0 ? 'var(--success)' : 'inherit'}}>
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
      </main>
    </div>

  );
}

export default App;
