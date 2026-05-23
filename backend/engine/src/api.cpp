#include <logistics/api.hpp>
#include <sstream>
#include <iostream>

namespace logistics {
namespace api {

LogisticsAPI::LogisticsAPI(SolverConfig cfg) : cfg_(std::move(cfg)) {}

// ─── Rebuild solver when graph is ready ──────────────────────────────────────

void LogisticsAPI::rebuild_solver() {
    solver_      = std::make_unique<VRPSolver>(graph_, cfg_);
    solver_ready_ = true;
}

// ─── Error helper ─────────────────────────────────────────────────────────────

Response LogisticsAPI::error(int status, const std::string& msg) {
    return Response{status, "application/json",
                    "{\"error\":\"" + msg + "\"}"};
}

// ─── GET /api/v1/health ───────────────────────────────────────────────────────

Response LogisticsAPI::handle_health() {
    std::ostringstream ss;
    ss << "{"
       << "\"status\":\"ok\","
       << "\"nodes\":"  << graph_.node_count() << ","
       << "\"edges\":"  << graph_.edge_count()
       << "}";
    return {200, "application/json", ss.str()};
}

// ─── POST /api/v1/shortest_path ───────────────────────────────────────────────
// Body: {"source": 0, "target": 5, "weights": {"w_distance":1,"w_time":0.5,"w_cost":0.3}}

Response LogisticsAPI::handle_shortest_path(const Request& req) {
    if (graph_.node_count() == 0)
        return error(400, "Graph is empty. Add nodes first.");

    // Minimal JSON field extraction
    auto int_field = [&](const std::string& key) -> int {
        auto pos = req.body.find("\"" + key + "\"");
        if (pos == std::string::npos) return -1;
        auto colon = req.body.find(':', pos);
        return std::stoi(req.body.substr(colon + 1));
    };

    int src = int_field("source");
    int tgt = int_field("target");

    if (src < 0 || tgt < 0)
        return error(400, "Missing source or target in request body");
    if (!graph_.has_node(src) || !graph_.has_node(tgt))
        return error(400, "Node id out of range");

    PathWeights w = json::parse_weights(req.body);
    DijkstraSolver dijk(graph_, w);
    auto result = dijk.shortest_path(src, tgt);
    return {200, "application/json", json::to_json(result)};
}

// ─── POST /api/v1/distance_matrix ────────────────────────────────────────────

Response LogisticsAPI::handle_distance_matrix(const Request& req) {
    if (graph_.node_count() == 0)
        return error(400, "Graph is empty");

    PathWeights w = json::parse_weights(req.body);
    DijkstraSolver dijk(graph_, w);
    auto dm = dijk.all_pairs();
    return {200, "application/json", json::to_json(dm)};
}

// ─── POST /api/v1/solve ───────────────────────────────────────────────────────
// Minimal parser — production code would use nlohmann/json here.
// Body expected: { "depots":[0], "customers":[1,2,3],
//                  "vehicles":[{"id":0,"depot_id":0,"capacity":100,"max_range_km":500}],
//                  "return_to_depot": true }

Response LogisticsAPI::handle_solve(const Request& req) {
    if (graph_.node_count() == 0)
        return error(400, "Graph is empty");

    // ── Parse depot ids ──────────────────────────────────────────────────
    auto parse_int_array = [&](const std::string& key) -> std::vector<int> {
        std::vector<int> out;
        auto pos = req.body.find("\"" + key + "\"");
        if (pos == std::string::npos) return out;
        auto lb = req.body.find('[', pos);
        auto rb = req.body.find(']', lb);
        if (lb == std::string::npos || rb == std::string::npos) return out;
        std::string arr = req.body.substr(lb + 1, rb - lb - 1);
        std::istringstream ss(arr);
        std::string tok;
        while (std::getline(ss, tok, ',')) {
            tok.erase(0, tok.find_first_not_of(" \t\n"));
            if (!tok.empty()) out.push_back(std::stoi(tok));
        }
        return out;
    };

    VRPProblem prob;
    auto depots    = parse_int_array("depots");
    auto customers = parse_int_array("customers");

    prob.depots.insert(prob.depots.end(), depots.begin(), depots.end());
    prob.customers.insert(prob.customers.end(), customers.begin(), customers.end());
    prob.path_weights = json::parse_weights(req.body);

    // ── Parse vehicles (simplified — one vehicle block) ──────────────────
    auto vpos = req.body.find("\"vehicles\"");
    if (vpos == std::string::npos)
        return error(400, "Missing vehicles array");

    // Extract each {...} object in the vehicles array
    auto arr_lb = req.body.find('[', vpos);
    auto arr_rb = req.body.find(']', arr_lb);
    std::string varr = req.body.substr(arr_lb + 1, arr_rb - arr_lb - 1);

    int vi_start = 0;
    int veh_id   = 0;
    while (true) {
        auto ob = varr.find('{', vi_start);
        auto cb = varr.find('}', ob);
        if (ob == std::string::npos || cb == std::string::npos) break;

        std::string vobj = varr.substr(ob, cb - ob + 1);

        auto field_i = [&](const std::string& k, int def) -> int {
            auto p = vobj.find("\"" + k + "\"");
            if (p == std::string::npos) return def;
            auto c = vobj.find(':', p);
            return std::stoi(vobj.substr(c + 1));
        };
        auto field_d = [&](const std::string& k, double def) -> double {
            auto p = vobj.find("\"" + k + "\"");
            if (p == std::string::npos) return def;
            auto c = vobj.find(':', p);
            return std::stod(vobj.substr(c + 1));
        };

        Vehicle v;
        v.id           = veh_id++;
        v.depot_id     = field_i("depot_id",    depots.empty() ? 0 : depots[0]);
        v.capacity     = field_d("capacity",    100.0);
        v.max_range_km = field_d("max_range_km",500.0);
        v.speed_kmh    = field_d("speed_kmh",   60.0);
        v.cost_per_km  = field_d("cost_per_km", 1.0);
        v.name         = "Vehicle_" + std::to_string(v.id);
        prob.vehicles.push_back(v);

        vi_start = static_cast<int>(cb) + 1;
    }

    if (prob.vehicles.empty())
        return error(400, "No vehicles parsed");
    if (prob.customers.empty())
        return error(400, "No customers specified");

    rebuild_solver();
    auto sol = solver_->solve(prob);
    return {200, "application/json", json::to_json(sol, graph_)};
}

// ─── Main dispatch ────────────────────────────────────────────────────────────

Response LogisticsAPI::handle(const Request& req) {
    try {
        if (req.path == "/api/v1/health")           return handle_health();
        if (req.path == "/api/v1/shortest_path")    return handle_shortest_path(req);
        if (req.path == "/api/v1/distance_matrix")  return handle_distance_matrix(req);
        if (req.path == "/api/v1/solve")            return handle_solve(req);
        return error(404, "Endpoint not found: " + req.path);
    } catch (const std::exception& ex) {
        return error(500, std::string("Internal error: ") + ex.what());
    }
}

} // namespace api
} // namespace logistics
