#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <logistics/graph.hpp>
#include <logistics/dijkstra.hpp>
#include <logistics/vrp.hpp>
#include <logistics/vrp_solver.hpp>

namespace py = pybind11;
using namespace logistics;

PYBIND11_MODULE(logistics_engine, m) {
    m.doc() = "Logistics Optimization Engine Bindings";

    // ─── Enums ──────────────────────────────────────────────────────────────
    py::enum_<NodeType>(m, "NodeType")
        .value("DEPOT", NodeType::DEPOT)
        .value("CUSTOMER", NodeType::CUSTOMER)
        .value("WAREHOUSE", NodeType::WAREHOUSE)
        .export_values();

    // ─── Core Structs ───────────────────────────────────────────────────────
    py::class_<Node>(m, "Node")
        .def(py::init<NodeId, std::string, NodeType, double, double, double>(),
             py::arg("id"), py::arg("name"), py::arg("type"), py::arg("lat"), py::arg("lon"),
             py::arg("demand") = 0.0)
        .def(py::init<NodeId, std::string, NodeType, double, double, double, double, double, double, double>(),
             py::arg("id"), py::arg("name"), py::arg("type"), py::arg("lat"), py::arg("lon"),
             py::arg("demand"), py::arg("supply"),
             py::arg("time_window_open"), py::arg("time_window_close"),
             py::arg("service_time_min"))
        .def_readwrite("id", &Node::id)
        .def_readwrite("name", &Node::name)
        .def_readwrite("type", &Node::type)
        .def_readwrite("lat", &Node::lat)
        .def_readwrite("lon", &Node::lon)
        .def_readwrite("demand", &Node::demand)
        .def_readwrite("supply", &Node::supply)
        .def_readwrite("time_window_open", &Node::time_window_open)
        .def_readwrite("time_window_close", &Node::time_window_close)
        .def_readwrite("service_time_min", &Node::service_time_min);

    py::class_<Edge>(m, "Edge")
        .def(py::init<EdgeId, NodeId, NodeId, double, double, double, bool>(),
             py::arg("id"), py::arg("from"), py::arg("to"), py::arg("distance_km"),
             py::arg("time_min"), py::arg("cost_factor") = 1.0, py::arg("bidirectional") = true)
        .def_readwrite("id", &Edge::id)
        .def_readwrite("from", &Edge::from)
        .def_readwrite("to", &Edge::to)
        .def_readwrite("distance_km", &Edge::distance_km)
        .def_readwrite("time_min", &Edge::time_min)
        .def_readwrite("cost_factor", &Edge::cost_factor)
        .def_readwrite("bidirectional", &Edge::bidirectional);

    // ─── Graph ──────────────────────────────────────────────────────────────
    py::class_<Graph>(m, "Graph")
        .def(py::init<>())
        .def("add_node", &Graph::add_node)
        .def("add_edge", &Graph::add_edge)
        .def(
            "add_node_values",
            [](Graph& g,
               NodeId id,
               const std::string& name,
               NodeType type,
               double lat,
               double lon,
               double demand,
               double supply,
               double time_window_open,
               double time_window_close,
               double service_time_min) {
                Node n{
                    id,
                    name,
                    type,
                    lat,
                    lon,
                    demand,
                    supply,
                    time_window_open,
                    time_window_close,
                    service_time_min,
                };
                return g.add_node(std::move(n));
            },
            py::arg("id"),
            py::arg("name"),
            py::arg("type"),
            py::arg("lat"),
            py::arg("lon"),
            py::arg("demand") = 0.0,
            py::arg("supply") = 0.0,
            py::arg("time_window_open") = 0.0,
            py::arg("time_window_close") = 1440.0,
            py::arg("service_time_min") = 0.0)
        .def(
            "add_edge_values",
            [](Graph& g,
               EdgeId id,
               NodeId from,
               NodeId to,
               double distance_km,
               double time_min,
               double cost_factor,
               bool bidirectional) {
                Edge e{
                    id,
                    from,
                    to,
                    distance_km,
                    time_min,
                    cost_factor,
                    bidirectional,
                };
                return g.add_edge(std::move(e));
            },
            py::arg("id"),
            py::arg("from"),
            py::arg("to"),
            py::arg("distance_km"),
            py::arg("time_min"),
            py::arg("cost_factor") = 1.0,
            py::arg("bidirectional") = true)
        .def("node_count", &Graph::node_count)
        .def("edge_count", &Graph::edge_count)
        .def("all_nodes", &Graph::all_nodes)
        .def("all_edges", &Graph::all_edges);

    // ─── VRP Structs ────────────────────────────────────────────────────────
    py::class_<Vehicle>(m, "Vehicle")
        .def(py::init<VehicleId, std::string, NodeId, double, double, double, double>(),
             py::arg("id"), py::arg("name"), py::arg("depot_id"), py::arg("capacity"),
             py::arg("max_range_km"), py::arg("speed_kmh") = 60.0, py::arg("cost_per_km") = 1.0)
        .def_readwrite("id", &Vehicle::id)
        .def_readwrite("name", &Vehicle::name)
        .def_readwrite("depot_id", &Vehicle::depot_id)
        .def_readwrite("capacity", &Vehicle::capacity)
        .def_readwrite("max_range_km", &Vehicle::max_range_km)
        .def_readwrite("speed_kmh", &Vehicle::speed_kmh)
        .def_readwrite("cost_per_km", &Vehicle::cost_per_km);

    py::class_<PathWeights>(m, "PathWeights")
        .def(py::init<double, double, double>(),
             py::arg("w_distance") = 1.0, py::arg("w_time") = 0.5, py::arg("w_cost") = 0.3)
        .def_readwrite("w_distance", &PathWeights::w_distance)
        .def_readwrite("w_time", &PathWeights::w_time)
        .def_readwrite("w_cost", &PathWeights::w_cost);

    py::class_<VRPProblem>(m, "VRPProblem")
        .def(py::init<>())
        .def_readwrite("depots", &VRPProblem::depots)
        .def_readwrite("customers", &VRPProblem::customers)
        .def_readwrite("warehouses", &VRPProblem::warehouses)
        .def_readwrite("vehicles", &VRPProblem::vehicles)
        .def_readwrite("path_weights", &VRPProblem::path_weights)
        .def_readwrite("return_to_depot", &VRPProblem::return_to_depot);

    py::class_<Route>(m, "Route")
        .def_readwrite("vehicle_id", &Route::vehicle_id)
        .def_readwrite("stops", &Route::stops)
        .def_readwrite("total_distance_km", &Route::total_distance_km)
        .def_readwrite("total_time_min", &Route::total_time_min)
        .def_readwrite("total_cost", &Route::total_cost)
        .def_readwrite("load", &Route::load)
        .def_readwrite("feasible", &Route::feasible);

    py::class_<VRPSolution>(m, "VRPSolution")
        .def_readwrite("routes", &VRPSolution::routes)
        .def_readwrite("total_distance_km", &VRPSolution::total_distance_km)
        .def_readwrite("total_time_min", &VRPSolution::total_time_min)
        .def_readwrite("total_cost", &VRPSolution::total_cost)
        .def_readwrite("unserved_customers", &VRPSolution::unserved_customers)
        .def_readwrite("algorithm_used", &VRPSolution::algorithm_used)
        .def("is_complete", &VRPSolution::is_complete);

    // ─── Solver ─────────────────────────────────────────────────────────────
    py::enum_<RoutingStrategy>(m, "RoutingStrategy")
        .value("GREEDY_ONLY", RoutingStrategy::GREEDY_ONLY)
        .value("GREEDY_2OPT", RoutingStrategy::GREEDY_2OPT)
        .export_values();

    py::class_<SolverConfig>(m, "SolverConfig")
        .def(py::init<>())
        .def_readwrite("strategy", &SolverConfig::strategy)
        .def_readwrite("max_2opt_iterations", &SolverConfig::max_2opt_iterations)
        .def_readwrite("enable_load_balance", &SolverConfig::enable_load_balance)
        .def_readwrite("respect_time_windows", &SolverConfig::respect_time_windows)
        .def_readwrite("verbose", &SolverConfig::verbose);

    py::class_<VRPSolver>(m, "VRPSolver")
        .def(py::init<const Graph&, SolverConfig>(), py::arg("graph"), py::arg("cfg") = SolverConfig())
        .def("solve", &VRPSolver::solve);
}
