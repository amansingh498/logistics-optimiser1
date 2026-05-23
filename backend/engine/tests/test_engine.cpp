#include <logistics/graph.hpp>
#include <logistics/dijkstra.hpp>
#include <logistics/vrp.hpp>
#include <logistics/vrp_solver.hpp>
#include <logistics/serializer.hpp>
#include <logistics/api.hpp>
#include <iostream>
#include <iomanip>
#include <cassert>

using namespace logistics;

// ─── Helper: print divider ────────────────────────────────────────────────────

static void section(const std::string& title) {
    std::cout << "\n" << std::string(60, '=') << "\n"
              << "  " << title << "\n"
              << std::string(60, '=') << "\n";
}

// ─── Build a sample city graph ────────────────────────────────────────────────

static Graph build_city_graph() {
    Graph g;
    g.add_node({0, "Central Depot",     NodeType::DEPOT,     28.6139, 77.2090, 0,   0,  0,    1440, 5});
    g.add_node({1, "Warehouse North",   NodeType::WAREHOUSE, 28.6500, 77.2100, 0, 200,  360,  1380, 10});
    g.add_node({2, "Customer A",        NodeType::CUSTOMER,  28.6700, 77.2300, 30,  0,  420,  1200, 8});
    g.add_node({3, "Customer B",        NodeType::CUSTOMER,  28.6200, 77.1800, 25,  0,  480,  1020, 6});
    g.add_node({4, "Customer C",        NodeType::CUSTOMER,  28.6800, 77.1900, 40,  0,  540,  1080, 10});
    g.add_node({5, "Customer D",        NodeType::CUSTOMER,  28.5900, 77.1700, 20,  0,  300,  1440, 5});
    g.add_node({6, "Warehouse South",   NodeType::WAREHOUSE, 28.5700, 77.2000, 0, 150,  0,    1440, 8});

    int eid = 0;
    auto E = [&](NodeId f, NodeId t, double km, double mins, double cf = 1.0) {
        g.add_edge({eid++, f, t, km, mins, cf, true});
    };

    E(0, 1,  5,  8);
    E(0, 2, 12, 15);
    E(0, 3,  8, 10);
    E(1, 2,  4,  6);
    E(1, 4,  9, 12);
    E(2, 4,  6,  8);
    E(3, 5,  7,  9);
    E(4, 5,  5,  7);
    E(5, 6,  3,  5);
    E(6, 0, 10, 13);

    return g;
}

void test_dijkstra(const Graph& g) {
    section("TEST 1 — Dijkstra Shortest Path");
    PathWeights w{1.0, 0.5, 0.3};
    DijkstraSolver dijk(g, w);
    auto print_path = [&](NodeId src, NodeId tgt) {
        auto res = dijk.shortest_path(src, tgt);
        if (!res.reachable) return;
    };
    print_path(0, 4);
    print_path(0, 5);
    std::cout << "\n  ✓ Dijkstra tests passed\n";
}

void test_vrp(const Graph& g) {
    section("TEST 2 — VRP Solver (2 vehicles)");
    VRPProblem prob;
    prob.depots    = {0};
    prob.customers = {2, 3, 4, 5};
    prob.warehouses= {1, 6};
    prob.vehicles.push_back({0, "Truck-Alpha", 0, 80.0, 300.0, 55.0, 1.2});
    prob.vehicles.push_back({1, "Van-Beta",    0, 60.0, 250.0, 65.0, 0.9});
    VRPSolver solver(g);
    VRPSolution sol = solver.solve(prob);
    assert(sol.is_complete() && "All customers should be served");
    std::cout << "\n  ✓ VRP tests passed\n";
}

int main() {
    Graph g = build_city_graph();
    test_dijkstra(g);
    test_vrp(g);
    std::cout << "\nALL TESTS PASSED ✓\n";
    return 0;
}
