from pathlib import Path
import importlib.util
import json
import math
import os
import sys


API_DIR = Path(__file__).resolve().parent
ENGINE_BUILD_DIR = API_DIR.parent / "engine" / "build"


def sanitize_data(data):
    if isinstance(data, float):
        if math.isinf(data) or math.isnan(data):
            return None
        return data
    if isinstance(data, list):
        return [sanitize_data(item) for item in data]
    if isinstance(data, dict):
        return {k: sanitize_data(v) for k, v in data.items()}
    return data


def load_logistics_engine():
    for path in (ENGINE_BUILD_DIR, API_DIR):
        path_str = str(path)
        if path.exists():
            if path_str not in sys.path:
                sys.path.append(path_str)
            if sys.platform == "win32" and sys.version_info >= (3, 8):
                os.add_dll_directory(path_str)
        for module_path in sorted(path.glob("logistics_engine*.pyd")):
            spec = importlib.util.spec_from_file_location("logistics_engine", module_path)
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                return module
    raise RuntimeError("Failed to locate logistics_engine extension module.")


def solve(payload, allow_native=True):
    try:
        if not allow_native:
            raise RuntimeError("Native solver disabled")
        logistics_engine = load_logistics_engine()
        graph = logistics_engine.Graph()
        id_map = {}
        type_map = {
            "DEPOT": logistics_engine.NodeType.DEPOT,
            "CUSTOMER": logistics_engine.NodeType.CUSTOMER,
            "WAREHOUSE": logistics_engine.NodeType.WAREHOUSE,
        }

        for n in payload["nodes"]:
            node_type = type_map.get(n["type"], logistics_engine.NodeType.CUSTOMER)
            id_map[n["id"]] = graph.add_node_values(
                n["id"],
                n["name"],
                node_type,
                n["lat"],
                n["lon"],
                n.get("demand", 0.0),
                0.0,
                0.0,
                1440.0,
                0.0,
            )

        for e in payload["edges"]:
            if e["from_node"] in id_map and e["to_node"] in id_map:
                graph.add_edge_values(
                    e["id"],
                    id_map[e["from_node"]],
                    id_map[e["to_node"]],
                    e["distance_km"],
                    e["time_min"],
                    1.0,
                    True,
                )

        prob = logistics_engine.VRPProblem()
        prob.depots = [id_map[d] for d in payload["depots"] if d in id_map]
        prob.customers = [id_map[c] for c in payload.get("customers", []) if c in id_map]
        prob.warehouses = [id_map[w] for w in payload.get("warehouses", []) if w in id_map]
        prob.return_to_depot = payload.get("return_to_depot", True)
        prob.vehicles = [
            logistics_engine.Vehicle(
                v["id"],
                v["name"],
                id_map[v["depot_id"]],
                v["capacity"],
                v["max_range_km"],
            )
            for v in payload["vehicles"]
            if v["depot_id"] in id_map
        ]

        cfg = logistics_engine.SolverConfig()
        cfg.strategy = getattr(logistics_engine.RoutingStrategy, payload["strategy"])
        cfg.verbose = False
        solver = logistics_engine.VRPSolver(graph, cfg)
        solution = solver.solve(prob)

        reverse_id_map = {v: k for k, v in id_map.items()}
        result = {
            "total_distance_km": solution.total_distance_km,
            "total_time_min": solution.total_time_min,
            "routes": [
                {
                    "vehicle_id": r.vehicle_id,
                    "stops": [reverse_id_map.get(s, s) for s in r.stops],
                    "total_distance_km": r.total_distance_km,
                    "load": r.load,
                    "feasible": r.feasible,
                }
                for r in solution.routes
            ],
            "algorithm_used": solution.algorithm_used,
            "is_complete": solution.is_complete(),
        }
        return sanitize_data(result)
    except Exception:
        return sanitize_data(_python_fallback(payload))


def _python_fallback(payload):
    nodes = {node["id"]: node for node in payload["nodes"]}
    edges = payload["edges"]
    customers = list(payload.get("customers", []))
    vehicles = list(payload.get("vehicles", []))
    depots = list(payload.get("depots", []))

    if not vehicles or not depots:
        return {
            "total_distance_km": 0.0,
            "total_time_min": 0.0,
            "routes": [],
            "algorithm_used": "Python fallback (invalid input)",
            "is_complete": False,
        }

    edge_lookup = {}
    for edge in edges:
        edge_lookup[(edge["from_node"], edge["to_node"])] = edge
        edge_lookup[(edge["to_node"], edge["from_node"])] = edge

    def edge_metrics(a, b):
        edge = edge_lookup.get((a, b))
        if edge:
            return edge["distance_km"], edge["time_min"]
        na = nodes.get(a, {})
        nb = nodes.get(b, {})
        dx = float(na.get("lat", 0.0)) - float(nb.get("lat", 0.0))
        dy = float(na.get("lon", 0.0)) - float(nb.get("lon", 0.0))
        distance = (dx * dx + dy * dy) ** 0.5 * 111.0
        return distance, distance

    remaining = customers[:]
    routes = []
    total_distance = 0.0
    total_time = 0.0

    for vehicle in vehicles:
        if not remaining:
            break
        depot_id = vehicle["depot_id"]
        capacity = float(vehicle.get("capacity", 0.0))
        load = 0.0
        current = depot_id
        stops = [depot_id]
        route_distance = 0.0
        route_time = 0.0

        while remaining:
            feasible = [cid for cid in remaining if load + float(nodes[cid].get("demand", 0.0)) <= capacity]
            if not feasible:
                break
            next_customer = min(feasible, key=lambda cid: edge_metrics(current, cid)[0])
            dist, tm = edge_metrics(current, next_customer)
            route_distance += dist
            route_time += tm
            load += float(nodes[next_customer].get("demand", 0.0))
            stops.append(next_customer)
            current = next_customer
            remaining.remove(next_customer)

        if payload.get("return_to_depot", True) and len(stops) > 1:
            dist, tm = edge_metrics(current, depot_id)
            route_distance += dist
            route_time += tm
            stops.append(depot_id)

        if len(stops) > 1:
            routes.append(
                {
                    "vehicle_id": vehicle["id"],
                    "stops": stops,
                    "total_distance_km": route_distance,
                    "load": load,
                    "feasible": True,
                }
            )
            total_distance += route_distance
            total_time += route_time

    return {
        "total_distance_km": total_distance,
        "total_time_min": total_time,
        "routes": routes,
        "algorithm_used": "Python fallback greedy",
        "is_complete": len(remaining) == 0,
    }


def main():
    payload = json.load(sys.stdin)
    allow_native = os.environ.get("LOGI_OPT_DISABLE_NATIVE_SOLVER") != "1"
    result = solve(payload, allow_native=allow_native)
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
