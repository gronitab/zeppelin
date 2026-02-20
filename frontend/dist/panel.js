// panel.js — Side panel for node drill-down details

const Panel = (() => {
  let panelEl, titleEl, bodyEl, closeBtn;

  function init() {
    panelEl = document.getElementById('panel');
    titleEl = document.getElementById('panel-title');
    bodyEl = document.getElementById('panel-body');
    closeBtn = document.getElementById('panel-close');
    closeBtn.addEventListener('click', close);

    // Close panel on background click.
    document.getElementById('graph').addEventListener('click', (e) => {
      if (e.target.id === 'graph' || e.target.tagName === 'svg') {
        close();
      }
    });
  }

  function show(node) {
    titleEl.textContent = node.label;
    bodyEl.innerHTML = buildContent(node);
    panelEl.classList.remove('hidden');
  }

  function close() {
    panelEl.classList.add('hidden');
  }

  function buildContent(node) {
    let html = '';

    // ID field.
    html += field('ID', node.id);
    html += field('Type', node.type);
    html += field('State', stateBadge(node.state, node.type));

    if (node.rig) {
      html += field('Rig', node.rig);
    }

    // Metadata fields.
    if (node.metadata) {
      Object.entries(node.metadata).forEach(([key, value]) => {
        if (value) {
          html += field(key.replace(/_/g, ' '), escapeHtml(value));
        }
      });
    }

    // Copy command section.
    const cmd = getCopyCommand(node);
    if (cmd) {
      html += `
        <div class="field-label" style="margin-top: 16px;">Terminal</div>
        <div class="field-value" style="cursor: pointer; color: var(--accent-blue);"
             onclick="navigator.clipboard.writeText('${cmd}').then(() => this.textContent = 'Copied!')"
             title="Click to copy">
          ${escapeHtml(cmd)}
        </div>
      `;
    }

    return html;
  }

  function field(label, value) {
    return `<div class="field-label">${escapeHtml(label)}</div><div class="field-value">${value}</div>`;
  }

  function stateBadge(state, type) {
    const colors = {
      working: 'var(--accent-blue)', idle: 'var(--node-idle)',
      running: 'var(--accent-green)', stopped: 'var(--accent-red)',
      nuked: 'var(--text-muted)', spawning: 'var(--accent-green)',
      unassigned: 'var(--node-idle)', hooked: 'var(--accent-yellow)',
      in_progress: 'var(--accent-blue)', in_refinery: 'var(--accent-orange)',
      merged: 'var(--accent-green)', closed: 'var(--accent-green)',
      rejected: 'var(--accent-red)', escalated: 'var(--accent-magenta)',
    };
    const color = colors[state] || 'var(--text-secondary)';
    return `<span class="state-badge" style="background: ${color}; color: #0a0a0f;">${state}</span>`;
  }

  function getCopyCommand(node) {
    switch (node.type) {
      case 'bead':
        return `bd show ${node.label}`;
      case 'polecat':
        return `gt peek ${node.rig}/polecats/${node.label}`;
      case 'witness':
        return `gt peek ${node.rig}/witness`;
      case 'refinery':
        return `gt peek ${node.rig}/refinery`;
      default:
        return null;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { init, show, close };
})();
