const STORAGE_KEY = 'cortex_blocked_sites';

let currentHostname = '';

// Get current tab's hostname
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]?.url) return;
  try {
    currentHostname = new URL(tabs[0].url).hostname;
  } catch {
    currentHostname = tabs[0].url;
  }
  document.getElementById('current-site').textContent = currentHostname;
  loadBlockedSites();
});

// Load blocked sites and update UI
function loadBlockedSites() {
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    const blocked = result[STORAGE_KEY] || [];
    const isBlocked = blocked.includes(currentHostname);

    // Update current site status
    const statusEl = document.getElementById('site-status');
    const btn = document.getElementById('toggle-btn');

    if (isBlocked) {
      statusEl.textContent = 'Blocked — extension disabled on this site';
      statusEl.className = 'site-status blocked';
      btn.textContent = 'Unblock this site';
      btn.className = 'btn btn-unblock';
    } else {
      statusEl.textContent = 'Active on this site';
      statusEl.className = 'site-status';
      btn.textContent = 'Block this site';
      btn.className = 'btn btn-block';
    }

    // Render blocked list
    const listEl = document.getElementById('blocked-list-items');
    if (blocked.length === 0) {
      listEl.innerHTML = '<div class="empty-list">No blocked sites</div>';
    } else {
      listEl.innerHTML = blocked.map(site => `
        <div class="blocked-item">
          <span>${site}</span>
          <button class="remove" data-site="${site}" title="Remove">&times;</button>
        </div>
      `).join('');

      // Attach remove handlers
      listEl.querySelectorAll('.remove').forEach(btn => {
        btn.addEventListener('click', () => removeSite(btn.dataset.site));
      });
    }
  });
}

// Toggle block/unblock for current site
document.getElementById('toggle-btn').addEventListener('click', () => {
  if (!currentHostname) return;

  chrome.storage.local.get(STORAGE_KEY, (result) => {
    const blocked = result[STORAGE_KEY] || [];
    const isBlocked = blocked.includes(currentHostname);

    let updated;
    if (isBlocked) {
      updated = blocked.filter(s => s !== currentHostname);
    } else {
      updated = [...blocked, currentHostname];
    }

    chrome.storage.local.set({ [STORAGE_KEY]: updated }, () => {
      loadBlockedSites();
      // Refresh the current tab so the content script respects the new setting
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
      });
    });
  });
});

// Remove a site from blocked list
function removeSite(site) {
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    const blocked = (result[STORAGE_KEY] || []).filter(s => s !== site);
    chrome.storage.local.set({ [STORAGE_KEY]: blocked }, () => {
      loadBlockedSites();
    });
  });
}

// Query background for connection status
chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
  if (!response) return;

  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const errorCount = document.getElementById('error-count');
  const networkCount = document.getElementById('network-count');

  if (response.connected) {
    dot.className = 'dot connected';
    text.textContent = 'Connected to Cortex';
    text.style.color = '#a6e3a1';
  } else {
    dot.className = 'dot disconnected';
    text.textContent = 'Disconnected';
    text.style.color = '#f38ba8';
  }

  errorCount.textContent = response.errorQueueSize || 0;
  networkCount.textContent = response.networkQueueSize || 0;
});
