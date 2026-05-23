cmake_minimum_required(VERSION 3.16)
project(logistics_engine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Compiler flags ─────────────────────────────────────────────────────────────
if(MSVC)
    add_compile_options(/W4 /permissive-)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -O2 -march=native)
endif()

# ── Include dirs ──────────────────────────────────────────────────────────────
include_directories(include)

# ── Core engine library ───────────────────────────────────────────────────────
add_library(logistics_core STATIC
    src/graph.cpp
    src/dijkstra.cpp
    src/vrp_solver.cpp
    src/serializer.cpp
    src/api.cpp
)
target_include_directories(logistics_core PUBLIC include)

# ── Test executable ───────────────────────────────────────────────────────────
add_executable(test_engine tests/test_engine.cpp)
target_link_libraries(test_engine PRIVATE logistics_core)

# ── Pybind11 Integration (Phase 2) ────────────────────────────────────────────
include(FetchContent)
FetchContent_Declare(
  pybind11
  GIT_REPOSITORY https://github.com/pybind/pybind11.git
  GIT_TAG        v2.13.6
)
FetchContent_MakeAvailable(pybind11)

pybind11_add_module(logistics_engine bindings/pybind.cpp)
target_link_libraries(logistics_engine PRIVATE logistics_core)
target_include_directories(logistics_engine PRIVATE include)

if(WIN32 AND NOT MSVC)
    target_link_options(logistics_engine PRIVATE "-static-libgcc" "-static-libstdc++" "-static")
endif()
