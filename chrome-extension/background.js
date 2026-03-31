/**
 * Cortex Chrome Bridge — Background Service Worker
 *
 * Receives error/network data from content script and forwards to Cortex sidecar via HTTP.
 */

const CORTEX_URL = 'http://127.0.0.1:4700/api/bridge';

let connected = false;
let errorQueue = [];
let networkQueue = [];
let healthTimer = null;

// ==================== Health Check ====================

async function checkHealth() {
  try {
    const res = await fetch('http://127.0.0.1:4700/api/health', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      if (!connected) {
        connected = true;
        updateBadge('connected');
        flushQueues();
      }
    } else {
      connected = false;
      updateBadge('disconnected');
    }
  } catch {
    connected = false;
    updateBadge('disconnected');
  }
}

function startHealthPolling() {
  checkHealth();
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(checkHealth, 10000);
}

// ==================== HTTP Send ====================

async function sendErrorHTTP(error) {
  try {
    await fetch(`${CORTEX_URL}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(error),
    });
  } catch {
    if (errorQueue.length < 100) errorQueue.push(error);
  }
}

async function sendNetworkHTTP(request) {
  try {
    await fetch(`${CORTEX_URL}/network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    if (networkQueue.length < 100) networkQueue.push(request);
  }
}

function flushQueues() {
  while (errorQueue.length > 0) sendErrorHTTP(errorQueue.shift());
  while (networkQueue.length > 0) sendNetworkHTTP(networkQueue.shift());
}

// ==================== Message Handling ====================

function isCloudflareUrl(url) {
  return /challenges\.cloudflare\.com|cdn-cgi\/challenge-platform|__cf_chl/.test(url || '');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isCloudflareUrl(sender.tab?.url)) {
    sendResponse({ received: false, reason: 'cloudflare' });
    return true;
  }

  if (message.type === 'console_error') {
    const errorData = {
      ...message.data,
      tab_url: sender.tab?.url || '',
      tab_id: sender.tab?.id,
    };
    sendErrorHTTP(errorData);
    sendResponse({ received: true });
  }

  if (message.type === 'network_failure') {
    const networkData = {
      ...message.data,
      tab_url: sender.tab?.url || '',
      tab_id: sender.tab?.id,
    };
    sendNetworkHTTP(networkData);
    sendResponse({ received: true });
  }

  if (message.type === 'get_status') {
    sendResponse({
      connected,
      errorQueueSize: errorQueue.length,
      networkQueueSize: networkQueue.length,
    });
  }

  return true;
});

// ==================== Badge ====================

function updateBadge(status) {
  const color = status === 'connected' ? '#a6e3a1' : '#f38ba8';
  const text = status === 'connected' ? '' : '!';
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
}

// ==================== Network Request Monitoring ====================

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode >= 400) {
      sendNetworkHTTP({
        method: details.method,
        url: details.url,
        status_code: details.statusCode,
        type: details.type,
        failed: details.statusCode >= 500 ? 1 : 0,
      });
    }
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    sendNetworkHTTP({
      method: details.method || 'GET',
      url: details.url,
      status_code: 0,
      error: details.error,
      failed: 1,
    });
  },
  { urls: ['<all_urls>'] }
);

// ==================== Init ====================

startHealthPolling();
