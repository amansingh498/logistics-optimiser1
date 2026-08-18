import React, { useState } from 'react';
import { Vehicle, Node } from '../types';

interface VehicleListProps {
  vehicles: Vehicle[];
  nodes: Node[];
  onAdd: (vehicle: Vehicle) => void;
  onRemove: (id: number) => void;
}

export const VehicleList: React.FC<VehicleListProps> = ({ vehicles, nodes, onAdd, onRemove }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newVehicle, setNewVehicle] = useState<Partial<Vehicle>>({
    name: '',
    depot_id: nodes.find(n => n.type === 'DEPOT')?.id || 0,
    capacity: 50,
    max_range_km: 300,
    speed_kmh: 60,
    cost_per_km: 1.0,
  });

  const depots = nodes.filter(n => n.type === 'DEPOT');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicle.name?.trim() || newVehicle.depot_id === undefined) {
      alert('Please provide a name and select a depot.');
      return;
    }

    const vehicle: Vehicle = {
      id: Math.max(0, ...vehicles.map(v => v.id)) + 1,
      name: newVehicle.name.trim(),
      depot_id: Number(newVehicle.depot_id),
      capacity: Number(newVehicle.capacity),
      max_range_km: Number(newVehicle.max_range_km),
      speed_kmh: Number(newVehicle.speed_kmh),
      cost_per_km: Number(newVehicle.cost_per_km),
    };

    onAdd(vehicle);
    setNewVehicle({ ...newVehicle, name: '' });
  };

  return (
    <section className="workspace-section">
      <button className="section-toggle" type="button" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span>
          <strong>Fleet</strong>
          <small>Vehicles and depot assignment</small>
        </span>
        <span className={`toggle-icon ${!isCollapsed ? 'open' : ''}`}>v</span>
      </button>

      <div className={`collapsible-content ${isCollapsed ? 'collapsed' : ''}`}>
        <form className="node-form form-grid" onSubmit={handleSubmit}>
          <input
            placeholder="Vehicle name"
            value={newVehicle.name}
            onChange={e => setNewVehicle({ ...newVehicle, name: e.target.value })}
          />
          <select
            value={newVehicle.depot_id}
            onChange={e => setNewVehicle({ ...newVehicle, depot_id: Number(e.target.value) })}
          >
            {depots.length === 0 && <option value="">No depots available</option>}
            {depots.map(d => (
              <option key={d.id} value={d.id}>Start at {d.name}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Capacity"
            value={newVehicle.capacity}
            onChange={e => setNewVehicle({ ...newVehicle, capacity: Number(e.target.value) })}
          />
          <input
            type="number"
            placeholder="Max range km"
            value={newVehicle.max_range_km}
            onChange={e => setNewVehicle({ ...newVehicle, max_range_km: Number(e.target.value) })}
          />
          <button type="submit" className="btn-primary">Add Vehicle</button>
        </form>

        <ul className="list">
          {vehicles.map((vehicle) => (
            <li key={vehicle.id} className="list-item">
              <div className="list-item-main">
                <strong>{vehicle.name}</strong>
                <span>
                  Depot {nodes.find(n => n.id === vehicle.depot_id)?.name || 'Unknown'} · Capacity {vehicle.capacity} · Range {vehicle.max_range_km} km
                </span>
              </div>
              <button className="btn-icon-danger" onClick={() => onRemove(vehicle.id)} aria-label={`Remove ${vehicle.name}`}>
                x
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
