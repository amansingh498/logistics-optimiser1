import React, { useState } from 'react';
import { Node, NodeType } from '../types';

interface NodeListProps {
  nodes: Node[];
  onAdd: (node: Node) => void;
  onRemove: (id: number) => void;
}

export const NodeList: React.FC<NodeListProps> = ({ nodes, onAdd, onRemove }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newNode, setNewNode] = useState<Partial<Node>>({
    name: '',
    type: 'CUSTOMER',
    lat: 28.61,
    lon: 77.20,
    demand: 10,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNode.name?.trim()) return;

    const node: Node = {
      id: Math.max(0, ...nodes.map(n => n.id)) + 1,
      name: newNode.name.trim(),
      type: newNode.type as NodeType,
      lat: Number(newNode.lat),
      lon: Number(newNode.lon),
      demand: Number(newNode.demand),
    };

    onAdd(node);
    setNewNode({ ...newNode, name: '' });
  };

  return (
    <section className="workspace-section">
      <button className="section-toggle" type="button" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span>
          <strong>Locations</strong>
          <small>Depots, customers, and warehouses</small>
        </span>
        <span className={`toggle-icon ${!isCollapsed ? 'open' : ''}`}>v</span>
      </button>

      <div className={`collapsible-content ${isCollapsed ? 'collapsed' : ''}`}>
        <form className="node-form form-grid" onSubmit={handleSubmit}>
          <input
            placeholder="Location name"
            value={newNode.name}
            onChange={e => setNewNode({ ...newNode, name: e.target.value })}
          />
          <select
            value={newNode.type}
            onChange={e => setNewNode({ ...newNode, type: e.target.value as NodeType })}
          >
            <option value="CUSTOMER">Customer</option>
            <option value="DEPOT">Depot</option>
            <option value="WAREHOUSE">Warehouse</option>
          </select>
          <input
            type="number"
            step="0.001"
            placeholder="Latitude"
            value={newNode.lat}
            onChange={e => setNewNode({ ...newNode, lat: Number(e.target.value) })}
          />
          <input
            type="number"
            step="0.001"
            placeholder="Longitude"
            value={newNode.lon}
            onChange={e => setNewNode({ ...newNode, lon: Number(e.target.value) })}
          />
          <input
            type="number"
            placeholder="Demand"
            value={newNode.demand}
            onChange={e => setNewNode({ ...newNode, demand: Number(e.target.value) })}
          />
          <button type="submit" className="btn-primary">Add Location</button>
        </form>

        <ul className="list">
          {nodes.map((node) => (
            <li key={node.id} className="list-item">
              <div className="list-item-main">
                <strong>{node.name}</strong>
                <span>
                  {node.lat.toFixed(3)}, {node.lon.toFixed(3)} · Demand {node.demand}
                </span>
              </div>
              <div className="list-item-actions">
                <span className={`badge badge-${node.type.toLowerCase()}`}>{node.type}</span>
                <button className="btn-icon-danger" onClick={() => onRemove(node.id)} aria-label={`Remove ${node.name}`}>
                  x
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
