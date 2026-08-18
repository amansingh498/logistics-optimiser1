from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import base64
import csv
import importlib.util
import io
import os
import re
import sys
import json
import time
import math
import subprocess
import zipfile
import xml.etree.ElementTree as ET

def sanitize_data(data: Any) -> Any:
    """Recursively replace non-JSON-compliant float values (inf, nan) with None."""
    if isinstance(data, float):
        if math.isinf(data) or math.isnan(data):
            return None
        return data
    elif isinstance(data, list):
        return [sanitize_data(item) for item in data]
    elif isinstance(data, dict):
        return {k: sanitize_data(v) for k, v in data.items()}
    return data

# DB Imports
from sqlalchemy import create_engine, Column, Integer, String, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

def _parse_cors_origins() -> list[str]:
    raw_origins = os.environ.get("CORS_ORIGINS", "*").strip()
    if not raw_origins or raw_origins == "*":
        return ["*"]
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

# ─── Setup Native Paths ───────────────────────────────────────────────────────
API_DIR = Path(__file__).resolve().parent
ENGINE_BUILD_DIR = API_DIR.parent / "engine" / "build"

def _configure_native_paths() -> None:
    for path in (ENGINE_BUILD_DIR, API_DIR):
        path_str = str(path)
        if path.exists() and path_str not in sys.path:
            sys.path.append(path_str)
        if sys.platform == "win32" and sys.version_info >= (3, 8) and path.exists():
            os.add_dll_directory(path_str)

_configure_native_paths()


def _graph_add_node(graph, node_id: int, name: str, node_type, lat: float, lon: float, demand: float) -> int:
    if hasattr(graph, "add_node_values"):
        return graph.add_node_values(
            node_id,
            name,
            node_type,
            lat,
            lon,
            demand,
            0.0,
            0.0,
            1440.0,
            0.0,
        )
    return graph.add_node(
        logistics_engine.Node(
            node_id,
            name,
            node_type,
            lat,
            lon,
            demand,
            0.0,
            0.0,
            1440.0,
            0.0,
        )
    )


def _graph_add_edge(graph, edge_id: int, from_node: int, to_node: int, distance_km: float, time_min: float) -> None:
    if hasattr(graph, "add_edge_values"):
        graph.add_edge_values(edge_id, from_node, to_node, distance_km, time_min, 1.0, True)
        return
    graph.add_edge(
        logistics_engine.Edge(
            edge_id,
            from_node,
            to_node,
            distance_km,
            time_min,
            1.0,
            True,
        )
    )


