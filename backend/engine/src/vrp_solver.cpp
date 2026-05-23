#include <logistics/vrp_solver.hpp>
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <unordered_set>
#include <numeric>
#include <map>

namespace logistics {

// ─── Constructor ─────────────────────────────────────────────────────────────

VRPSolver::VRPSolver(const Graph& graph, SolverConfig cfg)
    : graph_(graph), cfg_(std::move(cfg))
{
    // Algorithmic Base: Single-Source Shortest Path (SSSP)
    // We use Dijkstra's algorithm to compute the distance matrix.
    // Complexity: O(V * (E + V log V)) for all-pairs.
    DijkstraSolver dijk(graph_);
    dm_ = dijk.all_pairs();

    if (cfg_.verbose)
        std::cout << "[DAA Solver] Distance matrix computed using Dijkstra.\n";
}

// ─── Compute aggregate metrics for a route ───────────────────────────────────

void VRPSolver::compute_route_metrics(Route& r) const {
    r.total_distance_km = 0.0;
    r.total_time_min    = 0.0;
    r.total_cost        = 0.0;

    for (std::size_t i = 0; i + 1 < r.stops.size(); ++i) {
        NodeId a = r.stops[i], b = r.stops[i + 1];
        r.total_distance_km += dm_.get_distance(a, b);
        r.total_time_min    += dm_.get_time(a, b);
        r.total_cost        += dm_.get_cost(a, b);
    }
}

// ─── Time-window feasibility check ───────────────────────────────────────────

bool VRPSolver::check_time_window(const Route& r, const VRPProblem& prob) const {
    (void)prob;
    double clock = 0.0;
    for (std::size_t i = 0; i + 1 < r.stops.size(); ++i) {
        NodeId a = r.stops[i], b = r.stops[i + 1];
        clock += dm_.get_time(a, b);
        clock += graph_.node(b).service_time_min;

        const Node& nb = graph_.node(b);
        if (clock < nb.time_window_open)  clock = nb.time_window_open;
        if (clock > nb.time_window_close) return false;
    }
    return true;
}

// ─── Algorithmic Phase 1: Greedy Construction ────────────────────────────────
//
// paradigm: Greedy Choice Property
// Technique: Nearest Neighbour Heuristic
// Complexity: O(Vehicles * Customers²)

VRPSolution VRPSolver::nearest_neighbour(const VRPProblem& prob) {
    VRPSolution sol;
    sol.algorithm_used = "Greedy-Construction + 2-Opt (DAA)";

    std::unordered_set<NodeId> unvisited(prob.customers.begin(),
                                          prob.customers.end());

    for (const Vehicle& v : prob.vehicles) {
        if (unvisited.empty()) break;

        Route route;
        route.vehicle_id = v.id;
        route.stops.push_back(v.depot_id);

        NodeId current = v.depot_id;
        double load    = 0.0;

        while (!unvisited.empty()) {
            NodeId best      = -1;
            Cost   best_cost = INF;

            // Greedy choice: pick the closest unvisited customer
            for (NodeId c : unvisited) {
                double demand = graph_.node(c).demand;
                if (load + demand > v.capacity) continue;

                Cost cost = dm_.get_cost(current, c);
                if (cost < best_cost) {
                    best_cost = cost;
                    best      = c;
                }
            }

            if (best == -1) break;

            route.stops.push_back(best);
            load += graph_.node(best).demand;
            unvisited.erase(best);
            current = best;
        }

        if (prob.return_to_depot) {
            if (dm_.get_cost(current, v.depot_id) < INF) {
                route.stops.push_back(v.depot_id);
            } else {
                route.feasible = false;
            }
        }

        route.load = load;
        compute_route_metrics(route);
        sol.routes.push_back(std::move(route));
    }

    sol.unserved_customers = static_cast<int>(unvisited.size());
    return sol;
}

// ─── Algorithmic Phase 2: Iterative Improvement (2-opt) ──────────────────────
//
// Paradigm: Local Search / Optimization
// Technique: Edge-Exchange (2-opt)
// Complexity: O(Iterations * N²)

void VRPSolver::two_opt(Route& route, const VRPProblem& prob) {
    auto& stops = route.stops;
    bool improved = true;
    int iterations = 0;

    while (improved && iterations < cfg_.max_2opt_iterations) {
        improved = false;
        ++iterations;

        for (int i = 1; i < (int)stops.size() - 2; ++i) {
            for (int j = i + 1; j < (int)stops.size() - 1; ++j) {
                double d_current =
                    dm_.get_cost(stops[i-1], stops[i]) +
                    dm_.get_cost(stops[j],   stops[j+1]);
                double d_new =
                    dm_.get_cost(stops[i-1], stops[j]) +
                    dm_.get_cost(stops[i],   stops[j+1]);

                if (d_new < d_current - 1e-9) {
                    std::reverse(stops.begin() + i, stops.begin() + j + 1);

                    if (cfg_.respect_time_windows &&
                        !check_time_window(route, prob)) {
                        std::reverse(stops.begin() + i, stops.begin() + j + 1);
                    } else {
                        improved = true;
                        if (cfg_.verbose) {
                            std::cout << "[2-Opt] Improvement found: " << d_current << " -> " << d_new << std::endl;
                        }
                    }
                }
            }
        }
    }
    compute_route_metrics(route);
}

// ─── Algorithmic Phase 3: Dynamic Programming (Held-Karp) ────────────────────
//
// Paradigm: Dynamic Programming (Optimal Substructure)
// Technique: Held-Karp Algorithm for TSP
// Complexity: O(2ⁿ * n²) - Used only for small route segments

void VRPSolver::held_karp(Route& route) {
    // Note: This is a placeholder for the DP logic. 
    // In a production DAA project, we apply DP to optimally reorder 
    // the stops if the number of stops is small (e.g., < 12).
    if (route.stops.size() > 12 || route.stops.size() < 4) return;
    
    // For now, we rely on 2-opt which is a robust heuristic approximation.
    // In DAA, we often compare Greedy, Heuristic, and Exact (DP) methods.
}

// ─── Load Rebalancing ────────────────────────────────────────────────────────

void VRPSolver::load_balance(VRPSolution& sol, const VRPProblem& prob) {
    for (int iter = 0; iter < 20; ++iter) {
        int heavy_idx = -1, light_idx = -1;
        double max_load = -1, min_load = 1e18;

        for (int i = 0; i < (int)sol.routes.size(); ++i) {
            if (sol.routes[i].load > max_load) { max_load = sol.routes[i].load; heavy_idx = i; }
            if (sol.routes[i].load < min_load) { min_load = sol.routes[i].load; light_idx = i; }
        }

        if (heavy_idx == light_idx || heavy_idx == -1) break;

        Route& heavy = sol.routes[heavy_idx];
        Route& light = sol.routes[light_idx];

        int n = static_cast<int>(heavy.stops.size());
        if (n <= 2) break;

        int move_pos = prob.return_to_depot ? n - 2 : n - 1;
        NodeId candidate = heavy.stops[move_pos];
        double demand    = graph_.node(candidate).demand;

        const Vehicle& lv = prob.vehicles[light_idx];
        if (light.load + demand <= lv.capacity) {
            int ins = prob.return_to_depot ? (int)light.stops.size() - 1 : (int)light.stops.size();
            
            // Ensure reachability before moving
            NodeId prev = light.stops[ins - 1];
            if (dm_.get_cost(prev, candidate) >= INF) break;
            
            if (ins < (int)light.stops.size()) {
                NodeId next = light.stops[ins];
                if (dm_.get_cost(candidate, next) >= INF) break;
            }

            light.stops.insert(light.stops.begin() + ins, candidate);
            heavy.stops.erase(heavy.stops.begin() + move_pos);

            light.load += demand;
            heavy.load -= demand;
            compute_route_metrics(light);
            compute_route_metrics(heavy);
        } else {
            break;
        }
    }
}

// ─── Main Solve ──────────────────────────────────────────────────────────────

VRPSolution VRPSolver::solve(const VRPProblem& prob) {
    if (prob.vehicles.empty())
        throw std::invalid_argument("No vehicles defined in VRP problem");
    if (prob.customers.empty())
        throw std::invalid_argument("No customers defined in VRP problem");

    // Phase 1: Greedy Approximation Construction
    VRPSolution sol = nearest_neighbour(prob);

    if (cfg_.strategy == RoutingStrategy::GREEDY_ONLY) {
        sol.algorithm_used = "Greedy Nearest-Neighbour (Baseline)";
    } 
    else if (cfg_.strategy == RoutingStrategy::GREEDY_2OPT) {
        sol.algorithm_used = "Greedy + 2-Opt (Optimized)";
        // Phase 2: Iterative Improvement using Local Search
        for (Route& r : sol.routes) {
            two_opt(r, prob);
            // Phase 3: Exact Optimization for small routes using DP
            held_karp(r);
        }
    }

    if (cfg_.enable_load_balance && sol.routes.size() > 1)
        load_balance(sol, prob);

    sol.total_distance_km = 0;
    sol.total_time_min    = 0;
    sol.total_cost        = 0;
    for (const Route& r : sol.routes) {
        sol.total_distance_km += r.total_distance_km;
        sol.total_time_min    += r.total_time_min;
        sol.total_cost        += r.total_cost;
    }

    return sol;
}

} // namespace logistics
