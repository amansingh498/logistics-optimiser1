from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import importlib.util
import os
import sys
import json
import time
import math
import subprocess

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

# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Hello"}

@app.get("/health")
def health():
    engine_status = "native" if logistics_engine is not None else "python-fallback"
    return {"status": "ok", "engine": engine_status}

@app.post("/solve")
def solve_vrp(req: SolverRequest):
    return _solve_isolated(req, "GREEDY_2OPT")

@app.post("/compare")
def compare_vrp(req: SolverRequest):
    res_greedy = _solve_isolated(req, "GREEDY_ONLY")
    res_opt = _solve_isolated(req, "GREEDY_2OPT")
    return [res_greedy, res_opt]


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
    db = SessionLocal()
    try:
        config_data = {"nodes": [n.dict() for n in req.nodes], "vehicles": [v.dict() for v in req.vehicles]}
        # Sanitize to prevent JSON encoding errors if inf/nan exist
        sanitized_data = sanitize_data(config_data)
        
        db_config = db.query(SavedConfig).filter(SavedConfig.name == req.name).first()
        if db_config:
            db_config.data = json.dumps(sanitized_data)
        else:
            db_config = SavedConfig(name=req.name, data=json.dumps(sanitized_data))
            db.add(db_config)
        db.commit()
        return {"message": f"Config '{req.name}' saved successfully"}
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Save config failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/load-config/{name}")
def load_config(name: str):
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
        configs = db.query(SavedConfig).all()
        return [c.name for c in configs]
    finally:
        db.close()