def _model_dump(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()

def _load_logistics_engine():
    for directory in (ENGINE_BUILD_DIR, API_DIR):
        for module_path in sorted(directory.glob("logistics_engine*.pyd")):
            spec = importlib.util.spec_from_file_location("logistics_engine", module_path)
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                return module
    raise RuntimeError("Failed to locate logistics_engine extension module.")


try:
    logistics_engine = _load_logistics_engine()
except Exception:
    logistics_engine = None

# ─── Database Configuration (SQLite) ──────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./logistics.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class SavedConfig(Base):
    __tablename__ = "configs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    data = Column(Text)

Base.metadata.create_all(bind=engine)

# ─── App Setup ────────────────────────────────────────────────────────────────
app = FastAPI(title="Logistics Optimiser API")
cors_origins = _parse_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Models ─────────────────────────────────────────────────────────

class NodeModel(BaseModel):
    id: int
    name: str
    type: str
    lat: float
    lon: float
    demand: float = 0.0

class EdgeModel(BaseModel):
    id: int
    from_node: int
    to_node: int
    distance_km: float
    time_min: float

class VehicleModel(BaseModel):
    id: int
    name: str
    depot_id: int
    capacity: float
    max_range_km: float

class SolverRequest(BaseModel):
    nodes: List[NodeModel]
    edges: List[EdgeModel]
    depots: List[int]
    customers: List[int]
    warehouses: List[int]
    vehicles: List[VehicleModel]
    return_to_depot: bool = True
    w_distance: float = 1.0
    w_time: float = 0.5
    w_cost: float = 0.3

class ConfigSaveRequest(BaseModel):
    name: str
    nodes: List[NodeModel]
    vehicles: List[VehicleModel]

class ScenarioValidationRequest(BaseModel):
    nodes: List[NodeModel]
    vehicles: List[VehicleModel]

class ImportFileModel(BaseModel):
    filename: str
    content_base64: str

class ImportDataRequest(BaseModel):
    depots: Optional[ImportFileModel] = None
    orders: Optional[ImportFileModel] = None
    vehicles: Optional[ImportFileModel] = None

def _normalize_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")

def _first_text(row: Dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        value = row.get(_normalize_key(key))
        if value is not None and str(value).strip() != "":
            return str(value).strip()
    return None

def _optional_float(value: Any) -> Optional[float]:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(str(value).strip())
    except ValueError:
        return None

def _required_float(row: Dict[str, Any], keys: List[str], section: str, row_number: int) -> Optional[float]:
    value = _optional_float(_first_text(row, *keys))
    return value

def _optional_int(value: Any) -> Optional[int]:
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(float(str(value).strip()))
    except ValueError:
        return None

def _parse_import_file(file: ImportFileModel) -> List[Dict[str, str]]:
    try:
        raw = base64.b64decode(file.content_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{file.filename}: invalid base64 content") from exc

    suffix = Path(file.filename).suffix.lower()
    if suffix == ".csv":
        return _parse_csv_rows(raw)
    if suffix == ".xlsx":
        return _parse_xlsx_rows(raw)
    raise HTTPException(status_code=400, detail=f"{file.filename}: only .csv and .xlsx files are supported")

def _parse_csv_rows(raw: bytes) -> List[Dict[str, str]]:
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    return [
        {_normalize_key(key): (value or "").strip() for key, value in row.items() if key}
        for row in reader
    ]

def _parse_xlsx_rows(raw: bytes) -> List[Dict[str, str]]:
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            shared_strings = _xlsx_shared_strings(archive)
            sheet_path = _xlsx_first_sheet_path(archive)
            cells = _xlsx_sheet_rows(archive, sheet_path, shared_strings)
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid .xlsx file") from exc

    if not cells:
        return []

    headers = [_normalize_key(value) for value in cells[0]]
    rows: List[Dict[str, str]] = []
    for values in cells[1:]:
        row = {}
        for index, header in enumerate(headers):
            if header:
                row[header] = values[index].strip() if index < len(values) else ""
        if any(row.values()):
            rows.append(row)
    return rows

def _xlsx_shared_strings(archive: zipfile.ZipFile) -> List[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    namespace = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    strings = []
    for item in root.findall("a:si", namespace):
        strings.append("".join(text.text or "" for text in item.findall(".//a:t", namespace)))
    return strings

def _xlsx_first_sheet_path(archive: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in relationships
        if "Id" in rel.attrib and "Target" in rel.attrib
    }
    sheet = next(iter(workbook.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet")), None)
    if sheet is None:
        raise HTTPException(status_code=400, detail="Workbook does not contain a sheet")
    rel_id = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    target = rel_map.get(rel_id or "", "worksheets/sheet1.xml")
    return "xl/" + target.lstrip("/")

def _xlsx_sheet_rows(archive: zipfile.ZipFile, sheet_path: str, shared_strings: List[str]) -> List[List[str]]:
    root = ET.fromstring(archive.read(sheet_path))
    namespace = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows: List[List[str]] = []
    for row in root.findall(".//a:sheetData/a:row", namespace):
        values: Dict[int, str] = {}
        for cell in row.findall("a:c", namespace):
            ref = cell.attrib.get("r", "")
            column = _xlsx_column_index(ref)
            values[column] = _xlsx_cell_value(cell, shared_strings, namespace)
        if values:
            rows.append([values.get(index, "") for index in range(max(values) + 1)])
    return rows

def _xlsx_column_index(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref.upper())
    column = 0
    for char in letters.group(0) if letters else "A":
        column = column * 26 + ord(char) - ord("A") + 1
    return column - 1

def _xlsx_cell_value(cell: ET.Element, shared_strings: List[str], namespace: Dict[str, str]) -> str:
    if cell.attrib.get("t") == "inlineStr":
        return "".join(text.text or "" for text in cell.findall(".//a:t", namespace))
    value_node = cell.find("a:v", namespace)
    if value_node is None or value_node.text is None:
        return ""
    value = value_node.text
    if cell.attrib.get("t") == "s":
        index = _optional_int(value)
        return shared_strings[index] if index is not None and index < len(shared_strings) else ""
    return value

def _validate_scenario(nodes: List[NodeModel], vehicles: List[VehicleModel]) -> Dict[str, Any]:
    errors: List[str] = []
    warnings: List[str] = []
    node_ids: set[int] = set()
    duplicate_node_ids: set[int] = set()
    vehicle_ids: set[int] = set()
    duplicate_vehicle_ids: set[int] = set()

    for node in nodes:
        if node.id in node_ids:
            duplicate_node_ids.add(node.id)
        node_ids.add(node.id)

        if not node.name.strip():
            errors.append(f"Location {node.id}: name is required.")
        if node.type not in {"DEPOT", "CUSTOMER", "WAREHOUSE"}:
            errors.append(f"Location {node.id}: type must be DEPOT, CUSTOMER, or WAREHOUSE.")
        if not math.isfinite(node.lat) or not -90 <= node.lat <= 90:
            errors.append(f"Location {node.id}: latitude must be between -90 and 90.")
        if not math.isfinite(node.lon) or not -180 <= node.lon <= 180:
            errors.append(f"Location {node.id}: longitude must be between -180 and 180.")
        if node.type == "CUSTOMER" and node.demand <= 0:
            warnings.append(f"Customer {node.name}: demand is zero or negative.")
        if node.type != "CUSTOMER" and node.demand != 0:
            warnings.append(f"{node.name}: demand is ignored unless the location is a customer.")

    for node_id in sorted(duplicate_node_ids):
        errors.append(f"Duplicate location id {node_id}.")

    depots = [node for node in nodes if node.type == "DEPOT"]
    customers = [node for node in nodes if node.type == "CUSTOMER"]
    depot_ids = {node.id for node in depots}

    if not depots:
        errors.append("At least one depot is required.")
    if not customers:
        errors.append("At least one customer/order is required.")
    if not vehicles:
        errors.append("At least one vehicle is required.")

    for vehicle in vehicles:
        if vehicle.id in vehicle_ids:
            duplicate_vehicle_ids.add(vehicle.id)
        vehicle_ids.add(vehicle.id)

        if not vehicle.name.strip():
            errors.append(f"Vehicle {vehicle.id}: name is required.")
        if vehicle.depot_id not in node_ids:
            errors.append(f"Vehicle {vehicle.name}: depot_id {vehicle.depot_id} does not exist.")
        elif vehicle.depot_id not in depot_ids:
            errors.append(f"Vehicle {vehicle.name}: depot_id {vehicle.depot_id} is not a DEPOT location.")
        if not math.isfinite(vehicle.capacity) or vehicle.capacity <= 0:
            errors.append(f"Vehicle {vehicle.name}: capacity must be greater than zero.")
        if not math.isfinite(vehicle.max_range_km) or vehicle.max_range_km <= 0:
            errors.append(f"Vehicle {vehicle.name}: max_range_km must be greater than zero.")

    for vehicle_id in sorted(duplicate_vehicle_ids):
        errors.append(f"Duplicate vehicle id {vehicle_id}.")

    total_demand = sum(max(0.0, node.demand) for node in customers)
    total_capacity = sum(max(0.0, vehicle.capacity) for vehicle in vehicles)
    max_vehicle_capacity = max((vehicle.capacity for vehicle in vehicles), default=0.0)
    oversized_orders = [node for node in customers if node.demand > max_vehicle_capacity]

    if total_demand > 0 and total_capacity > 0 and total_demand > total_capacity:
        warnings.append(
            f"Total customer demand ({total_demand:.0f}) exceeds one-trip fleet capacity ({total_capacity:.0f})."
        )
    for node in oversized_orders:
        warnings.append(
            f"Customer {node.name}: demand ({node.demand:.0f}) exceeds the largest vehicle capacity ({max_vehicle_capacity:.0f})."
        )

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "summary": {
            "locations": len(nodes),
            "depots": len(depots),
            "orders": len(customers),
            "warehouses": len([node for node in nodes if node.type == "WAREHOUSE"]),
            "vehicles": len(vehicles),
            "total_demand": total_demand,
            "total_capacity": total_capacity,
        },
    }

# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Hello"}

@app.get("/health")
def health():
    engine_status = "native" if logistics_engine is not None else "python-fallback"
    return {"status": "ok", "engine": engine_status}

@app.post("/validate-scenario")
def validate_scenario(req: ScenarioValidationRequest):
    return _validate_scenario(req.nodes, req.vehicles)

@app.post("/solve")
def solve_vrp(req: SolverRequest):
    validation = _validate_scenario(req.nodes, req.vehicles)
    if not validation["is_valid"]:
        raise HTTPException(
            status_code=400,
            detail={"message": "Scenario validation failed.", "errors": validation["errors"]},
        )
    return _solve_isolated(req, "GREEDY_2OPT")

@app.post("/compare")
def compare_vrp(req: SolverRequest):
    validation = _validate_scenario(req.nodes, req.vehicles)
    if not validation["is_valid"]:
        raise HTTPException(
            status_code=400,
            detail={"message": "Scenario validation failed.", "errors": validation["errors"]},
        )
    res_greedy = _solve_isolated(req, "GREEDY_ONLY")
    res_opt = _solve_isolated(req, "GREEDY_2OPT")
    return [res_greedy, res_opt]

@app.post("/import-data")
def import_data(req: ImportDataRequest):
    warnings: List[str] = []
    nodes: List[Dict[str, Any]] = []
    vehicles: List[Dict[str, Any]] = []
    used_node_ids: set[int] = set()
    next_node_id = 0

    def reserve_node_id(raw_id: Any, source: str) -> int:
        nonlocal next_node_id
        node_id = _optional_int(raw_id)
        if node_id is None or node_id in used_node_ids:
            if node_id in used_node_ids:
                warnings.append(f"{source}: duplicate location id {node_id}; assigned a new id.")
            while next_node_id in used_node_ids:
                next_node_id += 1
            node_id = next_node_id
        used_node_ids.add(node_id)
        next_node_id = max(next_node_id, node_id + 1)
        return node_id

    depot_name_to_id: Dict[str, int] = {}

    if req.depots:
        for index, row in enumerate(_parse_import_file(req.depots), start=2):
            name = _first_text(row, "name", "depot_name", "depot", "location_name") or f"Depot {index - 1}"
            lat = _required_float(row, ["lat", "latitude"], "depots", index)
            lon = _required_float(row, ["lon", "lng", "longitude"], "depots", index)
            if lat is None or lon is None:
                warnings.append(f"depots row {index}: skipped because lat/lon is missing or invalid.")
                continue
            node = {
                "id": reserve_node_id(_first_text(row, "id", "depot_id", "location_id"), "depots"),
                "name": name,
                "type": "DEPOT",
                "lat": lat,
                "lon": lon,
                "demand": 0.0,
            }
            nodes.append(node)
            depot_name_to_id[_normalize_key(name)] = node["id"]

    if req.orders:
        for index, row in enumerate(_parse_import_file(req.orders), start=2):
            name = _first_text(row, "name", "order_name", "customer_name", "customer", "location_name") or f"Order {index - 1}"
            lat = _required_float(row, ["lat", "latitude"], "orders", index)
            lon = _required_float(row, ["lon", "lng", "longitude"], "orders", index)
            if lat is None or lon is None:
                warnings.append(f"orders row {index}: skipped because lat/lon is missing or invalid.")
                continue
            nodes.append({
                "id": reserve_node_id(_first_text(row, "id", "order_id", "customer_id", "location_id"), "orders"),
                "name": name,
                "type": "CUSTOMER",
                "lat": lat,
                "lon": lon,
                "demand": _optional_float(_first_text(row, "demand", "quantity", "units", "weight")) or 0.0,
            })

    used_vehicle_ids: set[int] = set()
    next_vehicle_id = 0

    def reserve_vehicle_id(raw_id: Any) -> int:
        nonlocal next_vehicle_id
        vehicle_id = _optional_int(raw_id)
        if vehicle_id is None or vehicle_id in used_vehicle_ids:
            while next_vehicle_id in used_vehicle_ids:
                next_vehicle_id += 1
            vehicle_id = next_vehicle_id
        used_vehicle_ids.add(vehicle_id)
        next_vehicle_id = max(next_vehicle_id, vehicle_id + 1)
        return vehicle_id

    depot_ids = [n["id"] for n in nodes if n["type"] == "DEPOT"]
    if req.vehicles:
        for index, row in enumerate(_parse_import_file(req.vehicles), start=2):
            depot_id = _optional_int(_first_text(row, "depot_id", "start_depot_id", "home_depot_id"))
            depot_name = _first_text(row, "depot_name", "depot", "start_depot", "home_depot")
            if depot_id is None and depot_name:
                depot_id = depot_name_to_id.get(_normalize_key(depot_name))
            if depot_id is None and depot_ids:
                depot_id = depot_ids[0]
                warnings.append(f"vehicles row {index}: depot was not provided; assigned first imported depot.")
            if depot_id is None:
                warnings.append(f"vehicles row {index}: skipped because no depot is available.")
                continue
            if depot_ids and depot_id not in depot_ids:
                warnings.append(f"vehicles row {index}: depot_id {depot_id} does not match an imported depot.")
            vehicles.append({
                "id": reserve_vehicle_id(_first_text(row, "id", "vehicle_id")),
                "name": _first_text(row, "name", "vehicle_name", "vehicle") or f"Vehicle {index - 1}",
                "depot_id": depot_id,
                "capacity": _optional_float(_first_text(row, "capacity", "max_capacity", "payload")) or 0.0,
                "max_range_km": _optional_float(_first_text(row, "max_range_km", "range_km", "max_range", "range")) or 9999.0,
            })

    if not nodes and not vehicles:
        raise HTTPException(status_code=400, detail="No valid depots, orders, or vehicles were found in the uploaded files.")

    return {"nodes": nodes, "vehicles": vehicles, "warnings": warnings}


def _solve_isolated(req: SolverRequest, strategy_name: str):
    start_time = time.time()
    payload = _model_dump(req)
    payload["strategy"] = strategy_name
    worker_path = API_DIR / "solver_worker.py"

    try:
        result = _run_solver_worker(payload, worker_path, allow_native=True)
    except HTTPException:
        result = _run_solver_worker(payload, worker_path, allow_native=False)

    result["execution_time_ms"] = (time.time() - start_time) * 1000
    return sanitize_data(result)


def _run_solver_worker(payload: Dict[str, Any], worker_path: Path, allow_native: bool) -> Dict[str, Any]:
    env = os.environ.copy()
    if not allow_native:
        env["LOGI_OPT_DISABLE_NATIVE_SOLVER"] = "1"

    try:
        completed = subprocess.run(
            [sys.executable, str(worker_path)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            check=False,
            timeout=30,
            cwd=str(API_DIR),
            env=env,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Solver worker timed out") from exc

    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        detail = stderr or "Solver worker crashed"
        raise HTTPException(status_code=500, detail=detail)

    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Solver worker returned invalid JSON") from exc

def _solve_internal(req: SolverRequest, strategy: Any):
    start_time = time.time()
    try:
        # 1. Build the C++ Graph
        graph = logistics_engine.Graph()
        id_map = {}
        type_map = {
            "DEPOT": logistics_engine.NodeType.DEPOT,
            "CUSTOMER": logistics_engine.NodeType.CUSTOMER,
            "WAREHOUSE": logistics_engine.NodeType.WAREHOUSE
        }

        for n in req.nodes:
            id_map[n.id] = _graph_add_node(
                graph,
                n.id,
                n.name,
                type_map.get(n.type, logistics_engine.NodeType.CUSTOMER),
                n.lat,
                n.lon,
                n.demand,
            )

        for e in req.edges:
            if e.from_node in id_map and e.to_node in id_map:
                _graph_add_edge(
                    graph,
                    e.id,
                    id_map[e.from_node],
                    id_map[e.to_node],
                    e.distance_km,
                    e.time_min,
                )

        # 2. Setup Problem
        prob = logistics_engine.VRPProblem()
        prob.depots = [id_map[d] for d in req.depots if d in id_map]
        prob.customers = [id_map[c] for c in getattr(req, 'customers', []) if c in id_map]
        prob.warehouses = [id_map[w] for w in getattr(req, 'warehouses', []) if w in id_map]
        prob.return_to_depot = req.return_to_depot
        
        prob.vehicles = [
            logistics_engine.Vehicle(
                v.id,
                v.name,
                id_map[v.depot_id],
                v.capacity,
                v.max_range_km,
            )
            for v in req.vehicles
            if v.depot_id in id_map
        ]

        # 3. Solve
        cfg = logistics_engine.SolverConfig()
        cfg.strategy = strategy
        cfg.verbose = True
        solver = logistics_engine.VRPSolver(graph, cfg)
        solution = solver.solve(prob)
        
        reverse_id_map = {v: k for k, v in id_map.items()}
        elapsed = (time.time() - start_time) * 1000
        
        result = {
            "total_distance_km": solution.total_distance_km,
            "total_time_min": solution.total_time_min,
            "execution_time_ms": elapsed,
            "routes": [{
                "vehicle_id": r.vehicle_id, 
                "stops": [reverse_id_map.get(s, s) for s in r.stops], 
                "total_distance_km": r.total_distance_km, 
                "load": r.load,
                "feasible": r.feasible
            } for r in solution.routes],
            "algorithm_used": solution.algorithm_used,
            "is_complete": solution.is_complete()
        }
        return sanitize_data(result)
    except Exception as e:
        print(f"[ERROR] Solver failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── DB Endpoints ────────────────────────────────────────────────────────────

@app.post("/save-config")
def save_config(req: ConfigSaveRequest):
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Scenario name is required")

    db = SessionLocal()
    try:
        config_data = {"nodes": [n.dict() for n in req.nodes], "vehicles": [v.dict() for v in req.vehicles]}
        # Sanitize to prevent JSON encoding errors if inf/nan exist
        sanitized_data = sanitize_data(config_data)
        
        db_config = db.query(SavedConfig).filter(SavedConfig.name == name).first()
        if db_config:
            db_config.data = json.dumps(sanitized_data)
        else:
            db_config = SavedConfig(name=name, data=json.dumps(sanitized_data))
            db.add(db_config)
        db.commit()
        return {"message": f"Config '{name}' saved successfully"}
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Save config failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/load-config/{name:path}")
def load_config(name: str):
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Scenario name is required")

    db = SessionLocal()
    try:
        db_config = db.query(SavedConfig).filter(SavedConfig.name == name).first()
        if not db_config:
            raise HTTPException(status_code=404, detail="Config not found")
        return json.loads(db_config.data)
    finally:
        db.close()

@app.get("/list-configs")
def list_configs():
    db = SessionLocal()
    try:
        configs = db.query(SavedConfig).order_by(SavedConfig.name.asc()).all()
        return [c.name for c in configs]
    finally:
        db.close()
