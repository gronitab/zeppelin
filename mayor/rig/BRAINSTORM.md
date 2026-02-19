# Gas Town Zeppelin — Graph UI Brainstorm

> First-pass architecture brainstorm for a real-time graph node visualization of the Gas Town multi-agent workspace.

---

## What to Visualize

### Node Types

| Node | Icon | Shape | Notes |
|------|------|-------|-------|
| **Mayor** | 🎩 | Large hexagon | Town-level coordinator, always one |
| **Deacon** | 🐺 | Medium hexagon | Health-check agent, town-level |
| **Overseer** (human) | 👤 | Diamond | The human operator |
| **Witness** (per rig) | 🦉 | Circle | One per rig, monitors polecat health |
| **Refinery** (per rig) | 🏭 | Square/rectangle | One per rig, processes merge queue |
| **Polecat** (dynamic) | 😺 | Small circle | Worker agents, spawn/die frequently |
| **Crew** (per rig) | 👷 | Small rounded rect | Human-operated workers |
| **Bead** (issue) | ● | Tiny dot/pip | Color-coded by state |
| **Convoy** | 🚚 | Pill/capsule | Groups of related beads with progress |

### Groupings

- **Rigs** render as **translucent containment bubbles** (rounded rectangles with a subtle border glow). Each rig (zeppelin, fika, simplare, tgbot) is a distinct container.
- **Town-level agents** (Mayor, Deacon, Overseer) float **outside** all rig bubbles, connected to rigs via dashed lines.
- **Within each rig**: Witness and Refinery are fixed positions (top-left, top-right). Polecats and Crew fan out below them.
- **Beads** orbit their assigned agent like tiny satellites, or cluster at the bottom of a rig if unassigned.

### Edge Types

| Edge | Style | Meaning |
|------|-------|---------|
| Mayor → Polecat | Solid arrow, yellow | Bead assignment / dispatch |
| Polecat → Refinery | Dashed arrow, orange | Work submitted to merge queue |
| Witness → Polecat | Dotted line, cyan | Monitoring / health check |
| Agent → Agent (mail) | Animated dash, white | Mail flow (show briefly on send) |
| Bead → Bead | Thin grey line | Dependency (blocks/blocked-by) |
| Convoy → Bead | Thin blue line | Convoy tracking relationship |

### Bead State Visualization

| State | Color | Animation |
|-------|-------|-----------|
| Unassigned | Grey | Static |
| Hooked | Yellow | Gentle pulse |
| In-progress | Blue | Slow spin |
| In-refinery / MR queued | Orange | Shimmer |
| Merged / Closed | Green | Fade to background |
| Rejected / Failed | Red | Flash then static |
| Escalated | Magenta | Fast pulse |

### Live Updates

- **Polling interval**: 3-5 seconds for `gt status --json` (lightweight).
- **Deep refresh**: Every 15-30 seconds for `bd list --json` per rig (heavier).
- **Transitions**: Animate node position/color changes smoothly (300ms ease).
- **Activity feed**: Small scrolling log at bottom showing recent events (mail sent, bead closed, polecat spawned).

---

## Tech Stack Recommendation

### Backend: **Go**

**Rationale:**
- Gas Town's CLI tools (`gt`, `bd`) are Go — keeping the ecosystem consistent.
- Single static binary with embedded frontend assets (`embed` package).
- Excellent concurrency for polling multiple `gt`/`bd` commands in parallel.
- Fast startup, low memory footprint.
- Can shell out to `gt status --json`, `bd list --json`, etc. and parse results.

### Frontend Graph Rendering: **D3.js with force-directed layout**

**Rationale:**
- D3 force simulation gives the organic, living feel that matches the Gas Town aesthetic.
- Rigs as force-constrained clusters (use `d3-force` with custom cluster forces).
- SVG rendering for crisp text labels and clean zoom.
- Massive ecosystem: examples, plugins, community.
- Lighter than Three.js (3D is overkill for this topology).

