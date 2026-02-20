package state

import (
	"testing"
)

func TestNewStore(t *testing.T) {
	s := NewStore()
	snap := s.GetSnapshot()
	if snap.Type != "snapshot" {
		t.Errorf("expected type 'snapshot', got %q", snap.Type)
	}
	if len(snap.Nodes) != 0 {
		t.Errorf("expected 0 nodes, got %d", len(snap.Nodes))
	}
	if len(snap.Edges) != 0 {
		t.Errorf("expected 0 edges, got %d", len(snap.Edges))
	}
}

func TestUpdateFirstTime(t *testing.T) {
	s := NewStore()
	nodes := []Node{{ID: "mayor", Type: "mayor", Label: "Mayor", State: "running"}}
	diff := s.Update(nodes, nil, Summary{RigCount: 1})

	// First update should return nil (callers send full snapshot).
	if diff != nil {
		t.Errorf("expected nil diff on first update, got %+v", diff)
	}

	snap := s.GetSnapshot()
	if len(snap.Nodes) != 1 {
		t.Errorf("expected 1 node, got %d", len(snap.Nodes))
	}
	if snap.Summary.RigCount != 1 {
		t.Errorf("expected rig_count 1, got %d", snap.Summary.RigCount)
	}
}

func TestUpdateNoChange(t *testing.T) {
	s := NewStore()
	nodes := []Node{{ID: "mayor", Type: "mayor", Label: "Mayor", State: "running"}}
	s.Update(nodes, nil, Summary{})

	// Same update should produce nil diff.
	diff := s.Update(nodes, nil, Summary{})
	if diff != nil {
		t.Errorf("expected nil diff for no change, got %+v", diff)
	}
}

func TestUpdateNodeAdded(t *testing.T) {
	s := NewStore()
	nodes := []Node{{ID: "mayor", Type: "mayor", Label: "Mayor", State: "running"}}
	s.Update(nodes, nil, Summary{})

	nodes2 := append(nodes, Node{ID: "zeppelin/polecats/rust", Type: "polecat", Label: "rust", Rig: "zeppelin", State: "working"})
	diff := s.Update(nodes2, nil, Summary{})

	if diff == nil {
		t.Fatal("expected diff, got nil")
	}
	if len(diff.NodesAdded) != 1 {
		t.Errorf("expected 1 node added, got %d", len(diff.NodesAdded))
	}
	if diff.NodesAdded[0].ID != "zeppelin/polecats/rust" {
		t.Errorf("expected polecat node added, got %q", diff.NodesAdded[0].ID)
	}
}

func TestUpdateNodeRemoved(t *testing.T) {
	s := NewStore()
	nodes := []Node{
		{ID: "mayor", Type: "mayor", Label: "Mayor", State: "running"},
		{ID: "zeppelin/polecats/rust", Type: "polecat", Label: "rust", Rig: "zeppelin", State: "working"},
	}
	s.Update(nodes, nil, Summary{})

	// Remove the polecat.
	diff := s.Update(nodes[:1], nil, Summary{})

	if diff == nil {
		t.Fatal("expected diff, got nil")
	}
	if len(diff.NodesRemoved) != 1 {
		t.Errorf("expected 1 node removed, got %d", len(diff.NodesRemoved))
	}
	if diff.NodesRemoved[0] != "zeppelin/polecats/rust" {
		t.Errorf("expected polecat removed, got %q", diff.NodesRemoved[0])
	}
}

func TestUpdateNodeStateChanged(t *testing.T) {
	s := NewStore()
	nodes := []Node{{ID: "polecat/rust", Type: "polecat", Label: "rust", State: "idle"}}
	s.Update(nodes, nil, Summary{})

	updated := []Node{{ID: "polecat/rust", Type: "polecat", Label: "rust", State: "working"}}
	diff := s.Update(updated, nil, Summary{})

	if diff == nil {
		t.Fatal("expected diff, got nil")
	}
	if len(diff.NodesUpdated) != 1 {
		t.Errorf("expected 1 node updated, got %d", len(diff.NodesUpdated))
	}
	if diff.NodesUpdated[0].State != "working" {
		t.Errorf("expected state 'working', got %q", diff.NodesUpdated[0].State)
	}
}

func TestUpdateEdgeChanges(t *testing.T) {
	s := NewStore()
	nodes := []Node{{ID: "a", Type: "mayor", Label: "A", State: "running"}}
	edges := []Edge{{Source: "a", Target: "b", Type: "assignment"}}
	s.Update(nodes, edges, Summary{})

	// Change edges.
	newEdges := []Edge{{Source: "a", Target: "c", Type: "monitoring"}}
	diff := s.Update(nodes, newEdges, Summary{})

	if diff == nil {
		t.Fatal("expected diff, got nil")
	}
	if len(diff.EdgesAdded) != 1 {
		t.Errorf("expected 1 edge added, got %d", len(diff.EdgesAdded))
	}
	if len(diff.EdgesRemoved) != 1 {
		t.Errorf("expected 1 edge removed, got %d", len(diff.EdgesRemoved))
	}
}

func TestAddActivity(t *testing.T) {
	s := NewStore()
	s.AddActivity(Activity{Event: "test", Detail: "hello"})

	snap := s.GetSnapshot()
	if len(snap.Activity) != 1 {
		t.Errorf("expected 1 activity, got %d", len(snap.Activity))
	}
	if snap.Activity[0].Detail != "hello" {
		t.Errorf("expected detail 'hello', got %q", snap.Activity[0].Detail)
	}
}

func TestActivityTrimming(t *testing.T) {
	s := NewStore()
	for i := 0; i < 150; i++ {
		s.AddActivity(Activity{Event: "test", Detail: "entry"})
	}

	snap := s.GetSnapshot()
	if len(snap.Activity) != 100 {
		t.Errorf("expected 100 activities (trimmed), got %d", len(snap.Activity))
	}
}

func TestSummaryDiff(t *testing.T) {
	s := NewStore()
	nodes := []Node{{ID: "a", Type: "mayor", Label: "A", State: "running"}}
	s.Update(nodes, nil, Summary{RigCount: 1})

	diff := s.Update(nodes, nil, Summary{RigCount: 2})
	if diff == nil {
		t.Fatal("expected diff for summary change, got nil")
	}
	if diff.Summary == nil {
		t.Fatal("expected summary in diff")
	}
	if diff.Summary.RigCount != 2 {
		t.Errorf("expected rig_count 2, got %d", diff.Summary.RigCount)
	}
}
