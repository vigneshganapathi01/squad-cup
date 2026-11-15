// UI only (from the ui-work branch). A file instead of inline scripts so the site's Content-Security-Policy allows it.
// Loaded in <head>, before app.js.
(function () {
  // 1. Colour theme: apply the saved one before the first paint (Violet is the default).
  var T = [['violet', 'Violet'], ['dj', 'DJ green'], ['yellow', 'Yellow']], root = document.documentElement;
  try { var t = localStorage.getItem('sc-theme'); if (t && t !== 'violet') root.dataset.theme = t; } catch (e) {}
  // 2. On desktop the content scrolls inside the frame (#app), so mirror the app's window.scrollTo resets onto it.
  var st = window.scrollTo.bind(window);
  window.scrollTo = function (x, y) {
    st.apply(null, arguments);
    var m = document.getElementById('app');
    if (m) { var top = typeof x === 'object' && x ? x.top : y; if (typeof top === 'number') m.scrollTop = top; }
  };
  // 3. Theme switcher button in the sidebar: Violet -> DJ green -> Yellow, remembered in this browser.
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('themeBtn'); if (!b) return;
    function cur() { var t = root.dataset.theme || 'violet'; for (var i = 0; i < T.length; i++) if (T[i][0] === t) return i; return 0; }
    function label() { b.title = 'Theme: ' + T[cur()][1] + ' (click to change)'; }
    b.addEventListener('click', function () {
      var n = T[(cur() + 1) % T.length][0];
      if (n === 'violet') delete root.dataset.theme; else root.dataset.theme = n;
      try { localStorage.setItem('sc-theme', n); } catch (e) {}
      label();
    });
    label();
  });
})();
