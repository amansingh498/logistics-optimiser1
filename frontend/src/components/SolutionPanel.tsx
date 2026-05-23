import React from 'react';
import { VRPSolution, Node, Vehicle } from '../types';

interface SolutionPanelProps {
  solution: VRPSolution;
  nodes: Node[];
  vehicles: Vehicle[];
}

export const SolutionPanel: React.FC<SolutionPanelProps> = ({ solution, nodes, vehicles }) => {
  const getNode = (id: number) => nodes.find((n) => n.id === id);
  const getVehicle = (id: number) => vehicles.find((v) => v.id === id);

  return (
    <div className="solution-panel">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
        <h3 style={{margin: 0}}>Optimization Results</h3>
        <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>
          Algo: <strong>{solution.algorithm_used}</strong> | Time: <strong>{solution.execution_time_ms?.toFixed(1)}ms</strong>
        </div>
      </div>

      <div className="metrics">
        <div className="metric-item">
          <label>Total Distance</label>
          <span>{solution.total_distance_km.toFixed(1)} <small>km</small></span>
        </div>
        <div className="metric-item">
          <label>Est. Travel Time</label>
          <span>{solution.total_time_min.toFixed(0)} <small>min</small></span>
        </div>
        <div className="metric-item">
          <label>Routes</label>
          <span>{solution.routes.length}</span>
        </div>
        <div className="metric-item">
          <label>Status</label>
          <span style={{color: solution.is_complete ? 'var(--success)' : 'var(--error)'}}>
            {solution.is_complete ? 'Complete' : 'Incomplete'}
          </span>
        </div>
      </div>

      <div className="routes-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px'}}>
        {solution.routes.map((route, idx) => {
          const vehicle = getVehicle(route.vehicle_id);
          const loadPercentage = vehicle ? (route.load / vehicle.capacity) * 100 : 0;
          
          return (
            <div key={idx} className="route-card" style={{borderLeft: '4px solid var(--primary)'}}>
              <div className="route-header">
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <span style={{fontSize: '1.2rem'}}>🚚</span>
                  <div>
                    <div style={{fontSize: '0.9rem', fontWeight: 700}}>{vehicle?.name || `Vehicle ${route.vehicle_id}`}</div>
                    <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>ID: {route.vehicle_id}</div>
                  </div>
                </div>
                <div style={{textAlign: 'right'}}>
                  <div style={{fontSize: '0.9rem', fontWeight: 700}}>{route.total_distance_km.toFixed(1)} km</div>
                  {!route.feasible && <div style={{color: 'var(--error)', fontSize: '0.7rem', fontWeight: 800}}>INFEASIBLE</div>}
                </div>
              </div>

              {/* Load Bar */}
              <div style={{marginBottom: '16px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px'}}>
                  <span>Capacity Utilization</span>
                  <span>{route.load.toFixed(0)} / {vehicle?.capacity || '??'} units ({loadPercentage.toFixed(0)}%)</span>
                </div>
                <div style={{width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden'}}>
                  <div style={{
                    width: `${Math.min(loadPercentage, 100)}%`, 
                    height: '100%', 
                    background: loadPercentage > 100 ? 'var(--error)' : 'var(--success)',
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>

              {/* Path Steps */}
              <div className="route-timeline" style={{position: 'relative', paddingLeft: '20px'}}>
                <div style={{
                  position: 'absolute', left: '4px', top: '10px', bottom: '10px', 
                  width: '2px', background: '#e2e8f0', zIndex: 0
                }} />
                
                {route.stops.map((stopId, sIdx) => {
                  const node = getNode(stopId);
                  const isDepot = node?.type === 'DEPOT';
                  return (
                    <div key={sIdx} style={{position: 'relative', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                      <div style={{
                        width: '10px', height: '10px', borderRadius: '50%', 
                        background: isDepot ? 'var(--primary)' : 'white', 
                        border: '2px solid var(--primary)',
                        position: 'relative', zIndex: 1, left: '-20px', flexShrink: 0
                      }} />
                      <div className="path-step" style={{
                        flex: 1, fontSize: '0.85rem', padding: '6px 10px',
                        background: isDepot ? '#eff6ff' : 'white',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontWeight: isDepot ? 700 : 400
                      }}>
                        {node?.name || `Stop ${stopId}`}
                        {node?.demand ? <span style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '8px'}}>Demand: {node.demand}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