**Rejected alternatives:**
- **Cytoscape.js**: Better for static graph analysis, less organic feel. Good fallback if D3 force layout proves too fiddly.
- **vis-network**: Simpler API but less customizable. Could work for MVP.
- **Three.js**: 3D is visually impressive but adds complexity without proportional value. The graph topology is inherently 2D (rigs → agents → beads). Reserve 3D for a future "flythrough" mode if desired.

### Real-time Transport: **Server-Sent Events (SSE)**

**Rationale:**
- Simpler than WebSockets for a one-directional data flow (server → client).
- Native browser `EventSource` API — no library needed client-side.
- Go's `net/http` supports SSE trivially.
- Auto-reconnect built into the browser API.
- The data flow is fundamentally server-push: backend polls `gt`/`bd`, pushes diffs to frontend.

**WebSocket consideration**: If we later add interactive features (e.g., clicking a bead to close it, triggering `bd close` from the UI), upgrade to WebSocket for bidirectional communication. SSE is sufficient for the read-only visualization MVP.

### Port Options

| Port | Mnemonic | Reasoning |
|------|----------|-----------|
| **7331** (recommended) | "LEET" backwards | Memorable, non-conflicting, fits the hacker/industrial vibe |
| **9876** | Descending sequence | Easy to remember, rarely used |
| **6749** | "GT" on phone keypad (48) + 67 prefix | Gas Town reference, obscure enough to avoid conflicts |

**Recommendation**: **7331** — instantly memorable, zero conflict risk, on-brand.

### Build & Distribution

- **Single binary**: Use Go's `embed` package to bundle all frontend assets (HTML, JS, CSS, SVG icons).
- **`go install github.com/gronitab/zeppelin@latest`**: One command to install.
- **Zero dependencies**: No Node.js runtime needed to run (only to develop the frontend).
- Frontend dev: Use Vite for hot-reload during development, build to `dist/`, embed at compile time.

### Aesthetic: Dark Industrial Theme

