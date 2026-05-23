#include <logistics/serializer.hpp>
#include <logistics/graph.hpp>
#include <sstream>
#include <iomanip>

namespace logistics {
namespace json {

// ─── Helpers ─────────────────────────────────────────────────────────────────

static std::string esc(const std::string& s) {
    std::string out;
    for (char c : s) {
        if (c == '"')  out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else           out += c;
    }
    return out;
}

static std::string node_array(const std::vector<NodeId>& ids) {
    std::ostringstream ss;
    ss << "[";
    for (std::size_t i = 0; i < ids.size(); ++i) {
        if (i) ss << ",";
        ss << ids[i];
    }
    ss << "]";
    return ss.str();
}

static std::string fmt(double v, int prec = 4) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(prec) << v;
    return ss.str();
}

// ─── ShortestPathResult ───────────────────────────────────────────────────────

std::string to_json(const ShortestPathResult& r) {
    std::ostringstream ss;
    ss << "{"
       << "\"source\":"         << r.source           << ","
       << "\"target\":"         << r.target           << ","
       << "\"reachable\":"      << (r.reachable ? "true" : "false") << ","
       << "\"total_cost\":"     << fmt(r.total_cost)  << ","
       << "\"total_distance_km\":" << fmt(r.total_distance) << ","
       << "\"total_time_min\":" << fmt(r.total_time)  << ","
       << "\"path\":"           << node_array(r.path)
       << "}";
    return ss.str();
}

// ─── Route ───────────────────────────────────────────────────────────────────

std::string to_json(const Route& r, const Graph& g) {
    // Build stop details array
    std::ostringstream stops_ss;
    stops_ss << "[";
    for (std::size_t i = 0; i < r.stops.size(); ++i) {
        if (i) stops_ss << ",";
        const Node& n = g.node(r.stops[i]);
        std::string type_str;
        switch (n.type) {
            case NodeType::DEPOT:     type_str = "depot";     break;
            case NodeType::CUSTOMER:  type_str = "customer";  break;
            case NodeType::WAREHOUSE: type_str = "warehouse"; break;
        }
        stops_ss << "{"
                 << "\"id\":"     << n.id << ","
                 << "\"name\":\"" << esc(n.name) << "\","
                 << "\"type\":\"" << type_str << "\","
                 << "\"lat\":"    << fmt(n.lat, 6) << ","
                 << "\"lon\":"    << fmt(n.lon, 6)
                 << "}";
    }
    stops_ss << "]";

    std::ostringstream ss;
    ss << "{"
       << "\"vehicle_id\":"        << r.vehicle_id             << ","
       << "\"feasible\":"          << (r.feasible ? "true" : "false") << ","
       << "\"load\":"              << fmt(r.load)              << ","
       << "\"total_distance_km\":" << fmt(r.total_distance_km) << ","
       << "\"total_time_min\":"    << fmt(r.total_time_min)    << ","
       << "\"total_cost\":"        << fmt(r.total_cost)        << ","
       << "\"stops\":"             << stops_ss.str()
       << "}";
    return ss.str();
}

// ─── VRPSolution ─────────────────────────────────────────────────────────────

std::string to_json(const VRPSolution& sol, const Graph& g) {
    std::ostringstream routes_ss;
    routes_ss << "[";
    for (std::size_t i = 0; i < sol.routes.size(); ++i) {
        if (i) routes_ss << ",";
        routes_ss << to_json(sol.routes[i], g);
    }
    routes_ss << "]";

    std::ostringstream ss;
    ss << "{"
       << "\"algorithm\":\"" << esc(sol.algorithm_used) << "\","
       << "\"complete\":"    << (sol.is_complete() ? "true" : "false") << ","
       << "\"unserved_customers\":" << sol.unserved_customers << ","
       << "\"total_distance_km\":"  << fmt(sol.total_distance_km) << ","
       << "\"total_time_min\":"     << fmt(sol.total_time_min)    << ","
       << "\"total_cost\":"         << fmt(sol.total_cost)        << ","
       << "\"routes\":"             << routes_ss.str()
       << "}";
    return ss.str();
}

// ─── DistanceMatrix ───────────────────────────────────────────────────────────

std::string to_json(const DistanceMatrix& dm) {
    std::ostringstream ss;
    ss << "{\"n\":" << dm.n << ",\"cost\":[";
    for (int i = 0; i < dm.n; ++i) {
        if (i) ss << ",";
        ss << "[";
        for (int j = 0; j < dm.n; ++j) {
            if (j) ss << ",";
            if (dm.cost[i][j] >= 1e17) ss << "null";
            else ss << fmt(dm.cost[i][j]);
        }
        ss << "]";
    }
    ss << "]}";
    return ss.str();
}

// ─── Parse weights (minimal hand-rolled parser) ───────────────────────────────

PathWeights parse_weights(const std::string& json_str) {
    PathWeights w;
    auto find_val = [&](const std::string& key) -> double {
        auto pos = json_str.find("\"" + key + "\"");
        if (pos == std::string::npos) return -1.0;
        auto colon = json_str.find(':', pos);
        if (colon == std::string::npos) return -1.0;
        return std::stod(json_str.substr(colon + 1));
    };
    double v;
    if ((v = find_val("w_distance")) >= 0) w.w_distance = v;
    if ((v = find_val("w_time"))     >= 0) w.w_time     = v;
    if ((v = find_val("w_cost"))     >= 0) w.w_cost     = v;
    return w;
}

} // namespace json
} // namespace logistics
