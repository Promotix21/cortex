/**
 * Cortex Chrome Bridge — Content Script
 *
 * Intercepts console.error, console.warn, and unhandled errors.
 * Sends them to the background service worker for forwarding to Cortex sidecar.
 */

(function() {
  'use strict';

  // Avoid double-injection
  if (window.__cortex_bridge_injected) return;
  window.__cortex_bridge_injected = true;

  // Skip Cloudflare-protected pages and challenge pages
  // These sites detect console/fetch overrides and may block or flag the user
  const SKIP_PATTERNS = [
    /challenges\.cloudflare\.com/,
    /cdn-cgi\/challenge-platform/,
    /cf-chl-/,
    /__cf_chl/,
  ];

  const pageUrl = window.location.href;
  const pageHtml = document.documentElement?.innerHTML || '';

  if (SKIP_PATTERNS.some(p => p.test(pageUrl))) return;

  // Also detect Cloudflare challenge page by meta/body markers
  if (document.querySelector('meta[name="cf-2fa-verify"]') ||
      document.querySelector('#cf-wrapper') ||
      document.querySelector('#challenge-running') ||
      document.title === 'Just a moment...') {
    return;
  }

  // ==================== Console Interception ====================

  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = function(...args) {
    captureConsole('error', args);
    originalError.apply(console, args);
  };

  console.warn = function(...args) {
    captureConsole('warning', args);
    originalWarn.apply(console, args);
  };

  function captureConsole(level, args) {
    try {
      const message = args.map(arg => {
        if (arg instanceof Error) {
          return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
        }
        if (typeof arg === 'object') {
          try { return JSON.stringify(arg, null, 2).slice(0, 1000); }
          catch { return String(arg); }
        }
        return String(arg);
      }).join(' ');

      // Skip very short or internal messages
      if (message.length < 5) return;
      if (message.includes('[cortex-bridge]')) return;

      chrome.runtime.sendMessage({
        type: 'console_error',
        data: {
          error_type: level,
          message: message.slice(0, 2000),
          source: 'console',
          url: window.location.href,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Fail silently — don't disrupt the page
    }
  }

  // ==================== Unhandled Error Capture ====================

  window.addEventListener('error', (event) => {
    try {
      chrome.runtime.sendMessage({
        type: 'console_error',
        data: {
          error_type: 'uncaught',
          message: event.message || 'Unknown error',
          stack: event.error?.stack || '',
          source: event.filename || 'unknown',
          line: event.lineno,
          column: event.colno,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Fail silently
    }
  });

  // ==================== Unhandled Promise Rejection ====================

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = event.reason;
      const message = reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : String(reason);

      chrome.runtime.sendMessage({
        type: 'console_error',
        data: {
          error_type: 'unhandled_rejection',
          message: message.slice(0, 2000),
          stack: reason instanceof Error ? reason.stack || '' : '',
          source: 'promise',
          url: window.location.href,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Fail silently
    }
  });

  // ==================== Failed Fetch/XHR Detection ====================

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const method = args[1]?.method || 'GET';
    const startTime = Date.now();

    try {
      const response = await originalFetch.apply(this, args);
      const duration = Date.now() - startTime;

      if (!response.ok) {
        chrome.runtime.sendMessage({
          type: 'network_failure',
          data: {
            method,
            url: url.slice(0, 500),
            status_code: response.status,
            duration_ms: duration,
            failed: response.status >= 500 ? 1 : 0,
            source: 'fetch',
            timestamp: new Date().toISOString(),
          },
        });
      }

      return response;
    } catch (err) {
      chrome.runtime.sendMessage({
        type: 'network_failure',
        data: {
          method,
          url: url.slice(0, 500),
          status_code: 0,
          duration_ms: Date.now() - startTime,
          failed: 1,
          error: err.message || 'Network error',
          source: 'fetch',
          timestamp: new Date().toISOString(),
        },
      });
      throw err;
    }
  };
})();
