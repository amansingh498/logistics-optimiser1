#include <logistics/dijkstra.hpp>
#include <queue>
#include <algorithm>
#include <stdexcept>

namespace logistics {

DijkstraSolver::DijkstraSolver(const Graph& graph, PathWeights weights)
    : graph_(graph), weights_(weights) {}

// ─── Core Dijkstra run (single source) ──────────────────────────────────────

DijkstraSolver::DijkstraState DijkstraSolver::run(NodeId source) const {
    const int N = static_cast<int>(graph_.node_count());
    if (source < 0 || source >= N)
        throw std::out_of_range("Source node id out of range");

    DijkstraState state;
    state.dist      .assign(N, INF);
    state.dist_km   .assign(N, INF);
    state.dist_time .assign(N, INF);
    state.prev      .assign(N, -1);

    state.dist[source]      = 0.0;
    state.dist_km[source]   = 0.0;
    state.dist_time[source] = 0.0;

    // Min-heap: (composite_cost, node_id)
    using PQEntry = std::pair<Cost, NodeId>;
    std::priority_queue<PQEntry, std::vector<PQEntry>, std::greater<PQEntry>> pq;
    pq.push({0.0, source});

    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();

        if (d > state.dist[u]) continue;   // stale entry

        for (const Edge& e : graph_.adj(u)) {
            NodeId v      = e.to;
            Cost   w      = e.weight(weights_.w_distance, weights_.w_time, weights_.w_cost);
            Cost   newDist = state.dist[u] + w;

            if (newDist < state.dist[v]) {
                state.dist[v]      = newDist;
                state.dist_km[v]   = state.dist_km[u]   + e.distance_km;
                state.dist_time[v] = state.dist_time[u] + e.time_min;
                state.prev[v]      = u;
                pq.push({newDist, v});
            }
        }
    }
    return state;
}

// ─── Path reconstruction ─────────────────────────────────────────────────────

std::vector<NodeId> DijkstraSolver::reconstruct_path(
    const std::vector<NodeId>& prev, NodeId source, NodeId target) const
{
    std::vector<NodeId> path;
    for (NodeId v = target; v != -1; v = prev[v])
        path.push_back(v);

    if (path.empty() || path.back() != source)
        return {};   // unreachable

    std::reverse(path.begin(), path.end());
    return path;
}

// ─── Public API ─────────────────────────────────────────────────────────────

ShortestPathResult DijkstraSolver::shortest_path(NodeId source, NodeId target) const {
    auto state = run(source);

    ShortestPathResult res;
    res.source         = source;
    res.target         = target;
    res.total_cost     = state.dist[target];
    res.total_distance = state.dist_km[target];
    res.total_time     = state.dist_time[target];
    res.reachable      = (state.dist[target] < INF);
    res.path           = reconstruct_path(state.prev, source, target);
    return res;
}

std::vector<ShortestPathResult> DijkstraSolver::single_source(NodeId source) const {
    auto state = run(source);
    const int N = static_cast<int>(graph_.node_count());

    std::vector<ShortestPathResult> results;
    results.reserve(N);

    for (NodeId t = 0; t < N; ++t) {
        ShortestPathResult res;
        res.source         = source;
        res.target         = t;
        res.total_cost     = state.dist[t];
        res.total_distance = state.dist_km[t];
        res.total_time     = state.dist_time[t];
        res.reachable      = (state.dist[t] < INF);
        res.path           = reconstruct_path(state.prev, source, t);
        results.push_back(std::move(res));
    }
    return results;
}

DistanceMatrix DijkstraSolver::all_pairs() const {
    const int N = static_cast<int>(graph_.node_count());
    DistanceMatrix dm;
    dm.n        = N;
    dm.cost     .assign(N, std::vector<Cost>(N, INF));
    dm.distance .assign(N, std::vector<double>(N, INF));
    dm.time     .assign(N, std::vector<double>(N, INF));
    dm.paths    .assign(N, std::vector<std::vector<NodeId>>(N));

    for (NodeId s = 0; s < N; ++s) {
        auto rows = single_source(s);
        for (NodeId t = 0; t < N; ++t) {
            dm.cost[s][t]     = rows[t].total_cost;
            dm.distance[s][t] = rows[t].total_distance;
            dm.time[s][t]     = rows[t].total_time;
            dm.paths[s][t]    = std::move(rows[t].path);
        }
    }
    return dm;
}

} // namespace logistics
