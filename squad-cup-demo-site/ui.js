// UI only (from the ui-work branch). A file instead of an inline script so the site's Content-Security-Policy allows it.
// Loaded in <head>, before app.js. The theme switcher was removed on 15 Nov 2026: the site always uses the Violet theme.
(function () {
  // On desktop the content scrolls inside the frame (#app), so mirror the app's window.scrollTo resets onto it.
  var st = window.scrollTo.bind(window);
  window.scrollTo = function (x, y) {
    st.apply(null, arguments);
    var m = document.getElementById('app');
    if (m) { var top = typeof x === 'object' && x ? x.top : y; if (typeof top === 'number') m.scrollTop = top; }
  };
})();
