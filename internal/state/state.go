package state

import (
	"encoding/json"
	"sync"
	"time"
)

// Node represents an agent, bead, or convoy in the Gas Town topology.
type Node struct {
	ID       string            `json:"id"`
	Type     string            `json:"type"`
	Label    string            `json:"label"`
	Rig      string            `json:"rig,omitempty"`
	State    string            `json:"state"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// Edge represents a relationship between two nodes.
type Edge struct {
	Source   string            `json:"source"`
	Target   string            `json:"target"`
	Type     string            `json:"type"`
	Label    string            `json:"label,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// Activity represents a recent event in the system.
type Activity struct {
	Timestamp time.Time `json:"timestamp"`
	Event     string    `json:"event"`
	Agent     string    `json:"agent"`
	Detail    string    `json:"detail"`
}

// Summary contains aggregate counts for the status bar.
type Summary struct {
	RigCount       int `json:"rig_count"`
	ActivePolecats int `json:"active_polecats"`
	OpenBeads      int `json:"open_beads"`
	ActiveConvoys  int `json:"active_convoys"`
}

// Snapshot is the full topology state sent to the frontend.
type Snapshot struct {
	Type      string     `json:"type"`
	Timestamp time.Time  `json:"timestamp"`
	Nodes     []Node     `json:"nodes"`
	Edges     []Edge     `json:"edges"`
	Activity  []Activity `json:"activity"`
	Summary   Summary    `json:"summary"`
}

// Diff represents changes between two snapshots.
type Diff struct {
	Type           string     `json:"type"`
	Timestamp      time.Time  `json:"timestamp"`
	NodesAdded     []Node     `json:"nodes_added,omitempty"`
	NodesRemoved   []string   `json:"nodes_removed,omitempty"`
	NodesUpdated   []Node     `json:"nodes_updated,omitempty"`
	EdgesAdded     []Edge     `json:"edges_added,omitempty"`
	EdgesRemoved   []string   `json:"edges_removed,omitempty"`
	ActivityAppend []Activity `json:"activity_append,omitempty"`
	Summary        *Summary   `json:"summary,omitempty"`
}

// Store holds the current topology state and computes diffs.
type Store struct {
	mu       sync.RWMutex
	snapshot Snapshot
}

// NewStore creates an empty state store.
func NewStore() *Store {
	return &Store{
		snapshot: Snapshot{
			Type:  "snapshot",
			Nodes: []Node{},
			Edges: []Edge{},
			Activity: []Activity{},
		},
	}
}

// GetSnapshot returns a copy of the current snapshot.
func (s *Store) GetSnapshot() Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	snap := s.snapshot
	snap.Type = "snapshot"
	snap.Timestamp = time.Now()
	return snap
}

// Update replaces the current state and returns a diff. If this is the first
// update (no previous nodes), it returns nil (callers should send a full snapshot).
func (s *Store) Update(nodes []Node, edges []Edge, summary Summary) *Diff {
	s.mu.Lock()
	defer s.mu.Unlock()

	wasEmpty := len(s.snapshot.Nodes) == 0

	diff := computeDiff(s.snapshot.Nodes, nodes, s.snapshot.Edges, edges, s.snapshot.Summary, summary)

	s.snapshot.Nodes = nodes
	s.snapshot.Edges = edges
	s.snapshot.Summary = summary
	s.snapshot.Timestamp = time.Now()

	if wasEmpty {
		return nil
	}

	if diff.isEmpty() {
		return nil
	}
	return diff
}

// AddActivity appends an activity event to the store and returns it.
func (s *Store) AddActivity(a Activity) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.snapshot.Activity = append(s.snapshot.Activity, a)
	// Keep only last 100 activity entries.
	if len(s.snapshot.Activity) > 100 {
		s.snapshot.Activity = s.snapshot.Activity[len(s.snapshot.Activity)-100:]
	}
}

func computeDiff(oldNodes, newNodes []Node, oldEdges, newEdges []Edge, oldSummary, newSummary Summary) *Diff {
	d := &Diff{
		Type:      "diff",
		Timestamp: time.Now(),
	}

	// Build maps for comparison.
	oldNodeMap := make(map[string]Node, len(oldNodes))
	for _, n := range oldNodes {
		oldNodeMap[n.ID] = n
	}
	newNodeMap := make(map[string]Node, len(newNodes))
	for _, n := range newNodes {
		newNodeMap[n.ID] = n
	}

	// Nodes added or updated.
	for _, n := range newNodes {
		old, exists := oldNodeMap[n.ID]
		if !exists {
			d.NodesAdded = append(d.NodesAdded, n)
		} else if !nodesEqual(old, n) {
			d.NodesUpdated = append(d.NodesUpdated, n)
		}
	}

	// Nodes removed.
	for _, n := range oldNodes {
		if _, exists := newNodeMap[n.ID]; !exists {
			d.NodesRemoved = append(d.NodesRemoved, n.ID)
		}
	}

	// Build edge keys for comparison.
	oldEdgeMap := make(map[string]Edge, len(oldEdges))
	for _, e := range oldEdges {
		oldEdgeMap[edgeKey(e)] = e
	}
	newEdgeMap := make(map[string]Edge, len(newEdges))
	for _, e := range newEdges {
		newEdgeMap[edgeKey(e)] = e
	}

	for k, e := range newEdgeMap {
		if _, exists := oldEdgeMap[k]; !exists {
			d.EdgesAdded = append(d.EdgesAdded, e)
		}
	}
	for k := range oldEdgeMap {
		if _, exists := newEdgeMap[k]; !exists {
			d.EdgesRemoved = append(d.EdgesRemoved, k)
		}
	}

	// Summary diff.
	if oldSummary != newSummary {
		d.Summary = &newSummary
	}

	return d
}

func edgeKey(e Edge) string {
	return e.Type + ":" + e.Source + ":" + e.Target
}

func nodesEqual(a, b Node) bool {
	aj, _ := json.Marshal(a)
	bj, _ := json.Marshal(b)
	return string(aj) == string(bj)
}

func (d *Diff) isEmpty() bool {
	return len(d.NodesAdded) == 0 &&
		len(d.NodesRemoved) == 0 &&
		len(d.NodesUpdated) == 0 &&
		len(d.EdgesAdded) == 0 &&
		len(d.EdgesRemoved) == 0 &&
		len(d.ActivityAppend) == 0 &&
		d.Summary == nil
}
