#pragma once
#include <memory>
#include <logistics/graph.hpp>
#include <logistics/vrp_solver.hpp>
#include <logistics/dijkstra.hpp>
#include <logistics/serializer.hpp>
#include <string>
#include <functional>

namespace logistics {
namespace api {

// ─── Request / Response wrappers ─────────────────────────────────────────────

struct Request {
    std::string method;   // GET, POST
    std::string path;
    std::string body;     // JSON body for POST
    std::unordered_map<std::string, std::string> params;
};

struct Response {
    int         status = 200;
    std::string content_type = "application/json";
    std::string body;
};

// ─── Handler function type ────────────────────────────────────────────────────

using Handler = std::function<Response(const Request&)>;

// ─── LogisticsAPI — wires engine endpoints ───────────────────────────────────
//
//  POST /api/v1/solve           → run full VRP solver
//  POST /api/v1/shortest_path   → single Dijkstra query
//  POST /api/v1/distance_matrix → all-pairs matrix
//  GET  /api/v1/health          → liveness probe
//
// The API object holds a Graph and solver; swap in any HTTP framework by
// calling handle(req) and returning the Response.

class LogisticsAPI {
public:
    explicit LogisticsAPI(SolverConfig cfg = {});

    // Main dispatch — call this from any HTTP framework's request handler
    Response handle(const Request& req);

    // Expose graph for pre-population (or use load_graph_json)
    Graph& graph() { return graph_; }

private:
    Response handle_health();
    Response handle_solve(const Request& req);
    Response handle_shortest_path(const Request& req);
    Response handle_distance_matrix(const Request& req);

    Response error(int status, const std::string& msg);

    // Rebuild the solver whenever the graph changes
    void rebuild_solver();

    Graph        graph_;
    SolverConfig cfg_;
    bool         solver_ready_ = false;

    // Lazy-init solver (built on first use or after graph update)
    std::unique_ptr<VRPSolver> solver_;
};

} // namespace api
} // namespace logistics
