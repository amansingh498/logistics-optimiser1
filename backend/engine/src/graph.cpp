#include <logistics/graph.hpp>
#include <stdexcept>

namespace logistics {

NodeId Graph::add_node(Node n) {
    n.id = static_cast<NodeId>(nodes_.size());
    nodes_.push_back(n);
    adj_.emplace_back();          // empty adjacency list for new node
    return n.id;
}

EdgeId Graph::add_edge(Edge e) {
    if (!has_node(e.from) || !has_node(e.to))
        throw std::invalid_argument("Edge references unknown node");

    e.id = static_cast<EdgeId>(edges_.size());
    edges_.push_back(e);
    adj_[e.from].push_back(e);

    if (e.bidirectional) {
        Edge rev      = e;
        rev.id        = static_cast<EdgeId>(edges_.size());
        rev.from      = e.to;
        rev.to        = e.from;
        edges_.push_back(rev);
        adj_[e.to].push_back(rev);
    }
    return e.id;
}

} // namespace logistics
