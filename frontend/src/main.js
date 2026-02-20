// main.js — SSE connection and application entry point

import './theme.css';
import * as Graph from './graph.js';
import * as Panel from './panel.js';
import * as ActivityFeed from './activity.js';

const statusEl = document.getElementById('connection-status');
const rigsEl = document.getElementById('status-rigs');
const polecatsEl = document.getElementById('status-polecats');
const beadsEl = document.getElementById('status-beads');

let eventSource = null;
let reconnectTimer = null;
let lastSnapshot = null;

function init() {
  Graph.init('#graph', handleNodeClick, handleNodeContext);
  Panel.init();
  ActivityFeed.init();
  connect();
}

function handleNodeClick(node) {
  Panel.show(node);
}

function handleNodeContext(event, node) {
  const menu = document.getElementById('context-menu');
  const items = document.getElementById('context-menu-items');

  const commands = getContextCommands(node);
  if (commands.length === 0) return;

  items.innerHTML = '';
  commands.forEach(cmd => {
    const el = document.createElement('div');
    el.className = 'ctx-item';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = cmd.label;
    const cmdSpan = document.createElement('span');
    cmdSpan.className = 'ctx-label';
    cmdSpan.textContent = cmd.command;
    el.appendChild(labelSpan);
    el.appendChild(cmdSpan);
    el.addEventListener('click', () => {
      navigator.clipboard.writeText(cmd.command);
      menu.classList.add('hidden');
    });
    items.appendChild(el);
  });

  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';
  menu.classList.remove('hidden');
}

function getContextCommands(node) {
  const cmds = [];
  switch (node.type) {
    case 'bead':
      cmds.push({ label: 'Show bead', command: `bd show ${node.label}` });
      cmds.push({ label: 'Close bead', command: `bd close ${node.label}` });
      break;
    case 'polecat':
      cmds.push({ label: 'Peek at polecat', command: `gt peek ${node.rig}/polecats/${node.label}` });
      cmds.push({ label: 'Nudge polecat', command: `gt nudge ${node.rig}/polecats/${node.label} ""` });
      break;
    case 'witness':
      cmds.push({ label: 'Peek at witness', command: `gt peek ${node.rig}/witness` });
      break;
    case 'refinery':
      cmds.push({ label: 'Peek at refinery', command: `gt peek ${node.rig}/refinery` });
      break;
    case 'mayor':
      cmds.push({ label: 'Send mail', command: `gt mail send mayor/ -s "" -m ""` });
      break;
  }
  return cmds;
}

function connect() {
  setStatus('connecting');

  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('connected', () => {
    setStatus('connected');
    clearTimeout(reconnectTimer);
  });

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch (err) {
      console.error('Failed to parse SSE message:', err);
    }
  };

  eventSource.onerror = () => {
    setStatus('disconnected');
    eventSource.close();
    reconnectTimer = setTimeout(connect, 3000);
  };
}

function handleMessage(data) {
  switch (data.type) {
    case 'snapshot':
      lastSnapshot = data;
      Graph.update(data);
      ActivityFeed.update(data.activity);
      updateSummary(data.summary);
      break;

    case 'diff':
      if (lastSnapshot) {
        applyDiff(lastSnapshot, data);
        Graph.update(lastSnapshot);
        if (data.activity_append) {
          data.activity_append.forEach(a => {
            ActivityFeed.append(a);
            handleActivityAnimation(a);
          });
        }
        if (data.summary) {
          updateSummary(data.summary);
        }
      }
      break;
  }
}

function handleActivityAnimation(activity) {
  if (!activity) return;

  // Mail particle animation.
  if (activity.event === 'mail_sent' && activity.agent) {
    // If we can find source and target from the activity detail, animate.
    // For now, this is triggered by the backend sending mail events.
  }

  // Merge pulse animation.
  if (activity.event === 'merge_complete' && activity.agent) {
    // Find the refinery node for the agent's rig.
    const parts = activity.agent.split('/');
    if (parts.length >= 1) {
      const rig = parts[0];
      Graph.animateMergePulse(rig + '/refinery');
    }
  }
}

function applyDiff(snapshot, diff) {
  if (diff.nodes_removed) {
    snapshot.nodes = snapshot.nodes.filter(n => !diff.nodes_removed.includes(n.id));
  }

  if (diff.nodes_added) {
    snapshot.nodes.push(...diff.nodes_added);
  }

  if (diff.nodes_updated) {
    diff.nodes_updated.forEach(update => {
      const idx = snapshot.nodes.findIndex(n => n.id === update.id);
      if (idx !== -1) {
        Object.assign(snapshot.nodes[idx], update);
      }
    });
  }

  if (diff.edges_removed) {
    snapshot.edges = snapshot.edges.filter(e => {
      const key = e.type + ':' + e.source + ':' + e.target;
      return !diff.edges_removed.includes(key);
    });
  }

  if (diff.edges_added) {
    snapshot.edges.push(...diff.edges_added);
  }

  if (diff.activity_append) {
    snapshot.activity.push(...diff.activity_append);
    if (snapshot.activity.length > 100) {
      snapshot.activity = snapshot.activity.slice(-100);
    }
  }

  if (diff.summary) {
    snapshot.summary = diff.summary;
  }

  snapshot.timestamp = diff.timestamp;
}

function updateSummary(summary) {
  if (!summary) return;
  rigsEl.textContent = summary.rig_count + ' rig' + (summary.rig_count !== 1 ? 's' : '');
  polecatsEl.textContent = summary.active_polecats + ' polecat' + (summary.active_polecats !== 1 ? 's' : '');
  beadsEl.textContent = summary.open_beads + ' bead' + (summary.open_beads !== 1 ? 's' : '');
}

function setStatus(status) {
  statusEl.className = status;
  switch (status) {
    case 'connected':
      statusEl.textContent = '\u25CF connected';
      break;
    case 'disconnected':
      statusEl.textContent = '\u25CB disconnected';
      break;
    case 'connecting':
      statusEl.textContent = '\u25CC connecting...';
      break;
  }
}

// Initialize when DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
