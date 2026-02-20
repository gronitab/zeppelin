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

---

## Round 2: Architecture Decision Record

> Decisions made by a second brainstormer acting as the architect who has to actually build this. Every "or" from Round 1 is resolved below.

---

### 1. Stack Decisions

#### Backend: Go with `embed.FS`

**Decision: Single Go binary serves everything.** The frontend is built with Vite at dev time, output goes to `frontend/dist/`, and `embed.FS` bundles it into the binary at compile time. Zero runtime dependencies.

**Justification:**
- `gt` and `bd` are Go — the ecosystem is already Go. No reason to introduce another runtime.
- `embed.FS` means `go install` gives users a fully functional binary. No `npm install`, no `node_modules`, no Docker.
- Go's `os/exec` makes shelling out to `gt`/`bd` trivial. Parse JSON stdout, done.
- Concurrency model (goroutines per poller) is a natural fit for parallel CLI polling.

#### Real-time Transport: SSE (not WebSocket)

**Decision: SSE only. No WebSocket.** The MVP is read-only. Data flows one direction: backend → frontend. SSE is the correct tool.

**Justification:**
- Browser-native `EventSource` with automatic reconnect. Zero client-side libraries.
- Go's `net/http` handles SSE with `Flusher` — no external dependency.
- If we later add write operations (close bead, send nudge), we add a simple REST POST endpoint, not WebSocket. REST + SSE covers bidirectional needs without the complexity of connection upgrade, ping/pong, and frame parsing.
- WebSocket is only justified if we need low-latency bidirectional streaming (e.g., collaborative editing). We don't.

#### Frontend Graph: D3.js with force-directed layout

**Decision: D3.js.** Not Cytoscape, not vis-network, not Three.js.

**Justification:**
- Force simulation gives the organic "living system" feel. Cytoscape is better for static analysis graphs.
- SVG rendering means crisp text at any zoom level, CSS styling, and standard DOM events for interaction.
- D3 force layout supports custom forces — we need cluster forces to keep nodes inside their rig containers.
- The graph is small (typically <50 nodes, <100 edges). D3 handles this without performance concerns.

**Specific D3 modules needed:**
- `d3-force`: Force simulation (center, charge, link, collision, cluster)
- `d3-selection`: DOM manipulation
- `d3-zoom`: Pan and zoom
- `d3-transition`: Smooth state changes
- `d3-scale`: Color scales for bead states
- `d3-timer`: Animation loops (breathing, particles)

#### Frontend Build: Vite (vanilla JS, no framework)

**Decision: Vanilla JS + Vite. No React, no Vue, no Svelte.**

**Justification:**
- The UI is one page with one graph and one side panel. A framework adds bundle size and complexity for zero benefit.
- D3 manages its own DOM — a virtual DOM framework would fight it.
- Vite gives us: hot reload in dev, ES module bundling, asset hashing for production.
- Total frontend JS should be <30KB gzipped.

---

### 2. Port Decision

**Decision: Port 7331.**

**Justification:**
- "LEET" backwards — instantly memorable, on-brand for the industrial/hacker aesthetic.
- IANA unregistered. Only known use is a video game (Magicka). Zero conflict risk with dev tooling.
- Below 10000 as requested.
- Easy to type: `http://localhost:7331`

**Rejected:**
- 9876: Registered to Session Director, potential ArcGIS conflict.
- 6749: Unmemorable. "GT on a phone keypad" is a stretch.

**Configurable via flag:** `--port=7331` (default). Users can override if 7331 is taken.

---

### 3. Data Architecture

#### 3.1 Node Schema

```json
{
  "id": "zeppelin/polecats/rust",
  "type": "polecat",
  "label": "rust",
  "rig": "zeppelin",
  "state": "working",
  "metadata": {
    "hooked_bead": "zep-4zs",
    "branch": "polecat/rust/zep-4zs@abc123",
    "session": "47e7f81f"
  }
}
```

**Node types** (enum): `mayor`, `deacon`, `overseer`, `witness`, `refinery`, `polecat`, `crew`, `bead`, `convoy`

**State values per type:**

| Type | Possible states |
|------|----------------|
| polecat | `idle`, `working`, `nuked`, `spawning` |
| witness/refinery | `running`, `stopped` |
| mayor/deacon | `running`, `stopped` |
| bead | `unassigned`, `hooked`, `in_progress`, `in_refinery`, `merged`, `closed`, `rejected`, `escalated` |
| convoy | `active`, `completed` |

#### 3.2 Edge Schema

```json
{
  "source": "mayor/",
  "target": "zeppelin/polecats/rust",
  "type": "assignment",
  "label": "zep-4zs",
  "metadata": {
    "bead_id": "zep-4zs"
  }
}
```

