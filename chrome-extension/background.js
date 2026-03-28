/**
 * Cortex Chrome Bridge — Background Service Worker
 *
 * Maintains WebSocket connection to Cortex sidecar.
 * Receives error/network data from content script and forwards to sidecar.
 */

const CORTEX_WS_URL = 'ws://127.0.0.1:4700/ws/bridge';
const CORTEX_HTTP_URL = 'http://127.0.0.1:4700/api/bridge';

let ws = null;
let wsConnected = false;
let reconnectTimer = null;
let errorQueue = [];
let networkQueue = [];

// ==================== WebSocket Connection ====================

function connectWebSocket() {
  try {
    ws = new WebSocket(CORTEX_WS_URL);

    ws.onopen = () => {
      wsConnected = true;
      console.log('[cortex-bridge] WebSocket connected');
      flushQueues();
      updateBadge('connected');
    };

    ws.onclose = () => {
      wsConnected = false;
      ws = null;
      updateBadge('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      wsConnected = false;
      updateBadge('disconnected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pong') return;
      } catch {
        // Ignore parse errors
      }
    };
  } catch {
    wsConnected = false;
    updateBadge('disconnected');
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectWebSocket, 5000);
}

function flushQueues() {
  // Flush via HTTP if WS not available
  while (errorQueue.length > 0) {
    const error = errorQueue.shift();
    sendErrorHTTP(error);
  }
  while (networkQueue.length > 0) {
    const req = networkQueue.shift();
    sendNetworkHTTP(req);
  }
}

// ==================== HTTP Fallback ====================

async function sendErrorHTTP(error) {
  try {
    await fetch(`${CORTEX_HTTP_URL}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(error),
    });
  } catch {
    // Sidecar not available — re-queue
    errorQueue.push(error);
  }
}

async function sendNetworkHTTP(request) {
  try {
    await fetch(`${CORTEX_HTTP_URL}/network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    networkQueue.push(request);
  }
}

// ==================== Message Handling ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'console_error') {
    const errorData = {
      ...message.data,
      tab_url: sender.tab?.url || '',
      tab_id: sender.tab?.id,
    };

    if (wsConnected && ws) {
      ws.send(JSON.stringify({ type: 'error', data: errorData }));
    } else {
      errorQueue.push(errorData);
      // Try HTTP immediately
      sendErrorHTTP(errorData);
    }
    sendResponse({ received: true });
  }

  if (message.type === 'network_failure') {
    const networkData = {
      ...message.data,
      tab_url: sender.tab?.url || '',
      tab_id: sender.tab?.id,
    };

    if (wsConnected && ws) {
      ws.send(JSON.stringify({ type: 'network', data: networkData }));
    } else {
      networkQueue.push(networkData);
      sendNetworkHTTP(networkData);
    }
    sendResponse({ received: true });
  }

  if (message.type === 'get_status') {
    sendResponse({
      connected: wsConnected,
      errorQueueSize: errorQueue.length,
      networkQueueSize: networkQueue.length,
    });
  }

  return true; // Keep sendResponse alive for async
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
      const networkData = {
        method: details.method,
        url: details.url,
        status_code: details.statusCode,
        type: details.type,
        failed: details.statusCode >= 500 ? 1 : 0,
      };

      if (wsConnected && ws) {
        ws.send(JSON.stringify({ type: 'network', data: networkData }));
      } else {
        sendNetworkHTTP(networkData);
      }
    }
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    const networkData = {
      method: details.method || 'GET',
      url: details.url,
      status_code: 0,
      error: details.error,
      failed: 1,
    };

    if (wsConnected && ws) {
      ws.send(JSON.stringify({ type: 'network', data: networkData }));
    } else {
      sendNetworkHTTP(networkData);
    }
  },
  { urls: ['<all_urls>'] }
);

// ==================== Init ====================

connectWebSocket();
