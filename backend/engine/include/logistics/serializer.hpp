#pragma once
#include <logistics/vrp.hpp>
#include <logistics/dijkstra.hpp>
#include <string>

namespace logistics {
namespace json {

// Serialise core types to JSON strings (no external dependency)
std::string to_json(const ShortestPathResult& r);
std::string to_json(const Route& r, const Graph& g);
std::string to_json(const VRPSolution& sol, const Graph& g);
std::string to_json(const DistanceMatrix& dm);

// Parse a minimal JSON-like config into PathWeights
PathWeights parse_weights(const std::string& json_str);

} // namespace json
} // namespace logistics