- **Background**: Near-black (#0a0a0f) with subtle noise texture.
- **Accent colors**: Rust orange (#e85d26), steel blue (#4a8db7), toxic green (#39ff14).
- **Font**: Monospace (JetBrains Mono or Fira Code) for all labels.
- **Rig bubbles**: Dark translucent (#1a1a2e at 80% opacity) with a faint orange border glow.
- **Edges**: Thin, semi-transparent, with animated dashes for active flows.
- **Overall feel**: Think "control room of a dystopian factory" — dark, functional, alive with subtle motion.

---

## UX Flow

### First Open (Landing View)

The user opens `http://localhost:7331` and sees:

1. **Full town topology** — all rigs visible as containment bubbles, force-positioned.
2. **Mayor and Deacon** float at the top-center, connected to their rigs.
3. **Each rig** shows its Witness, Refinery, Polecats, and Crew as nodes inside.
4. **Active beads** appear as tiny color-coded dots orbiting their assigned agent.
5. **Bottom bar**: Scrolling activity feed ("rust hooked zep-4zs", "refinery merged si-h5m").
6. **Top-right**: Status summary — "4 rigs | 2 polecats active | 3 convoys | 12 open beads".

The graph gently breathes — nodes drift slightly, active polecats pulse, mail animations fire occasionally. It should feel alive even when idle.

### Drill-Down: Rig

**Click a rig bubble** → Zooms into the rig. The other rigs shrink to the periphery.

- Witness and Refinery become larger with detail labels.
- Polecats expand to show their current issue title and state.
- Beads within the rig expand from dots to labeled pills showing ID and title.
- Dependency edges between beads become visible.
- Molecule chains (workflow steps) render as a vertical pipeline attached to each active polecat.

### Drill-Down: Bead

**Click a bead** → Side panel slides in from the right.

- Shows: ID, title, full description, status, assignee, priority.
- Dependency graph: what it blocks, what blocks it.
- If it's a molecule: step list with completion status.
- Timeline of status changes.
- "View in terminal" button → copies `bd show <id>` to clipboard.

### Drill-Down: Polecat

**Click a polecat** → Side panel shows:

- Name, rig, current state (working/idle/nuked).
- Hooked bead and molecule progress bar.
- Recent git activity (last 3 commits from their branch).
- Mail sent/received.

### Hover States

- **Node hover**: Highlight all connected edges. Show tooltip with name + state.
- **Edge hover**: Show edge label (e.g., "assigned", "monitoring", "mail: 'HELP: blocked'").
- **Bead hover**: Show ID, title, state in tooltip.
- **Rig hover**: Dim other rigs, brighten hovered rig.

### Click Actions

- **Double-click rig**: Zoom in (drill-down).
- **Double-click background**: Zoom out to full town view.
- **Right-click node**: Context menu with relevant `gt`/`bd` commands (copy to clipboard).
- **Drag**: Pan the canvas.
- **Scroll**: Zoom in/out.

### Animations That Make It Feel Alive

1. **Breathing nodes**: Subtle scale oscillation (±2%) on all active agents.
2. **Mail particles**: When mail is sent, a small glowing dot travels along the edge from sender to receiver (0.5s animation).
3. **Bead state transitions**: Color morphs smoothly (0.3s) when state changes.
4. **Polecat spawn/nuke**: Spawn = node fades in with a small burst. Nuke = node dissolves into particles.
5. **Refinery merge**: Green pulse radiates outward from the Refinery when a merge completes.
6. **Convoy progress**: Convoy pill fills up like a progress bar as tracked beads complete.
7. **Heartbeat edges**: Witness → Polecat monitoring edges pulse every few seconds like a heartbeat.
8. **Idle drift**: All nodes have slight Brownian motion so the graph never looks frozen.

---

## Data Sources

All data comes from shelling out to `gt` and `bd` CLI commands from the Go backend. JSON output is available for all critical commands.

### Primary Endpoints (polled frequently)

| Command | JSON? | Data | Poll Interval |
|---------|-------|------|---------------|
| `gt status --json` | ✅ Yes | Full town topology: rigs, agents, states, mail counts | 3s |
| `gt polecat list --all --json` | ✅ Yes | All polecats: rig, name, state, current issue | 5s |
| `gt rig list --json` | ✅ Yes | Rig health: witness/refinery status, counts | 10s |

### Secondary Endpoints (polled less frequently)

| Command | JSON? | Data | Poll Interval |
|---------|-------|------|---------------|
| `bd list --json` | ✅ Yes | All beads: id, title, status, assignee, deps | 15s (per rig) |
| `gt convoy list --json` | ✅ Yes | Convoys: id, title, tracked issues, progress | 15s |
| `bd mol current --json` | ❓ TBD | Current molecule steps for active polecats | 15s |

### Event-Driven Data (future enhancement)

| Source | Data | Notes |
|--------|------|-------|
| `.events.jsonl` tail | Real-time events | Could `tail -f` for instant updates instead of polling |
| `bd activity --follow` | Beads activity stream | Real-time bead state changes |

### Data Flow Architecture

```
┌─────────────────────────────────────────────┐
│  Go Backend (port 7331)                     │
│                                             │
│  ┌─────────┐   ┌──────────┐   ┌─────────┐  │
│  │ Poller  │──▶│  State   │──▶│   SSE   │──┼──▶ Browser
│  │ (3-15s) │   │  Store   │   │ Emitter │  │
│  └────┬────┘   └──────────┘   └─────────┘  │
│       │                                     │
│  gt status --json                           │
│  bd list --json                             │
│  gt polecat list --json                     │
│  gt convoy list --json                      │
└─────────────────────────────────────────────┘
```

The poller runs CLI commands on a timer, diffs against the previous state, and emits only changed data over SSE. This minimizes frontend processing and bandwidth.

### API Shape (Backend → Frontend SSE)

Each SSE event is a JSON message with a `type` field:

```json
{"type": "topology", "data": { /* full gt status --json */ }}
{"type": "beads", "rig": "zeppelin", "data": [ /* bd list --json */ ]}
{"type": "polecats", "data": [ /* gt polecat list --all --json */ ]}
{"type": "convoys", "data": [ /* gt convoy list --json */ ]}
{"type": "activity", "event": "bead_closed", "bead": "si-h5m", "by": "furiosa"}
```

---

## Project Structure

```
zeppelin/
├── cmd/
│   └── zeppelin/
│       └── main.go              # Entry point, flag parsing, server start
├── internal/
│   ├── poller/
│   │   └── poller.go            # Polls gt/bd commands, builds state
│   ├── state/
│   │   └── state.go             # In-memory state store, diff engine
│   ├── sse/
│   │   └── sse.go               # SSE endpoint, client management
│   └── server/
│       └── server.go            # HTTP routes, static file serving
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── main.js              # Entry, SSE connection, D3 init
│   │   ├── graph.js             # D3 force layout, node/edge rendering
│   │   ├── panel.js             # Side panel for drill-down details
│   │   ├── activity.js          # Bottom activity feed
│   │   └── theme.css            # Dark industrial styles
│   └── vite.config.js           # Dev server config
├── embed.go                     # go:embed directives for frontend/dist
├── go.mod
├── go.sum
├── Makefile                     # build, dev, run targets
└── README.md
```

---

## Open Questions

These are unresolved decisions for the second brainstormer to tackle:

### 1. Event-Driven vs. Polling

Should we tail `.events.jsonl` or use `bd activity --follow` for real-time updates instead of polling? Polling is simpler and more robust, but tailing gives instant feedback. Could we do a hybrid — poll for full state, tail for incremental events?

### 2. `bd mol current --json` Availability

Does `bd mol current` support `--json` output? The molecule step visualization depends on structured data. If not, we need to parse text output or request the feature.

### 3. Interactive Features (Read-Only vs. Read-Write)

Should the UI be purely observational, or should users be able to:
- Close beads from the UI?
- Send nudges to agents?
- Spawn/nuke polecats?

If read-write, we need WebSockets instead of SSE, plus auth considerations.

### 4. Multi-Town Support

Should Zeppelin support visualizing multiple Gas Town instances? Or is it always bound to a single `~/gt/` directory? If multi-town, the backend needs a configurable root path.

### 5. Historical View

Should there be a timeline slider to replay past states? The `.events.jsonl` file contains historical data. This would be powerful for debugging but adds significant complexity.

### 6. Mobile / Responsive

Is mobile access a goal? The D3 force layout works on mobile but touch interactions differ. If mobile is not a priority, we can optimize for desktop.

### 7. Authentication

If running on a shared machine or exposed to a network, should there be auth? For local-only use (localhost), no auth is fine. Could use a simple token flag (`--token=xxx`) if needed.

### 8. Sound Effects

Would subtle audio feedback enhance the experience? A quiet "ping" when a bead completes, a low hum when polecats are working? Could be toggled. Fits the industrial aesthetic but might annoy users.

### 9. Notification Integration

Should Zeppelin integrate with OS notifications? Alert the overseer when an escalation happens, a polecat crashes, or a merge fails?

### 10. Deployment as Daemon

Should Zeppelin run as a Gas Town daemon (always-on) or be started manually? If daemon, it could be managed by `gt` like other agents. Port conflict detection would be needed.

---

## Summary

**Recommended stack**: Go backend + D3.js force-directed graph + SSE + dark industrial theme, served as a single binary on port 7331.

**MVP scope**: Read-only visualization of town topology, rig drill-down, bead state tracking, activity feed. No interactive features, no auth, no mobile optimization.

**Key differentiator**: The force-directed layout with organic animations (breathing, particles, dissolve effects) will make Gas Town feel like a living organism rather than a static dashboard.
