#pragma once
#include <logistics/vrp.hpp>
#include <functional>

namespace logistics {

// ─── VRP Solver (DAA Focused) ───────────────────────────────────────────────
//
// Algorithmic Paradigms Used:
//  1. Single-Source Shortest Path (SSSP): Dijkstra's Algorithm [O(E log V)]
//  2. Greedy Strategy: Nearest-Neighbour Construction [O(N²)]
//  3. Dynamic Programming: Held-Karp Algorithm for TSP Route Optimization [O(2ⁿ n²)]
//  4. Local Search / Iterative Improvement: 2-opt Optimization [O(N²)]
//
// This solver strictly follows standard Design and Analysis of Algorithms (DAA)
// techniques to find a feasible solution for the Vehicle Routing Problem.
// ─────────────────────────────────────────────────────────────────────────────

enum class RoutingStrategy {
    GREEDY_ONLY,
    GREEDY_2OPT
};

struct SolverConfig {
    RoutingStrategy strategy = RoutingStrategy::GREEDY_2OPT;
    int    max_2opt_iterations = 100;   // per route
    bool   enable_load_balance = true;
    bool   respect_time_windows = true;
    bool   verbose             = false;
};

class VRPSolver {
public:
    VRPSolver(const Graph& graph, SolverConfig cfg = {});

    // Main entry point
    VRPSolution solve(const VRPProblem& problem);

    // Expose the distance matrix (useful for debugging / REST layer)
    const DistanceMatrix& distance_matrix() const { return dm_; }

private:
    // ── Phase 1: initial solution ─────────────────────────────────────────
    VRPSolution nearest_neighbour(const VRPProblem& prob);

    // ── Phase 2: improvement ──────────────────────────────────────────────
    void two_opt(Route& route, const VRPProblem& prob);
    
    // Dynamic Programming: Held-Karp for optimal TSP sequence in short routes
    void held_karp(Route& route);

    void load_balance(VRPSolution& sol, const VRPProblem& prob);

    // ── Helpers ───────────────────────────────────────────────────────────
    double route_cost(const Route& r, const VRPProblem& prob) const;
    void   compute_route_metrics(Route& r) const;
    bool   check_time_window(const Route& r, const VRPProblem& prob) const;

    const Graph&   graph_;
    SolverConfig   cfg_;
    DistanceMatrix dm_;
};

} // namespace logistics
