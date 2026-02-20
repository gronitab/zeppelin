// activity.js — Bottom activity feed

let listEl;
const maxEntries = 50;

const eventIcons = {
  bead_closed: '\u2713',
  bead_opened: '\u25CB',
  bead_hooked: '\u2693',
  polecat_spawned: '\uD83D\uDC31',
  polecat_nuked: '\uD83D\uDC80',
  mail_sent: '\u2709',
  merge_complete: '\uD83D\uDD00',
  escalation: '\uD83D\uDEA8',
  state_change: '\u21BB',
};

function formatTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

function formatEntryInner(a) {
  const time = formatTime(a.timestamp);
  const icon = eventIcons[a.event] || '\u00B7';
  return `
    <span class="act-time">${time}</span>
    <span class="act-event">${icon} ${a.event || ''}</span>
    <span class="act-agent">${a.agent || ''}</span>
    <span class="act-detail">${a.detail || ''}</span>
  `;
}

export function init() {
  listEl = document.getElementById('activity-list');
}

export function update(activities) {
  if (!activities || activities.length === 0) return;
  const recent = activities.slice(-maxEntries);
  listEl.innerHTML = recent.map(a => `<div class="activity-entry">${formatEntryInner(a)}</div>`).join('');
  listEl.scrollTop = listEl.scrollHeight;
}

export function append(activity) {
  const entry = document.createElement('div');
  entry.className = 'activity-entry';
  entry.innerHTML = formatEntryInner(activity);
  listEl.appendChild(entry);

  while (listEl.children.length > maxEntries) {
    listEl.removeChild(listEl.firstChild);
  }

  listEl.scrollTop = listEl.scrollHeight;
}
