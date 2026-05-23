import React, { useEffect, useRef, useState } from 'react';
import { Node, VRPSolution } from '../types';

interface RouteMapProps {
  nodes: Node[];
  solution: VRPSolution | null;
}

export const RouteMap: React.FC<RouteMapProps> = ({ nodes, solution }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (nodes.length === 0) return;

    ctx.save();
    // Apply pan and zoom
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    // 1. Find bounds for scaling
    const lats = nodes.map(n => n.lat);
    const lons = nodes.map(n => n.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const padding = 40;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;

    const scaleX = (lon: number) => padding + (maxLon === minLon ? width / 2 : (lon - minLon) / (maxLon - minLon) * width);
    const scaleY = (lat: number) => canvas.height - (padding + (maxLat === minLat ? height / 2 : (lat - minLat) / (maxLat - minLat) * height));

    // 2. Draw Edges (Routes)
    if (solution) {
      const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
      solution.routes.forEach((route, idx) => {
        ctx.beginPath();
        ctx.strokeStyle = colors[idx % colors.length];
        ctx.lineWidth = 3 / transform.k; // Keep line width consistent visually
        ctx.setLineDash([]);
        
        for (let i = 0; i < route.stops.length - 1; i++) {
          const from = nodes.find(n => n.id === route.stops[i]);
          const to = nodes.find(n => n.id === route.stops[i+1]);
          if (from && to) {
            ctx.moveTo(scaleX(from.lon), scaleY(from.lat));
            ctx.lineTo(scaleX(to.lon), scaleY(to.lat));
          }
        }
        ctx.stroke();
      });
    }

    // 3. Draw Nodes
    nodes.forEach(node => {
      const x = scaleX(node.lon);
      const y = scaleY(node.lat);

      ctx.beginPath();
      ctx.arc(x, y, 6 / transform.k, 0, Math.PI * 2);
      
      if (node.type === 'DEPOT') ctx.fillStyle = '#1e40af';
      else if (node.type === 'WAREHOUSE') ctx.fillStyle = '#166534';
      else ctx.fillStyle = '#92400e';
      
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2 / transform.k;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#1e293b';
      ctx.font = `${10 / transform.k}px Inter`;
      ctx.fillText(node.name, x + 8 / transform.k, y + 4 / transform.k);
    });

    ctx.restore();

    // 4. Draw Scale Bar (Fixed Position)
    const rangeLon = maxLon - minLon;
    if (rangeLon > 0) {
      const pixelsPerKm = width / (rangeLon * 111);
      const currentPixelsPerKm = pixelsPerKm * transform.k;
      
      // Target around 80-100px for the scale bar
      const targetKm = 80 / currentPixelsPerKm;
      const magnitude = Math.pow(10, Math.floor(Math.log10(targetKm)));
      const firstDigit = targetKm / magnitude;
      let niceKm = magnitude;
      if (firstDigit >= 5) niceKm = 5 * magnitude;
      else if (firstDigit >= 2) niceKm = 2 * magnitude;
      
      const scaleBarWidth = niceKm * currentPixelsPerKm;
      
      const sx = 20;
      const sy = canvas.height - 25;
      
      ctx.beginPath();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.moveTo(sx, sy - 5);
      ctx.lineTo(sx, sy);
      ctx.lineTo(sx + scaleBarWidth, sy);
      ctx.lineTo(sx + scaleBarWidth, sy - 5);
      ctx.stroke();
      
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 10px Inter';
      ctx.textAlign = 'left';
      ctx.fillText(`${niceKm} km`, sx + 4, sy - 8);
    }

  }, [nodes, solution, transform]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setTransform(prev => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    }));
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    const zoomSpeed = 0.001;
    const delta = -e.deltaY * zoomSpeed;
    const newK = Math.min(Math.max(transform.k + delta, 0.5), 5);
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const mouseXInWorld = (mouseX - transform.x) / transform.k;
    const mouseYInWorld = (mouseY - transform.y) / transform.k;
    
    setTransform({
      k: newK,
      x: mouseX - mouseXInWorld * newK,
      y: mouseY - mouseYInWorld * newK
    });
  };

  const resetView = () => setTransform({ x: 0, y: 0, k: 1 });

  return (
    <div className="card" style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '800px', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ margin: 0 }}>🗺️ Network Topology & Optimized Paths</h2>
        <button onClick={resetView} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Reset View</button>
      </div>
      <div 
        style={{ 
          width: '100%', 
          maxWidth: '800px', 
          overflow: 'hidden', 
          cursor: isDragging ? 'grabbing' : 'grab',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          background: '#f8fafc'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={400} 
          style={{ display: 'block', width: '100%' }}
        />
      </div>
      <div style={{ marginTop: '12px', display: 'flex', gap: '20px', fontSize: '0.8rem' }}>
        <span><span style={{ color: '#1e40af' }}>●</span> Depot</span>
        <span><span style={{ color: '#166534' }}>●</span> Warehouse</span>
        <span><span style={{ color: '#92400e' }}>●</span> Customer</span>
        <span style={{ color: '#64748b' }}> (Scroll to zoom, drag to pan)</span>
      </div>
    </div>
  );
};
