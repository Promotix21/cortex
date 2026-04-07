/**
 * Cortex Chrome Bridge — Background Service Worker
 *
 * Receives error/network data from content script and forwards to Cortex sidecar via HTTP.
 */

const CORTEX_URL = 'http://127.0.0.1:4700/api/bridge';

let connected = false;
let errorQueue = [];
let networkQueue = [];
let errorsSent = 0;
let networkSent = 0;
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
      // Send active tab on every health ping so Cortex always knows which page you're on
      sendActiveTab();
    } else {
      connected = false;
      updateBadge('disconnected');
    }
  } catch {
    connected = false;
    updateBadge('disconnected');
  }
}

async function sendActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
    await fetch(`${CORTEX_URL}/tab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tab.url, title: tab.title || '', tab_id: tab.id }),
    });
  } catch { /* silent */ }
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
    errorsSent++;
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
    networkSent++;
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
      errorsSent,
      networkSent,
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

// webRequest listeners MUST be synchronous in MV3 — use callback-style tabs.get inside
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode >= 400) {
      if (details.tabId >= 0) {
        chrome.tabs.get(details.tabId, (tab) => {
          sendNetworkHTTP({
            method: details.method,
            url: details.url,
            status_code: details.statusCode,
            tab_url: tab?.url || '',
            failed: details.statusCode >= 500 ? 1 : 0,
          });
        });
      } else {
        sendNetworkHTTP({
          method: details.method,
          url: details.url,
          status_code: details.statusCode,
          tab_url: '',
          failed: details.statusCode >= 500 ? 1 : 0,
        });
      }
    }
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.tabId >= 0) {
      chrome.tabs.get(details.tabId, (tab) => {
        sendNetworkHTTP({
          method: details.method || 'GET',
          url: details.url,
          status_code: 0,
          tab_url: tab?.url || '',
          error: details.error,
          failed: 1,
        });
      });
    } else {
      sendNetworkHTTP({
        method: details.method || 'GET',
        url: details.url,
        status_code: 0,
        tab_url: '',
        error: details.error,
        failed: 1,
      });
    }
  },
  { urls: ['<all_urls>'] }
);

// ==================== Init ====================

startHealthPolling();
