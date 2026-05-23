#pragma once
#include <logistics/graph.hpp>
#include <logistics/dijkstra.hpp>
#include <vector>
#include <string>

namespace logistics {

// ─── Vehicle ─────────────────────────────────────────────────────────────────

struct Vehicle {
    VehicleId   id;
    std::string name;
    NodeId      depot_id;           // starting / ending depot
    double      capacity;           // max load (tonnes / units)
    double      max_range_km;       // max distance before refuel
    double      speed_kmh = 60.0;   // average speed
    double      cost_per_km = 1.0;  // operational cost
};

// ─── VRP Problem instance ────────────────────────────────────────────────────

struct VRPProblem {
    std::vector<NodeId>  depots;       // depot node ids
    std::vector<NodeId>  customers;    // customer node ids (must visit)
    std::vector<NodeId>  warehouses;   // warehouse node ids (optional stops)
    std::vector<Vehicle> vehicles;

    // Objective weights (override Dijkstra defaults if needed)
    PathWeights path_weights;

    // Whether vehicles must return to depot after all deliveries
    bool return_to_depot = true;
};

// ─── Single route for one vehicle ───────────────────────────────────────────

struct Route {
    VehicleId            vehicle_id;
    std::vector<NodeId>  stops;         // ordered visit sequence
    double               total_distance_km = 0.0;
    double               total_time_min    = 0.0;
    double               total_cost        = 0.0;
    double               load             = 0.0;   // total demand served
    bool                 feasible         = true;  // respects constraints
};

// ─── Full solution ───────────────────────────────────────────────────────────

struct VRPSolution {
    std::vector<Route> routes;
    double             total_distance_km = 0.0;
    double             total_time_min    = 0.0;
    double             total_cost        = 0.0;
    int                unserved_customers = 0;
    std::string        algorithm_used;

    // Did we serve every customer?
    bool is_complete() const { return unserved_customers == 0; }
};

} // namespace logistics
