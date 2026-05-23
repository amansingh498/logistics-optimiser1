#pragma once
#include <vector>
#include <unordered_map>
#include <string>
#include <limits>
#include <optional>

namespace logistics {

// ─── Fundamental types ──────────────────────────────────────────────────────

using NodeId   = int;
using EdgeId   = int;
using VehicleId = int;
using Cost     = double;

constexpr Cost INF = std::numeric_limits<Cost>::infinity();

// ─── Edge (road segment / warehouse link) ───────────────────────────────────

struct Edge {
    EdgeId   id;
    NodeId   from;
    NodeId   to;
    double   distance_km;   // physical distance
    double   time_min;      // travel time in minutes
    double   cost_factor;   // fuel / toll multiplier (default 1.0)
    bool     bidirectional;

    // Composite weight used by Dijkstra (tuneable via weights)
    double weight(double w_dist, double w_time, double w_cost) const {
        return w_dist * distance_km + w_time * time_min + w_cost * cost_factor;
    }
};

// ─── Node (location: depot / customer / warehouse) ──────────────────────────

enum class NodeType { DEPOT, CUSTOMER, WAREHOUSE };

struct Node {
    NodeId      id;
    std::string name;
    NodeType    type;
    double      lat;
    double      lon;

    // Demand / supply (positive = needs delivery, negative = can supply)
    double      demand      = 0.0;
    double      supply      = 0.0;

    // Time window [open, close] in minutes from midnight
    double      time_window_open  = 0.0;
    double      time_window_close = 1440.0;  // 24 h

    // Service time at this node (loading/unloading)
    double      service_time_min = 0.0;
};

// ─── Weighted adjacency graph ────────────────────────────────────────────────

class Graph {
public:
    // Add nodes and edges
    NodeId add_node(Node n);
    EdgeId add_edge(Edge e);

    // Accessors
    const Node&              node(NodeId id) const { return nodes_.at(id); }
    Node&                    node(NodeId id)       { return nodes_.at(id); }
    const std::vector<Edge>& adj(NodeId id)  const { return adj_.at(id);  }

    std::size_t node_count() const { return nodes_.size(); }
    std::size_t edge_count() const { return edges_.size(); }

    const std::vector<Node>& all_nodes() const { return nodes_; }
    const std::vector<Edge>& all_edges() const { return edges_; }

    bool has_node(NodeId id) const { return id >= 0 && id < (int)nodes_.size(); }

private:
    std::vector<Node>              nodes_;
    std::vector<Edge>              edges_;
    std::vector<std::vector<Edge>> adj_;   // adjacency list
};

} // namespace logistics
