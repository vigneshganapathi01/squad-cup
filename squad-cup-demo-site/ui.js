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
  // Admin sidebar height = the frame's inner height (greeting top to frame bottom), kept in --side-h for app.css.
  function sideH() {
    var m = document.getElementById('app');
    if (!m) return;
    var cs = getComputedStyle(m);
    var h = m.clientHeight - parseFloat(cs.paddingTop) - Math.min(parseFloat(cs.paddingBottom), 18);
    if (h > 200) document.documentElement.style.setProperty('--side-h', h + 'px');
  }
  window.addEventListener('resize', sideH);
  document.addEventListener('DOMContentLoaded', sideH);
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
  // ---- Hero countdown: move the countdown into the hero stats row (Prize | Slots | Starts in) ----
  // Matches played / Total kills are always 0 before the start, so the countdown takes their place.
  function heroCd() {
    var stats = document.querySelector('#app .th-stats');
    var cd = document.querySelector('#app .grid.ov .cd[data-cd]');
    var has = !!document.querySelector('#app .th-cd');
    if (stats && cd && !has) {
      var card = cd.closest('.card');
      var date = card && card.querySelector('.small.muted');
      var box = document.createElement('div');
      box.className = 'th-cd';
      box.innerHTML = '<div class="th-cd-l"><b>Starts in</b><span>' + (date ? date.textContent : '') + '</span></div>';
      box.appendChild(cd);
      stats.appendChild(box);
      stats.classList.add('has-cd');
      if (card) card.remove();
      has = true;
    }
    document.documentElement.classList.toggle('hero-cd', has);
  }
  // ---- Before the start: overview layout under the tabs (from the owner's sketch) ----
  //   [ Tournament overview        ][ Organiser & sponsors ]
  //   [ About the organiser (full width)                   ]
  //   [ Ad banner (wide, 8:3)                              ]
  // Placeholder copy below is UI-only until the logic side adds real fields (sponsors, about text) to Settings.
  var ABOUT = 'A community esports organiser running Free Fire tournaments for Indian squads: fair rooms, '
    + 'published points tables and quick payouts. Room IDs and passwords go out on WhatsApp before each match.';
  var SPONSOR_SLOTS = 3;
  var RULEBOOK = 'docs/rulebook.html'; // generated from Don_Justice_General_Rules_GFF_Latin_W05.docx
  var AD = {
    eyebrow: 'Garena Free Fire',
    title: 'New season is live',
    sub: 'Watch the latest official Free Fire trailer.',
    cta: 'Watch trailer',
    href: 'https://www.youtube.com/watch?v=Jq2aIyjWWlQ' // "Booyah Pass S47 - Stellar Scorpions | Free Fire Official" (Garena Free Fire Global)
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function day(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
  function promo() {
    var col = document.querySelector('#app .th-cd') && document.querySelector('#app .grid.ov>div:first-child');
    if (!col || (col.firstElementChild && col.firstElementChild.classList.contains('ov-pre'))) return;
    var st = (typeof S !== 'undefined' && S && S.settings) || {};
    var org = st.organiser || 'Organiser';
    var facts = [
      ['Game', 'Free Fire · Squad (4 players)'],
      ['Teams', (st.slots || '—') + ' slots'],
      ['Entry', 'Free'],
      ['Prize pool', st.prize || 'Free entry'],
      ['Registration closes', day(st.regCloses)],
      ['Starts', day(st.startDate) + ' · 6:00 PM IST']
    ];
    var box = document.createElement('div');
    box.className = 'ov-pre';
    box.innerHTML =
      '<div class="ov-row">' +
        '<div class="ov-left">' +
        '<section class="card ov-card"><h3 class="ov-h">Tournament overview</h3>' +
          '<p class="ov-lead">' + esc(st.name || '') + ' is a free-to-enter Free Fire squad tournament. Register your team of four, '
            + 'play the group stages and fight through to the final.</p>' +
          '<dl class="ov-facts">' + facts.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') + '</dl>' +
        '</section>' +
        '<section class="card ov-rules"><div class="ov-rules-h"><span class="ov-rules-t"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm4 18H6V4h7v5h5zM8 12h8v2H8zm0 4h8v2H8zm0-8h3v2H8z"/></svg>Rules &amp; Regulations</span><span class="ov-rules-k">Standard regulations</span></div>' +
          '<div class="ov-rules-b"><p>The official rulebook has been published for this tournament. Review the code of conduct, tiebreakers, device and fair-play rules, and the point system:</p>' +
          '<a class="btn ghost ov-rules-btn" href="' + RULEBOOK + '" target="_blank" rel="noopener">Access official rulebook <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg></a></div>' +
        '</section>' +
        '</div>' +
        '<section class="card ov-card ov-org"><h3 class="ov-h">Organiser &amp; sponsors</h3>' +
          '<div class="ov-org-main"><img src="art/dj-esports.webp" alt=""><div><span>Organised by</span><b>' + esc(org) + '</b></div></div>' +
          '<div class="ov-sub">Sponsors</div>' +
          '<div class="ov-sponsors">' + Array(SPONSOR_SLOTS + 1).join('<div class="ov-slot">Sponsor slot</div>') + '</div>' +
          '<p class="ov-note">Sponsor this tournament: contact the organiser.</p>' +
        '</section>' +
      '</div>' +
      '<section class="card ov-card ov-about"><h3 class="ov-h">About ' + esc(org) + '</h3>' +
        '<div class="ov-about-in"><img src="art/dj-esports.webp" alt=""><p>' + esc(ABOUT) + '</p></div>' +
        '<div class="ov-tags"><span>Free Fire</span><span>India</span><span>Squad tournaments</span><span>Community</span></div>' +
      '</section>' +
      '';
    // The ad spot: the admin's ads (Admin → Ads, drawn by app.js under the header) move here; with no ads, the placeholder.
    var mine = document.querySelector('#app > .ads');
    if (mine) { mine.classList.add('in-ov'); box.appendChild(mine); }
    else { var ph = document.createElement('div'); ph.innerHTML = '<a class="ov-ad" href="' + AD.href + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(AD.title + ': ' + AD.cta) + ' (opens YouTube)">' +
  '<span class="ov-ad-tag">Ad</span>' +
        '<span class="ov-ad-in"><span class="ov-ad-eb">' + esc(AD.eyebrow) + '</span><span class="ov-ad-t">' + esc(AD.title) + '</span>' +
        '<span class="ov-ad-s">' + esc(AD.sub) + '</span><span class="btn small ov-ad-cta">' + esc(AD.cta) + ' ↗</span></span>' +
      '</a>'; box.appendChild(ph.firstChild); }
    col.insertBefore(box, col.firstChild);
  }
  var _decorate = decorate;
  decorate = function () { _decorate(); heroCd(); tick(); promo(); };

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isReg()) close(); });
  window.addEventListener('hashchange', function () { setTimeout(decorate, 0); });
  document.addEventListener('DOMContentLoaded', function () {
    var app = document.getElementById('app');
    if (app) new MutationObserver(decorate).observe(app, { childList: true });
    decorate();
  });
})();
