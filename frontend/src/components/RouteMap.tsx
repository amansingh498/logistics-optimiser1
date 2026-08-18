import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Node, Vehicle, VRPSolution } from '../types';
import { getVehicleColor } from '../utils/vehicleColors';

interface RouteMapProps {
  nodes: Node[];
  vehicles: Vehicle[];
  solution: VRPSolution | null;
}

function markerClass(type: Node['type']) {
  if (type === 'DEPOT') return 'map-marker depot';
  if (type === 'WAREHOUSE') return 'map-marker warehouse';
  return 'map-marker customer';
}

function markerIcon(node: Node) {
  return L.divIcon({
    className: markerClass(node.type),
    html: `<span>${node.type === 'DEPOT' ? 'D' : node.type === 'WAREHOUSE' ? 'W' : 'C'}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

export const RouteMap: React.FC<RouteMapProps> = ({ nodes, vehicles, solution }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView([28.6139, 77.209], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    layersRef.current = layers;

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();

    const validNodes = nodes.filter(
      (node) => Number.isFinite(node.lat) && Number.isFinite(node.lon)
    );
    const nodeById = new Map(validNodes.map((node) => [node.id, node]));
    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const bounds = L.latLngBounds([]);

    validNodes.forEach((node) => {
      const latLng: L.LatLngExpression = [node.lat, node.lon];
      bounds.extend(latLng);
      L.marker(latLng, { icon: markerIcon(node) })
        .bindPopup(`
          <strong>${node.name}</strong><br/>
          Type: ${node.type}<br/>
          Demand: ${node.demand}
        `)
        .addTo(layers);
    });

    if (solution) {
      solution.routes.forEach((route) => {
        const routePoints = route.stops
          .map((stopId) => nodeById.get(stopId))
          .filter((node): node is Node => Boolean(node))
          .map((node) => [node.lat, node.lon] as L.LatLngExpression);

        if (routePoints.length < 2) return;

        const color = getVehicleColor(route.vehicle_id);
        const vehicle = vehicleById.get(route.vehicle_id);
        L.polyline(routePoints, {
          color,
          weight: 5,
          opacity: route.feasible ? 0.9 : 0.45,
        })
          .bindPopup(`
            <strong style="color: ${color}">${vehicle?.name || `Vehicle ${route.vehicle_id}`}</strong><br/>
            Vehicle ID: ${route.vehicle_id}<br/>
            Distance: ${route.total_distance_km.toFixed(2)} km<br/>
            Load: ${route.load.toFixed(0)}<br/>
            Feasible: ${route.feasible ? 'Yes' : 'No'}
          `)
          .addTo(layers);
      });
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }

    window.setTimeout(() => map.invalidateSize(), 0);
  }, [nodes, solution]);

  return (
    <div className="route-map-shell">
      <div className="route-map-header">
        <h2>Route Map</h2>
        <div className="route-map-legend">
          <span><i className="legend-dot depot"></i>Depot</span>
          <span><i className="legend-dot warehouse"></i>Warehouse</span>
          <span><i className="legend-dot customer"></i>Customer</span>
          {solution?.routes.map((route) => {
            const vehicle = vehicles.find((item) => item.id === route.vehicle_id);
            return (
              <span key={route.vehicle_id}>
                <i className="legend-line" style={{ background: getVehicleColor(route.vehicle_id) }}></i>
                {vehicle?.name || `Vehicle ${route.vehicle_id}`}
              </span>
            );
          })}
        </div>
      </div>
      <div ref={containerRef} className="route-map"></div>
    </div>
  );
};
