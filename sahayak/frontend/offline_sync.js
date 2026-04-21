/**
 * Sahayak AI — Offline/Online Auto-Sync Module
 * Handles:
 *  1. Service Worker registration
 *  2. Offline queue storage (IndexedDB)
 *  3. Auto-flush queue when network returns
 *  4. Visual online/offline indicator
 *  5. Per-user data isolation (all keys namespaced by user ID)
 */

(function() {
'use strict';

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(function(reg) {
      console.log('Sahayak SW registered:', reg.scope);
      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    })
    .catch(function(e) { console.warn('SW registration failed:', e); });
}

// ── IndexedDB Offline Queue ───────────────────────────────────────────────────
var DB_NAME  = 'sahayak_offline';
var DB_VER   = 1;
var STORE    = 'queue';
var _db      = null;

function openDB(cb) {
  if (_db) { cb(_db); return; }
  var req = indexedDB.open(DB_NAME, DB_VER);
  req.onupgradeneeded = function(e) {
    e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
  };
  req.onsuccess = function(e) { _db = e.target.result; cb(_db); };
  req.onerror   = function()  { cb(null); };
}

function queueRequest(url, method, body) {
  openDB(function(db) {
    if (!db) return;
    var tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({
      url: url, method: method, body: body,
      timestamp: Date.now(), userId: getCurrentUserId()
    });
  });
}

function flushQueue(onDone) {
  openDB(function(db) {
    if (!db) { if (onDone) onDone(0); return; }
    var tx = db.transaction(STORE, 'readwrite');
    var store = tx.objectStore(STORE);
    var req = store.getAll();
    req.onsuccess = function(e) {
      var items = (e.target.result || []).filter(function(i) {
        return i.userId === getCurrentUserId();
      });
      if (!items.length) { if (onDone) onDone(0); return; }

      var flushed = 0;
      var pending = items.length;

      items.forEach(function(item) {
        fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: item.body
        }).then(function() {
          // Delete from queue
          var d = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(item.id);
          flushed++;
          pending--;
          if (pending === 0 && onDone) onDone(flushed);
        }).catch(function() {
          pending--;
          if (pending === 0 && onDone) onDone(flushed);
        });
      });
    };
  });
}

// ── Per-User Data Isolation ───────────────────────────────────────────────────
function getCurrentUserId() {
  return localStorage.getItem('sahayak_user_id') || 'guest';
}

/**
 * getUserKey(key) — namespaces any localStorage key by user ID.
 * Ensures user A never sees user B's data.
 * Usage: localStorage.getItem(getUserKey('reports'))
 */
window.getUserKey = function(key) {
  return 'u_' + getCurrentUserId() + '_' + key;
};

/**
 * getUserData/setUserData — safe per-user localStorage access.
 */
window.getUserData = function(key, fallback) {
  try {
    var v = localStorage.getItem(window.getUserKey(key));
    return v !== null ? JSON.parse(v) : (fallback !== undefined ? fallback : null);
  } catch(e) { return fallback !== undefined ? fallback : null; }
};

window.setUserData = function(key, value) {
  try {
    localStorage.setItem(window.getUserKey(key), JSON.stringify(value));
    return true;
  } catch(e) { return false; }
};

window.clearUserData = function() {
  var uid = getCurrentUserId();
  var prefix = 'u_' + uid + '_';
  var toRemove = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith(prefix)) toRemove.push(k);
  }
  toRemove.forEach(function(k) { localStorage.removeItem(k); });
};

// ── Network Status Monitor ────────────────────────────────────────────────────
var _isOnline = navigator.onLine;

function updateNetworkUI(online) {
  _isOnline = online;
  var indicators = document.querySelectorAll('.network-status-dot');
  var labels     = document.querySelectorAll('.network-status-label');
  indicators.forEach(function(el) {
    el.style.background = online ? '#22c55e' : '#f59e0b';
    el.title = online ? 'Online' : 'Offline — data saved locally';
  });
  labels.forEach(function(el) {
    el.textContent = online ? 'Online' : 'Offline';
  });

  if (online) {
    // Flush queued offline requests
    flushQueue(function(count) {
      if (count > 0) {
        var toasts = document.querySelectorAll('.offline-sync-toast');
        if (!toasts.length) {
          var t = document.createElement('div');
          t.className = 'offline-sync-toast';
          t.style.cssText = 'position:fixed;bottom:80px;right:20px;background:#22c55e;'
            + 'color:#fff;padding:.65rem 1.25rem;border-radius:22px;font-size:.85rem;'
            + 'font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3)';
          t.textContent = '✅ ' + count + ' offline records synced!';
          document.body.appendChild(t);
          setTimeout(function() { t.remove(); }, 4000);
        }
      }
    });
  }
}

window.addEventListener('online',  function() { updateNetworkUI(true);  });
window.addEventListener('offline', function() { updateNetworkUI(false); });
window.addEventListener('load',    function() { updateNetworkUI(navigator.onLine); });

// ── SW Message Handler ────────────────────────────────────────────────────────
function handleSwMessage(evt) {
  var msg = evt.data;
  if (!msg) return;
  if (msg.type === 'STORE_OFFLINE') {
    var r = msg.request;
    queueRequest(r.url, r.method, r.body);
  }
  if (msg.type === 'FLUSH_OFFLINE_QUEUE') {
    flushQueue(null);
  }
  if (msg.type === 'QUEUE_FLUSHED') {
    console.log('Queue flushed:', msg.count, 'items');
  }
}

// ── Expose flush for manual use ───────────────────────────────────────────────
window.sahayakSync = {
  flushQueue:   flushQueue,
  queueRequest: queueRequest,
  isOnline:     function() { return _isOnline; },
  getUserId:    getCurrentUserId,
};

})();
