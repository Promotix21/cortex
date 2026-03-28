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
