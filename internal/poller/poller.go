package poller

import (
	"context"
	"encoding/json"
	"log"
	"os/exec"
	"strings"
	"time"

	"github.com/gronitab/zeppelin/internal/state"
)

// Poller periodically runs gt/bd CLI commands and updates the state store.
type Poller struct {
	store    *state.Store
	root     string
	onChange func() // called when state changes
}

// New creates a poller that updates the given store.
func New(store *state.Store, root string, onChange func()) *Poller {
	return &Poller{store: store, root: root, onChange: onChange}
}

// Run starts polling loops. It blocks until the context is cancelled.
func (p *Poller) Run(ctx context.Context) {
	// Run an initial poll immediately.
	p.poll()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.poll()
		}
	}
}

func (p *Poller) poll() {
	nodes, edges, summary := p.collectState()
	diff := p.store.Update(nodes, edges, summary)
	if diff != nil {
		p.onChange()
	}
}

// gtStatusOutput represents the JSON from `gt status --json`.
type gtStatusOutput struct {
	Rigs []rigInfo `json:"rigs"`
}

type rigInfo struct {
	Name     string      `json:"name"`
	Witness  agentInfo   `json:"witness"`
	Refinery agentInfo   `json:"refinery"`
	Polecats []agentInfo `json:"polecats"`
	Crew     []agentInfo `json:"crew"`
}

type agentInfo struct {
	Name    string            `json:"name"`
	State   string            `json:"state"`
	Details map[string]string `json:"details"`
}

// beadInfo represents a single bead from `bd list --json`.
type beadInfo struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Status   string `json:"status"`
	Assignee string `json:"assignee"`
	Priority int    `json:"priority"`
	Type     string `json:"type"`
}

func (p *Poller) collectState() ([]state.Node, []state.Edge, state.Summary) {
	var nodes []state.Node
	var edges []state.Edge

	// Try gt status --json first.
	statusOut := p.runCmd("gt", "status", "--json")
	var status gtStatusOutput

	if err := json.Unmarshal([]byte(statusOut), &status); err == nil && len(status.Rigs) > 0 {
		nodes, edges = p.buildFromStatus(status)
	} else {
		// Fallback: build state from individual commands.
		nodes, edges = p.buildFromCommands()
	}

	// Collect beads.
	beadNodes, beadEdges := p.collectBeads()
	nodes = append(nodes, beadNodes...)
	edges = append(edges, beadEdges...)

	summary := state.Summary{
		RigCount:       countByType(nodes, "witness"), // one witness per rig
		ActivePolecats: countByTypeAndState(nodes, "polecat", "working"),
		OpenBeads:      countByType(nodes, "bead"),
	}

	return nodes, edges, summary
}

func (p *Poller) buildFromStatus(status gtStatusOutput) ([]state.Node, []state.Edge) {
	var nodes []state.Node
	var edges []state.Edge

	// Add mayor node.
	nodes = append(nodes, state.Node{
		ID:    "mayor",
		Type:  "mayor",
		Label: "Mayor",
		State: "running",
	})

	for _, rig := range status.Rigs {
		// Witness.
		if rig.Witness.Name != "" {
			wID := rig.Name + "/witness"
			nodes = append(nodes, state.Node{
				ID:    wID,
				Type:  "witness",
				Label: "Witness",
				Rig:   rig.Name,
				State: orDefault(rig.Witness.State, "running"),
			})
		}

		// Refinery.
		if rig.Refinery.Name != "" {
			rID := rig.Name + "/refinery"
			nodes = append(nodes, state.Node{
				ID:    rID,
				Type:  "refinery",
				Label: "Refinery",
				Rig:   rig.Name,
				State: orDefault(rig.Refinery.State, "running"),
			})
		}

		// Polecats.
		for _, pc := range rig.Polecats {
			pcID := rig.Name + "/polecats/" + pc.Name
			nodes = append(nodes, state.Node{
				ID:       pcID,
				Type:     "polecat",
				Label:    pc.Name,
				Rig:      rig.Name,
				State:    orDefault(pc.State, "idle"),
				Metadata: pc.Details,
			})

			// Assignment edge from mayor.
			if hookBead, ok := pc.Details["hooked_bead"]; ok && hookBead != "" {
				edges = append(edges, state.Edge{
					Source: "mayor",
					Target: pcID,
					Type:   "assignment",
					Label:  hookBead,
				})
			}

			// Monitoring edge from witness.
			wID := rig.Name + "/witness"
			edges = append(edges, state.Edge{
				Source: wID,
				Target: pcID,
				Type:   "monitoring",
			})
		}

		// Crew.
		for _, cr := range rig.Crew {
			crID := rig.Name + "/crew/" + cr.Name
			nodes = append(nodes, state.Node{
				ID:    crID,
				Type:  "crew",
				Label: cr.Name,
				Rig:   rig.Name,
				State: orDefault(cr.State, "idle"),
			})
		}
	}

	return nodes, edges
}

