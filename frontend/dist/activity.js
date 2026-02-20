// activity.js — Bottom activity feed

const ActivityFeed = (() => {
  let listEl;
  const maxEntries = 50;

  function init() {
    listEl = document.getElementById('activity-list');
  }

  function update(activities) {
    if (!activities || activities.length === 0) return;

    // Only render the most recent entries.
    const recent = activities.slice(-maxEntries);
    listEl.innerHTML = recent.map(formatEntry).join('');

    // Auto-scroll to bottom.
    listEl.scrollTop = listEl.scrollHeight;
  }

  function append(activity) {
    const entry = document.createElement('div');
    entry.className = 'activity-entry';
    entry.innerHTML = formatEntryInner(activity);
    listEl.appendChild(entry);

    // Trim old entries.
    while (listEl.children.length > maxEntries) {
      listEl.removeChild(listEl.firstChild);
    }

    listEl.scrollTop = listEl.scrollHeight;
  }

  function formatEntry(a) {
    return `<div class="activity-entry">${formatEntryInner(a)}</div>`;
  }

  function formatEntryInner(a) {
    const time = formatTime(a.timestamp);
    const eventIcon = eventIcons[a.event] || '·';
    return `
      <span class="act-time">${time}</span>
      <span class="act-event">${eventIcon} ${a.event || ''}</span>
      <span class="act-agent">${a.agent || ''}</span>
      <span class="act-detail">${a.detail || ''}</span>
    `;
  }

  const eventIcons = {
    bead_closed: '✓',
    bead_opened: '○',
    bead_hooked: '⚓',
    polecat_spawned: '🐱',
    polecat_nuked: '💀',
    mail_sent: '✉',
    merge_complete: '🔀',
    escalation: '🚨',
    state_change: '↻',
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

  return { init, update, append };
})();
