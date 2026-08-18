export const vehicleRouteColors = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#be123c',
  '#4d7c0f',
  '#9333ea',
  '#ea580c',
];

export function getVehicleColor(vehicleId: number) {
  const index = Math.abs(Math.trunc(vehicleId)) % vehicleRouteColors.length;
  return vehicleRouteColors[index];
}
