/**
 * Sahayak AI — Firebase Token Refresh Module
 * Firebase ID tokens expire every 1 hour.
 * This module auto-refreshes them and updates localStorage.
 * Include in every portal page BEFORE other scripts.
 */
(function() {
  'use strict';

  const REFRESH_INTERVAL = 55 * 60 * 1000; // 55 min (before 60min expiry)
  const FB_SDK = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
  const FB_APP = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';

  // Auth guard — redirect to auth.html if no token and not in demo mode
  const tok  = localStorage.getItem('sahayak_token');
  const demo = localStorage.getItem('demo_mode');
  if (!tok && !demo) {
    window.location.replace('auth.html');
    // stop execution
    throw new Error('Not authenticated');
  }

  // Role guard — check the role matches this portal
  const portalRole = document.documentElement.getAttribute('data-role');
  const userRole   = localStorage.getItem('sahayak_role') || '';
  if (portalRole && userRole && userRole !== portalRole && !demo) {
    // Wrong portal for this user's role
    const dest = userRole === 'doctor' ? 'doctor.html'
               : userRole === 'asha'   ? 'asha_portal.html'
               : 'patient.html';
    window.location.replace(dest);
    throw new Error('Wrong portal for role: ' + userRole);
  }

  // Firebase token auto-refresh
  let _fbApp  = null;
  let _fbAuth = null;

  async function initFirebaseRefresh() {
    try {
      const webCfgStr = await fetch('/auth/firebase-config')
        .then(r => r.ok ? r.json() : null).catch(() => null);
      if (!webCfgStr || !webCfgStr.available) return;

      const [appMod, authMod] = await Promise.all([
        import(FB_APP),
        import(FB_SDK),
      ]);

      // Only init once
      try {
        _fbApp = appMod.getApp('sahayak');
      } catch (_) {
        _fbApp = appMod.initializeApp(webCfgStr.config, 'sahayak');
      }
      _fbAuth = authMod.getAuth(_fbApp);

      // Listen for auth state — refresh token when user is still signed in
      authMod.onAuthStateChanged(_fbAuth, async (user) => {
        if (user) {
          await refreshFirebaseToken(user, authMod);
          // Schedule periodic refresh
          setInterval(async () => {
            const currentUser = _fbAuth.currentUser;
            if (currentUser) await refreshFirebaseToken(currentUser, authMod);
          }, REFRESH_INTERVAL);
        }
      });
    } catch (e) {
      // Firebase not configured — skip silently, legacy JWT stays
      console.debug('Firebase refresh not available:', e.message);
    }
  }

  async function refreshFirebaseToken(user, authMod) {
    try {
      const newToken = await user.getIdToken(true); // force refresh
      // Update the token used by all API calls
      localStorage.setItem('sahayak_token', newToken);
      localStorage.setItem('sahayak_firebase_uid', user.uid);
      console.debug('Firebase token refreshed');
    } catch (e) {
      console.warn('Token refresh failed:', e);
    }
  }

  // Only run in pages with firebase support (not service worker)
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    initFirebaseRefresh();
  }
})();