**Edge types** (enum): `assignment`, `monitoring`, `merge_queue`, `mail`, `dependency`, `convoy_tracking`

#### 3.3 Snapshot Schema

The backend maintains a single canonical snapshot. SSE sends either the full snapshot (on connect) or diffs (on update).

**Full snapshot (sent on initial connect):**

```json
{
  "type": "snapshot",
  "timestamp": "2026-02-20T07:15:00Z",
  "nodes": [ /* array of Node objects */ ],
  "edges": [ /* array of Edge objects */ ],
  "activity": [
    {
      "timestamp": "2026-02-20T07:14:55Z",
      "event": "bead_closed",
      "agent": "zeppelin/polecats/rust",
      "detail": "Closed zep-4zs"
    }
  ],
  "summary": {
    "rig_count": 4,
    "active_polecats": 2,
    "open_beads": 12,
    "active_convoys": 3
  }
}
```

**Diff events (sent on change):**

```json
{
  "type": "diff",
  "timestamp": "2026-02-20T07:15:05Z",
  "nodes_added": [],
  "nodes_removed": [],
  "nodes_updated": [
    { "id": "zeppelin/polecats/rust", "state": "nuked" }
  ],
  "edges_added": [],
  "edges_removed": ["assignment:mayor/:zeppelin/polecats/rust"],
  "activity_append": [
    { "timestamp": "...", "event": "polecat_nuked", "agent": "zeppelin/polecats/rust", "detail": "Session complete" }
  ]
}
```

#### 3.4 Polling Intervals

| Data source | Command | Interval | Rationale |
|-------------|---------|----------|-----------|
| Topology | `gt status --json` | **5s** | Primary state, must feel responsive |
| Polecats | `gt polecat list --all --json` | **5s** | Workers change state frequently |
| Beads | `bd list --json` (per rig) | **10s** | Less volatile, heavier query |
| Convoys | `gt convoy list --json` | **15s** | Rarely changes |

**Why not 3s:** Shelling out to CLI commands has overhead (~100-200ms per command). At 5s with 4 parallel pollers, the backend executes ~48 commands/minute. At 3s that jumps to ~80. The 5s interval keeps load reasonable while still feeling responsive.

**Diff engine:** The Go backend stores the previous snapshot in memory. On each poll cycle, it compares the new CLI output against the stored state and only emits SSE events for changes. The frontend never does diffing — it receives pre-computed updates.

---

### 4. Visual Design Spec

#### 4.1 Color Palette

```
Background:        #0a0a0f  (near-black with blue undertone)
Surface:           #12121a  (panels, side panel background)
Surface elevated:  #1a1a2e  (rig bubbles, tooltips)
Border subtle:     #2a2a3e  (container borders)
Border active:     #e85d26  (selected/active elements)

Text primary:      #e0e0e8  (main labels)
Text secondary:    #8888a0  (metadata, timestamps)
Text muted:        #555570  (disabled, background info)

Accent orange:     #e85d26  (assignments, refinery, primary actions)
Accent blue:       #4a8db7  (in-progress, monitoring, links)
Accent green:      #39ff14  (success, merged, healthy)
Accent yellow:     #f0c040  (hooked, warnings, pending)
Accent red:        #ff3344  (failed, rejected, errors)
Accent magenta:    #cc44ff  (escalated)
Accent cyan:       #00d4ff  (witness monitoring edges)

Node idle grey:    #444455  (inactive/nuked agents)
```

#### 4.2 Node Shapes and Sizes

| Node type | Shape | Size (px) | Fill | Stroke | Icon |
|-----------|-------|-----------|------|--------|------|
| Mayor | Hexagon | 48 | #1a1a2e | #e85d26 | Crown/hat glyph |
| Deacon | Hexagon | 36 | #1a1a2e | #4a8db7 | Wolf glyph |
| Overseer | Diamond | 40 | #1a1a2e | #f0c040 | Human silhouette |
| Witness | Circle | 32 | #1a1a2e | #00d4ff | Eye glyph |
| Refinery | Rounded rect | 36x28 | #1a1a2e | #e85d26 | Gear glyph |
| Polecat | Circle | 24 | state-dependent | #2a2a3e | Cat face glyph |
| Crew | Rounded rect | 24x20 | #1a1a2e | #f0c040 | Wrench glyph |
| Bead | Circle | 8 | state color | none | — |
| Convoy | Pill/capsule | 32x14 | #1a1a2e | #4a8db7 | Progress fill |

Polecat fill colors by state:
- `working`: #4a8db7 (blue)
- `idle`: #444455 (grey)
- `nuked`: #2a2a3e (dark, fading out)
- `spawning`: #39ff14 (green, fading in)

#### 4.3 Rig Container Style

