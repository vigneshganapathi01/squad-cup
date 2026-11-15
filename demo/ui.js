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

// UI only: show the registration form (#/register) as a pop-up over the page.
// The form markup and its submit handling stay exactly as app.js renders them; this only adds a backdrop and a close button.
(function () {
  var CLOSE_TO = '#/overview';
  function isReg() { return location.hash === '#/register'; }
  function close() { if (isReg()) location.hash = CLOSE_TO; }
  function decorate() {
    // before the tournament starts (registration phase, no stages yet) hide the empty match/performer sections
    try { document.documentElement.classList.toggle('pre-start', typeof S !== 'undefined' && S && S.stages && S.stages.length === 0); } catch (e) {}
    var on = isReg();
    document.documentElement.classList.toggle('reg-popup', on);
    if (!on) return;
    var reg = document.querySelector('#app .reg'), card = reg && reg.querySelector('.card');
    if (!card) return;
    if (!reg.querySelector('.reg-backdrop')) {
      var bd = document.createElement('div');
      bd.className = 'reg-backdrop'; bd.setAttribute('aria-hidden', 'true');
      bd.addEventListener('click', close);
      reg.insertBefore(bd, reg.firstChild);
    }
    if (!card.querySelector('.reg-close')) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'reg-close'; b.setAttribute('aria-label', 'Close registration'); b.innerHTML = '&times;';
      b.addEventListener('click', close);
      card.insertBefore(b, card.firstChild);
      card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'Squad registration');
    }
  }
  // ---- Countdown: tick every second (adds a Secs box) and flip each number when it changes ----
  // Uses the same start time as app.js countdownCard(): the start date at 18:00 IST.
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function tick() {
    var cd = document.querySelector('#app .cd[data-cd]');
    if (!cd) return;
    if (cd.children.length === 3) {
      var s = document.createElement('div'); s.innerHTML = '<b>00</b><span>Secs</span>'; cd.appendChild(s);
    }
    var t = new Date(cd.getAttribute('data-cd') + 'T18:00:00+05:30') - Date.now();
    if (!(t > 0)) return;
    var vals = [Math.floor(t / 864e5), pad(Math.floor(t / 36e5) % 24), pad(Math.floor(t / 6e4) % 60), pad(Math.floor(t / 1e3) % 60)];
    var boxes = cd.querySelectorAll(':scope > div > b');
    for (var i = 0; i < boxes.length && i < 4; i++) {
      var v = String(vals[i]);
      if (boxes[i].textContent !== v) {
        boxes[i].textContent = v;
        boxes[i].classList.remove('flip'); void boxes[i].offsetWidth; boxes[i].classList.add('flip');
      }
    }
  }
  setInterval(tick, 1000);

  // ---- Promo slot under the countdown (placeholder ad: official Free Fire trailer from YouTube) ----
  var PROMO_ID = 'Jq2aIyjWWlQ'; // "Booyah Pass S47 - Stellar Scorpions | Free Fire Official" (Garena Free Fire Global)
  function promo() {
    var cd = document.querySelector('#app .cd[data-cd]');
    var host = cd && cd.closest('.grid');
    if (!host || (host.nextElementSibling && host.nextElementSibling.classList.contains('promo'))) return;
    var box = document.createElement('div');
    box.className = 'card promo';
    box.innerHTML = '<div class="row between"><div class="eyebrow">Featured · Free Fire</div><span class="promo-tag">Ad</span></div>' +
      '<div class="promo-frame"><iframe src="https://www.youtube-nocookie.com/embed/' + PROMO_ID + '?rel=0&modestbranding=1&playsinline=1"' +
      ' title="Free Fire official trailer" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"' +
      ' allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>';
    host.parentNode.insertBefore(box, host.nextSibling);
  }
  var _decorate = decorate;
  decorate = function () { _decorate(); tick(); promo(); };

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isReg()) close(); });
  window.addEventListener('hashchange', function () { setTimeout(decorate, 0); });
  document.addEventListener('DOMContentLoaded', function () {
    var app = document.getElementById('app');
    if (app) new MutationObserver(decorate).observe(app, { childList: true });
    decorate();
  });
})();
