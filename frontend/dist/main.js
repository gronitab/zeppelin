// main.js — SSE connection and application entry point

(function() {
  'use strict';

  const statusEl = document.getElementById('connection-status');
  const rigsEl = document.getElementById('status-rigs');
  const polecatsEl = document.getElementById('status-polecats');
  const beadsEl = document.getElementById('status-beads');

  let eventSource = null;
  let reconnectTimer = null;
  let lastSnapshot = null;

  function init() {
    Graph.init('#graph', Panel.show);
    Panel.init();
    ActivityFeed.init();
    connect();
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
      // Reconnect after 3 seconds.
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
            data.activity_append.forEach(a => ActivityFeed.append(a));
          }
          if (data.summary) {
            updateSummary(data.summary);
          }
        }
        break;
    }
  }

  function applyDiff(snapshot, diff) {
    // Remove nodes.
    if (diff.nodes_removed) {
      snapshot.nodes = snapshot.nodes.filter(n => !diff.nodes_removed.includes(n.id));
    }

    // Add nodes.
    if (diff.nodes_added) {
      snapshot.nodes.push(...diff.nodes_added);
    }

    // Update nodes.
    if (diff.nodes_updated) {
      diff.nodes_updated.forEach(update => {
        const idx = snapshot.nodes.findIndex(n => n.id === update.id);
        if (idx !== -1) {
          Object.assign(snapshot.nodes[idx], update);
        }
      });
    }

    // Remove edges.
    if (diff.edges_removed) {
      snapshot.edges = snapshot.edges.filter(e => {
        const key = e.type + ':' + e.source + ':' + e.target;
        return !diff.edges_removed.includes(key);
      });
    }

    // Add edges.
    if (diff.edges_added) {
      snapshot.edges.push(...diff.edges_added);
    }

    // Append activity.
    if (diff.activity_append) {
      snapshot.activity.push(...diff.activity_append);
      if (snapshot.activity.length > 100) {
        snapshot.activity = snapshot.activity.slice(-100);
      }
    }

    // Update summary.
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
        statusEl.textContent = '● connected';
        break;
      case 'disconnected':
        statusEl.textContent = '○ disconnected';
        break;
      case 'connecting':
        statusEl.textContent = '◌ connecting...';
        break;
    }
  }

  // Initialize when DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