func (p *Poller) buildFromCommands() ([]state.Node, []state.Edge) {
	var nodes []state.Node
	var edges []state.Edge

	// Add mayor.
	nodes = append(nodes, state.Node{
		ID:    "mayor",
		Type:  "mayor",
		Label: "Mayor",
		State: "running",
	})

	// Try gt polecat list --all --json.
	polecatOut := p.runCmd("gt", "polecat", "list", "--all", "--json")
	var polecats []struct {
		Name  string `json:"name"`
		Rig   string `json:"rig"`
		State string `json:"state"`
		Hook  string `json:"hook"`
	}

	rigs := make(map[string]bool)

	if err := json.Unmarshal([]byte(polecatOut), &polecats); err == nil {
		for _, pc := range polecats {
			rigs[pc.Rig] = true
			pcID := pc.Rig + "/polecats/" + pc.Name
			nodes = append(nodes, state.Node{
				ID:    pcID,
				Type:  "polecat",
				Label: pc.Name,
				Rig:   pc.Rig,
				State: orDefault(pc.State, "idle"),
				Metadata: map[string]string{
					"hooked_bead": pc.Hook,
				},
			})

			if pc.Hook != "" {
				edges = append(edges, state.Edge{
					Source: "mayor",
					Target: pcID,
					Type:   "assignment",
					Label:  pc.Hook,
				})
			}
		}
	} else {
		// Fallback: parse text output of gt polecat list --all
		textOut := p.runCmd("gt", "polecat", "list", "--all")
		nodes, edges, rigs = parsePolecatText(textOut, nodes, edges)
	}

	// Add rig-level agents for discovered rigs.
	for rig := range rigs {
		wID := rig + "/witness"
		nodes = append(nodes, state.Node{
			ID:    wID,
			Type:  "witness",
			Label: "Witness",
			Rig:   rig,
			State: "running",
		})

		rID := rig + "/refinery"
		nodes = append(nodes, state.Node{
			ID:    rID,
			Type:  "refinery",
			Label: "Refinery",
			Rig:   rig,
			State: "running",
		})

		// Monitoring edges for all polecats in this rig.
		for _, n := range nodes {
			if n.Type == "polecat" && n.Rig == rig {
				edges = append(edges, state.Edge{
					Source: wID,
					Target: n.ID,
					Type:   "monitoring",
				})
			}
		}
	}

	return nodes, edges
}

func parsePolecatText(text string, nodes []state.Node, edges []state.Edge) ([]state.Node, []state.Edge, map[string]bool) {
	rigs := make(map[string]bool)
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "─") {
			continue
		}
		// Try to parse lines like "rust  zeppelin  working  zep-toof"
		fields := strings.Fields(line)
		if len(fields) >= 3 {
			name := fields[0]
			rig := fields[1]
			st := fields[2]
			hook := ""
			if len(fields) >= 4 {
				hook = fields[3]
			}
			// Skip header lines.
			if name == "NAME" || name == "name" || name == "Polecat" {
				continue
			}
			rigs[rig] = true
			pcID := rig + "/polecats/" + name
			nodes = append(nodes, state.Node{
				ID:    pcID,
				Type:  "polecat",
				Label: name,
				Rig:   rig,
				State: orDefault(st, "idle"),
				Metadata: map[string]string{
					"hooked_bead": hook,
				},
			})
			if hook != "" {
				edges = append(edges, state.Edge{
					Source: "mayor",
					Target: pcID,
					Type:   "assignment",
					Label:  hook,
				})
			}
		}
	}
	return nodes, edges, rigs
}

func (p *Poller) collectBeads() ([]state.Node, []state.Edge) {
	var nodes []state.Node
	var edges []state.Edge

	out := p.runCmd("bd", "list", "--json")
	var beads []beadInfo
	if err := json.Unmarshal([]byte(out), &beads); err == nil {
		for _, b := range beads {
			beadState := mapBeadStatus(b.Status)
			nodes = append(nodes, state.Node{
				ID:    "bead:" + b.ID,
				Type:  "bead",
				Label: b.ID,
				State: beadState,
				Metadata: map[string]string{
					"title":    b.Title,
					"assignee": b.Assignee,
				},
			})

			// Edge from bead to its assignee.
			if b.Assignee != "" {
				edges = append(edges, state.Edge{
					Source: "bead:" + b.ID,
					Target: b.Assignee,
					Type:   "assignment",
				})
			}
		}
	}

	return nodes, edges
}

func mapBeadStatus(status string) string {
	switch strings.ToLower(status) {
	case "open", "":
		return "unassigned"
	case "in_progress", "in-progress":
		return "in_progress"
	case "closed", "done":
		return "closed"
	case "hooked":
		return "hooked"
	default:
		return status
	}
}

func (p *Poller) runCmd(name string, args ...string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = p.root
	out, err := cmd.Output()
	if err != nil {
		log.Printf("poller: %s %v: %v", name, args, err)
		return ""
	}
	return strings.TrimSpace(string(out))
}

func countByType(nodes []state.Node, typ string) int {
	n := 0
	for _, node := range nodes {
		if node.Type == typ {
			n++
		}
	}
	return n
}

func countByTypeAndState(nodes []state.Node, typ, st string) int {
	n := 0
	for _, node := range nodes {
		if node.Type == typ && node.State == st {
			n++
		}
	}
	return n
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
