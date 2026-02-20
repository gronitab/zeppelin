// panel.js — Side panel for node drill-down details

let panelEl, titleEl, bodyEl, closeBtn;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function field(label, value) {
  return `<div class="field-label">${escapeHtml(label)}</div><div class="field-value">${value}</div>`;
}

function stateBadge(state) {
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

function buildContent(node) {
  let html = '';
  html += field('ID', escapeHtml(node.id));
  html += field('Type', escapeHtml(node.type));
  html += field('State', stateBadge(node.state, node.type));

  if (node.rig) {
    html += field('Rig', escapeHtml(node.rig));
  }

  if (node.metadata) {
    Object.entries(node.metadata).forEach(([key, value]) => {
      if (value) {
        html += field(key.replace(/_/g, ' '), escapeHtml(value));
      }
    });
  }

  const cmd = getCopyCommand(node);
  if (cmd) {
    html += `
      <div class="field-label" style="margin-top: 16px;">Terminal</div>
      <div class="field-value copy-cmd" style="cursor: pointer; color: var(--accent-blue);"
           title="Click to copy">
        ${escapeHtml(cmd)}
      </div>
    `;
  }

  return html;
}

function bindCopyHandlers() {
  bodyEl.querySelectorAll('.copy-cmd').forEach(el => {
    el.addEventListener('click', () => {
      const text = el.textContent.trim();
      navigator.clipboard.writeText(text).then(() => {
        const original = el.textContent;
        el.textContent = 'Copied!';
        setTimeout(() => { el.textContent = original; }, 1500);
      });
    });
  });
}

export function init() {
  panelEl = document.getElementById('panel');
  titleEl = document.getElementById('panel-title');
  bodyEl = document.getElementById('panel-body');
  closeBtn = document.getElementById('panel-close');
  closeBtn.addEventListener('click', close);

  document.getElementById('graph').addEventListener('click', (e) => {
    if (e.target.id === 'graph' || e.target.tagName === 'svg') {
      close();
    }
  });
}

export function show(node) {
  titleEl.textContent = node.label;
  bodyEl.innerHTML = buildContent(node);
  bindCopyHandlers();
  panelEl.classList.remove('hidden');
}

export function close() {
  panelEl.classList.add('hidden');
}