- **Shape:** Rounded rectangle with 16px border radius
- **Fill:** #1a1a2e at 60% opacity
- **Border:** 1px solid #2a2a3e (default), 1px solid #e85d26 (hovered/selected)
- **Label:** Rig name in top-left corner, 11px monospace, #8888a0
- **Layout:** Witness pinned top-left inside, Refinery pinned top-right inside. Polecats and Crew positioned below via force simulation constrained to the rig bounds.
- **Padding:** 20px internal margin so nodes don't touch the border.

#### 4.4 Edge Styles

| Edge type | Stroke | Width | Dash | Color | Arrow |
|-----------|--------|-------|------|-------|-------|
| Assignment | Solid | 2px | — | #e85d26 | → target |
| Monitoring | Dotted | 1px | 3,3 | #00d4ff | — |
| Merge queue | Dashed | 2px | 6,3 | #e85d26 | → refinery |
| Mail | Animated dash | 1.5px | 4,4 | #e0e0e8 at 60% | → target |
| Dependency | Dotted | 1px | 2,4 | #555570 | — |
| Convoy tracking | Solid | 1px | — | #4a8db7 at 40% | — |

Mail edges appear only briefly (1.5s) when a message is sent, with a particle traveling along the edge.

#### 4.5 Animations

| Animation | Element | Effect | Duration | Trigger |
|-----------|---------|--------|----------|---------|
| Breathing | Active agents | Scale ±2% | 3s ease-in-out loop | Always on working nodes |
| Spawn | Polecat | Fade in + 4px burst ring | 0.6s | Node added |
| Nuke | Polecat | Dissolve (opacity 1→0 + scale 1→0.3) | 0.8s | State → nuked |
| State change | Bead | Color morph | 0.3s ease | State update |
| Mail particle | Edge | Glowing 4px dot travels source→target | 0.8s | Mail sent event |
| Merge pulse | Refinery | Green ring radiates outward | 0.5s | Merge complete |
| Idle drift | All nodes | Brownian motion ±1px | Continuous | Always |
| Heartbeat | Monitoring edge | Opacity pulse 0.3→0.8 | 2s loop | Always on monitoring edges |

#### 4.6 Typography

- **All text:** JetBrains Mono (fallback: `"Fira Code", "Cascadia Code", "Consolas", monospace`)
- **Node labels:** 11px, `text-anchor: middle`, fill #e0e0e8
- **Rig labels:** 11px, fill #8888a0
- **Tooltip text:** 12px, fill #e0e0e8, background #12121a with 8px padding
- **Activity feed:** 11px, fill #8888a0, timestamps in #555570
- **Summary bar:** 13px, fill #e0e0e8, counts in accent colors

---

### 5. Open Questions Resolved

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Event-driven vs polling | **Polling only for MVP.** Event tailing is a future enhancement. | Polling is simpler, more robust, and sufficient at 5s intervals. Tailing `.events.jsonl` requires file watching, seek management, and parsing — complexity not justified for MVP. |
| 2 | `bd mol current --json` | **Parse text output for MVP. File feature request for JSON.** | The molecule visualization is a "nice to have". If `--json` isn't available, we regex-parse the text output (it's structured enough). File a bead requesting the feature. |
| 3 | Read-only vs read-write | **Read-only for MVP.** | The UI is an observatory, not a control panel. Write operations need auth, confirmation dialogs, and error handling. Add later via REST POST endpoints (not WebSocket). |
| 4 | Multi-town support | **Single town only.** Root path configurable via `--root` flag (default: `~/gt`). | Multi-town adds routing complexity for zero current demand. The `--root` flag gives us flexibility without multi-tenancy. |
| 5 | Historical view | **No. Cut from MVP.** | Timeline replay requires storing snapshots (disk/memory), a seek UI, and playback logic. Massive scope for a v2 feature. The activity feed provides recent history. |
| 6 | Mobile / responsive | **Desktop only.** | The force-directed graph with hover states and side panels is inherently a desktop experience. Mobile would need a completely different UI. |
| 7 | Authentication | **None. Localhost only.** Bind to `127.0.0.1` by default. | If someone has localhost access, they already have shell access. Auth adds complexity for no security gain. Add `--bind=0.0.0.0` flag for future network use (with a warning). |
| 8 | Sound effects | **No.** | Browser audio requires user gesture to unlock, is annoying by default, and adds complexity. If desired later, add as a toggled feature. |
| 9 | Notification integration | **No for MVP.** | OS notifications require platform-specific APIs or Notification API permission. The activity feed serves the same purpose for users watching the UI. |
| 10 | Daemon mode | **Manual start only.** `zeppelin serve` or just `zeppelin`. | Daemon management (PID files, systemd/launchd, port conflict detection) is significant scope. Users run it when they want to watch. Add daemon mode in v2. |

---

### 6. Build Plan

