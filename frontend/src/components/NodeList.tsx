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
    demand: 10
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNode.name) return;
    
    const node: Node = {
      id: Math.max(0, ...nodes.map(n => n.id)) + 1,
      name: newNode.name,
      type: newNode.type as NodeType,
      lat: Number(newNode.lat),
      lon: Number(newNode.lon),
      demand: Number(newNode.demand)
    };
    
    onAdd(node);
    setNewNode({ ...newNode, name: '' });
  };

  return (
    <section style={{marginBottom: '32px'}}>
      <div className="collapsible-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h2 style={{margin: 0}}>📍 Locations</h2>
        <span className={`toggle-icon ${!isCollapsed ? 'open' : ''}`}>▼</span>
      </div>
      
      <div className={`collapsible-content ${isCollapsed ? 'collapsed' : ''}`}>
        <form className="node-form" onSubmit={handleSubmit}>
        <input 
          placeholder="Location Name" 
          value={newNode.name} 
          onChange={e => setNewNode({...newNode, name: e.target.value})} 
        />
        <select 
          value={newNode.type} 
          onChange={e => setNewNode({...newNode, type: e.target.value as NodeType})}
        >
          <option value="CUSTOMER">Customer</option>
          <option value="WAREHOUSE">Warehouse</option>
          <option value="DEPOT">Depot</option>
        </select>
        <input 
          type="number" step="0.001" placeholder="Lat" 
          value={newNode.lat} 
          onChange={e => setNewNode({...newNode, lat: Number(e.target.value)})} 
        />
        <input 
          type="number" step="0.001" placeholder="Lon" 
          value={newNode.lon} 
          onChange={e => setNewNode({...newNode, lon: Number(e.target.value)})} 
        />
        <input 
          type="number" placeholder="Demand" 
          value={newNode.demand} 
          onChange={e => setNewNode({...newNode, demand: Number(e.target.value)})} 
        />
        <button type="submit" className="btn-primary" style={{marginTop: 0}}>Add Location</button>
      </form>

      <ul className="list">
        {nodes.map((node) => (
          <li key={node.id} className="list-item">
            <div>
              <strong>{node.name}</strong>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Lat: {node.lat.toFixed(3)}, Lon: {node.lon.toFixed(3)} | Demand: {node.demand}
              </div>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
              <span className={`badge badge-${node.type.toLowerCase()}`}>
                {node.type}
              </span>
              <button className="btn-danger" onClick={() => onRemove(node.id)}>×</button>
            </div>
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
};
