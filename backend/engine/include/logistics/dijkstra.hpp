#pragma once
#include <logistics/graph.hpp>
#include <vector>
#include <unordered_map>

namespace logistics {

// ─── Weights for multi-objective Dijkstra ───────────────────────────────────

struct PathWeights {
    double w_distance = 1.0;   // weight on distance_km
    double w_time     = 0.5;   // weight on travel time
    double w_cost     = 0.3;   // weight on cost/fuel factor
};

// ─── Result of a single-source shortest-path query ──────────────────────────

struct ShortestPathResult {
    NodeId              source;
    NodeId              target;
    Cost                total_cost;       // weighted composite
    double              total_distance;   // km
    double              total_time;       // minutes
    std::vector<NodeId> path;             // ordered node ids
    bool                reachable;
};

// ─── All-pairs result (used by VRP solver) ──────────────────────────────────

struct DistanceMatrix {
    int                           n;
    std::vector<std::vector<Cost>>   cost;        // [from][to]
    std::vector<std::vector<double>> distance;    // km
    std::vector<std::vector<double>> time;        // min
    std::vector<std::vector<std::vector<NodeId>>> paths;

    Cost    get_cost(NodeId from, NodeId to)     const { return cost[from][to]; }
    double  get_distance(NodeId from, NodeId to) const { return distance[from][to]; }
    double  get_time(NodeId from, NodeId to)     const { return time[from][to]; }
};

// ─── Dijkstra engine ────────────────────────────────────────────────────────

class DijkstraSolver {
public:
    explicit DijkstraSolver(const Graph& graph, PathWeights weights = {});

    // Single-pair shortest path
    ShortestPathResult shortest_path(NodeId source, NodeId target) const;

    // Single-source to all nodes
    std::vector<ShortestPathResult> single_source(NodeId source) const;

    // All-pairs (for VRP pre-computation)
    DistanceMatrix all_pairs() const;

    // Update weights without rebuilding
    void set_weights(PathWeights w) { weights_ = w; }

private:
    struct DijkstraState {
        std::vector<Cost>   dist;
        std::vector<Cost>   dist_km;
        std::vector<Cost>   dist_time;
        std::vector<NodeId> prev;
    };

    DijkstraState run(NodeId source) const;
    std::vector<NodeId> reconstruct_path(const std::vector<NodeId>& prev,
                                          NodeId source, NodeId target) const;

    const Graph& graph_;
    PathWeights  weights_;
};

} // namespace logistics