Five implementable beads, ordered by dependency:

#### Bead 1: Backend skeleton and CLI polling (`zep-build-1`)

**Scope:**
- `go mod init`, project structure per Round 1 spec
- `cmd/zeppelin/main.go`: flag parsing (`--port`, `--root`), HTTP server start
- `internal/poller/poller.go`: Goroutine-per-command polling of `gt status --json`, `gt polecat list --all --json`, `bd list --json`, `gt convoy list --json`
- `internal/state/state.go`: In-memory state store, diff engine (compare new poll results against stored state, emit change sets)
- `internal/sse/sse.go`: SSE endpoint at `/api/events`, client connection management, broadcasts snapshot on connect, diffs on update
- `internal/server/server.go`: HTTP routes (`/api/events`, `/` for frontend), static file serving from `embed.FS`
- Placeholder `frontend/dist/index.html` with "Zeppelin loading..." for the embed

**Exit criteria:** `go run ./cmd/zeppelin` starts, polls CLI commands, streams JSON over SSE at `http://localhost:7331/api/events`.

**Estimated size:** ~500 lines of Go

#### Bead 2: Frontend graph rendering (`zep-build-2`)

**Depends on:** Bead 1

**Scope:**
- Vite project setup in `frontend/`
- `frontend/src/main.js`: SSE connection via `EventSource`, reconnect handling
- `frontend/src/graph.js`: D3 force simulation, node rendering (shapes per type), edge rendering (styles per type), rig containment force, zoom/pan
- `frontend/src/theme.css`: Full dark industrial theme, all colors from spec
- `frontend/index.html`: SVG canvas, summary bar, basic layout
- `embed.go`: `go:embed frontend/dist` directive
- `Makefile`: `make dev` (Vite dev server), `make build` (Vite build + Go build), `make run`

**Exit criteria:** Opening `localhost:7331` shows a force-directed graph of the town topology with correct shapes, colors, and rig groupings. Nodes update live as state changes.

**Estimated size:** ~600 lines JS/CSS, ~50 lines Go, Makefile

#### Bead 3: Interactions and side panel (`zep-build-3`)

**Depends on:** Bead 2

**Scope:**
- `frontend/src/panel.js`: Slide-in side panel for drill-down on nodes/beads
  - Polecat panel: name, state, hooked bead, molecule progress, recent commits
  - Bead panel: ID, title, description, status, dependencies, timeline
  - Rig panel: agent list, bead summary, health status
- Hover states: highlight connected edges, tooltip with name + state
- Click handlers: single-click opens panel, double-click rig zooms in, double-click background zooms out
- Right-click context menu: copy relevant `bd`/`gt` command to clipboard

**Exit criteria:** Clicking any node opens a detail panel. Hover highlights work. Zoom drill-down works.

**Estimated size:** ~500 lines JS/CSS

#### Bead 4: Activity feed and animations (`zep-build-4`)

**Depends on:** Bead 2

**Scope:**
- `frontend/src/activity.js`: Bottom activity feed, scrolling log of recent events
- Animations: breathing nodes, spawn/nuke transitions, bead state color morphs, mail particles, merge pulse, idle drift, heartbeat edges
- Summary bar: top-right status counts (rigs, active polecats, open beads, convoys)
- Polish: smooth transitions on data updates (300ms), loading state, connection status indicator

**Exit criteria:** Activity feed shows recent events. All animations from the spec are implemented. The graph feels alive.

**Estimated size:** ~400 lines JS/CSS

#### Bead 5: Build pipeline and documentation (`zep-build-5`)

**Depends on:** Beads 1-4

**Scope:**
- `Makefile` finalization: `make build` produces single binary with embedded frontend
- `go install` support: verify `go install github.com/gronitab/zeppelin@latest` works
- `README.md`: Usage instructions, screenshots placeholder, architecture overview
- Font loading: JetBrains Mono via CDN with monospace fallback chain
- Error handling: graceful degradation when `gt`/`bd` commands fail (show "command unavailable" in UI instead of crashing)
- Connection loss handling: "Reconnecting..." overlay when SSE drops

**Exit criteria:** `make build` produces a working single binary. README documents usage. Error states are handled gracefully.

**Estimated size:** ~200 lines across files

---

### 7. MVP Definition

**In scope:**
- Read-only visualization of full Gas Town topology
- Live updates via SSE (5-15s polling)
- Force-directed graph with rig containment
- Dark industrial theme with all specified colors
- Node drill-down side panel
- Activity feed
- All animations from spec
- Single binary distribution

**Out of scope (v2+):**
- Write operations (close bead, send nudge, spawn polecat)
- Event tailing for instant updates
- Historical timeline replay
- Mobile/responsive layout
- Authentication
- Sound effects
- OS notifications
- Daemon mode
- Multi-town support
