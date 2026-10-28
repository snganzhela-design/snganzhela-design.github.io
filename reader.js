/* reader.js — читалка публикаций (порт prototype-v4/reader.js, OWNER-5): диалог на странице, история #read=<slug>, «Назад» закрывает.
   Грузится при первом открытии (src/components/Controllers.tsx → ReaderController); стили читалки — здесь же (не блокируют отрисовку).
   PDF.js 3.11.174 из /pdfjs/ (не /vendor/: nginx отдаёт 404 сканерам /vendor/) — при первом открытии PDF: сначала pdf.worker.min.js, затем pdf.min.js (без отдельного Worker).
   Страницы — canvas, лениво (IntersectionObserver), по ширине колонки, devicePixelRatio не больше 2.
   Данные публикации — атрибуты ссылки: data-v4-read, data-v4-pdf, data-doi, data-title, data-cat, data-src.
   Подписи — JSON в data-i18n диалога (content/{en,ru}/site.yaml → reader). Без сети, без alert/confirm.
   Доработки против эталона: фокус возвращается на «⋯» после любого пункта меню (и Download/Publisher);
   «Page» на телефоне скрыт только визуально — экранный диктор читает «Page N of M». */
(function () {
  'use strict';
  var reader = document.getElementById('v4-reader');
  if (!reader || window.__v4reader) return;
  var T = {};
  try { T = JSON.parse(reader.getAttribute('data-i18n') || '{}'); } catch (e) { /* подписи по умолчанию */ }
  function t(k, d) { return T[k] || d; }
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function closest(el, sel) { return el && el.closest ? el.closest(sel) : null; }
  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
  function focusables(root) { return all(FOCUSABLE, root).filter(function (el) { return visible(el) && !closest(el, '[inert]'); }); }
  function inertAround(el) {
    for (var node = el; node && node.parentElement && node !== document.body; node = node.parentElement) {
      Array.prototype.forEach.call(node.parentElement.children, function (sib) {
        if (sib === node || sib.inert || /^(SCRIPT|STYLE|LINK|META|TEMPLATE)$/.test(sib.tagName)) return;
        sib.inert = true; sib.setAttribute('data-v4-inert', '');
      });
    }
  }
  function releaseInert() { all('[data-v4-inert]').forEach(function (el) { el.inert = false; el.removeAttribute('data-v4-inert'); }); }
  function trap(e, list) {
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  var st = document.createElement('style');
  st.setAttribute('data-v4-reader', '');
  st.textContent = "body.v4-reading { overflow: hidden; }\n.v4-reader { position: fixed; inset: 0; z-index: 10001; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .5); }\n.v4-reader[hidden] { display: none; }\n.v4-reader-box { display: flex; flex-direction: column; width: min(1100px, calc(100% - 48px)); height: 92vh; overflow: hidden; background: var(--v3-white-1); border-radius: var(--ig-r); box-shadow: 0 24px 60px -20px rgba(0, 0, 0, .35); }\n.v4-reader-bar { position: sticky; top: 0; z-index: 1; display: flex; flex: none; align-items: center; gap: 8px; min-height: 56px; padding: 6px 12px; background: var(--v3-white-1); border-bottom: 1px solid var(--ig-line); }\n.v4-reader-title { flex: 1 1 auto; min-width: 0; margin: 0; overflow: hidden; color: var(--ig-ink); font: 600 16px/1.3 var(--ff-open-sans); letter-spacing: 0; white-space: nowrap; text-overflow: ellipsis; }\n.v4-rd-count { flex: none; color: var(--ig-text); font: 400 14px/1 var(--ff-open-sans); font-variant-numeric: tabular-nums; white-space: nowrap; }\n.v4-rd-zoom { display: flex; flex: none; gap: 4px; }\n.v4-reader-bar :is(button, a) { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 6px; min-width: 44px; min-height: 44px; padding: 0 12px; margin: 0; color: #006f99; background: var(--v3-white-1); border: 1px solid var(--ig-line); border-radius: var(--ig-r-btn); font: 600 14px/1 var(--ff-open-sans); text-decoration: none; white-space: nowrap; cursor: pointer; }\n.v4-reader-bar :is(button, a):hover { color: #005f85; background: var(--v3-gray-3); border-color: var(--v3-blue-3); }\n.v4-reader-bar .v4-rd-close { padding: 0; color: var(--v3-dark-7); border-color: transparent; font: 400 28px/1 var(--ff-open-sans); }\n.v4-reader-bar svg { display: none; width: 20px; height: 20px; }\n.v4-reader-bar [hidden] { display: none !important; }\n.v4-reader-body { flex: 1 1 auto; overflow: auto; padding: 16px; background: var(--v3-white-6); }\n.v4-page { width: max-content; margin: 0 auto 16px; background: var(--v3-white-1); box-shadow: 0 2px 10px rgba(0, 0, 0, .12); }\n.v4-page canvas { display: block; }\n.v4-sum { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; max-width: 640px; margin: 24px auto; padding: clamp(20px, 3vw, 32px); background: var(--v3-white-1); border: 1px solid var(--ig-line); border-radius: var(--ig-r); }\n.v4-sum-cat { padding: 4px 10px; color: #006f99; border: 1px solid var(--ig-line); border-radius: 6px; font: 600 14px/1.4 var(--ff-open-sans); letter-spacing: .04em; text-transform: uppercase; }\n.v4-sum-title { color: var(--ig-ink); font: 600 20px/1.35 var(--ff-open-sans); }\n.v4-sum p { margin: 0; color: var(--ig-text); font: 400 16px/1.6 var(--ff-open-sans); }\n.v4-reader :is(p, li) { max-width: 56ch; }\n.v4-sum-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }\n.v4-c-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }\n.v4-reader-bar :is(.v4-rd-more, .v4-rd-menu) { display: none; }\n@media (max-width: 767px) {\n  .v4-reader-box { width: 100%; height: 100%; border-radius: 0; }\n  .v4-reader-bar { flex-wrap: nowrap; gap: 6px; min-height: 56px; padding: 5px 8px; }\n  .v4-reader-bar :is(.v4-rd-zoom, .v4-rd-dl, .v4-rd-pub) { display: none; }\n  .v4-c-p { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }\n  .v4-c-of { font-size: 0; }\n  .v4-c-of::before { content: \"/\"; margin: 0 .2em; font-size: 14px; }\n  .v4-reader-bar .v4-rd-more:not([hidden]) { display: inline-flex; padding: 0; font: 600 22px/1 var(--ff-open-sans); }\n  .v4-reader-bar .v4-rd-menu:not([hidden]) { position: absolute; top: calc(100% + 4px); right: 8px; z-index: 3; display: flex; flex-direction: column; min-width: 200px; padding: 6px; background: var(--v3-white-1); border: 1px solid var(--ig-line); border-radius: var(--ig-r-btn); box-shadow: 0 12px 28px -12px rgba(0, 0, 0, .35); }\n  .v4-rd-menu [role=\"menuitem\"] { justify-content: flex-start; width: 100%; min-height: 44px; padding: 0 12px; border: 0; border-radius: 6px; }\n  .v4-reader-body { padding: 8px; }\n}";
  document.head.appendChild(st);
  var q = function (s) { return reader.querySelector(s); };
  var box = q('.v4-reader-body'), title = q('.v4-reader-title'), count = q('.v4-rd-count'), dl = q('.v4-rd-dl'), pub = q('.v4-rd-pub'), zoomBox = q('.v4-rd-zoom'),
    more = q('.v4-rd-more'), menu = q('.v4-rd-menu'), miDl = q('.v4-mi-dl'), miPub = q('.v4-mi-pub');
  var opener = null, pushed = false, token = 0, pdf = null, pages = [], w1 = 0, h1 = 0, zoom = 0, io = null, libP = null;
  function mk(tag, cls, text, attrs) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; for (var k in (attrs || {})) n.setAttribute(k, attrs[k]); return n; }
  function meta(a) {
    return { slug: a.getAttribute('data-v4-read'), pdf: a.getAttribute('data-v4-pdf') || '', doi: a.getAttribute('data-doi') || a.getAttribute('href'),
      title: a.getAttribute('data-title') || '', cat: a.getAttribute('data-cat') || '', src: a.getAttribute('data-src') || '' };
  }
  // Цели аналитики (HANDOVER.md, раздел 15): отправляет общий хелпер сайта window.igGoal (ConsentBanner.tsx) — есть, только
  // если ID счётчика заполнен; без согласия он ничего не отправляет. Ссылки читалки несут data-goal, параметр ставится при открытии.
  function doiId(m) { return String(m.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//, ''); }
  function load(src) { return new Promise(function (ok, no) { var s = mk('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  function lib() {
    if (!libP) libP = load('/pdfjs/pdf.worker.min.js').then(function () { return load('/pdfjs/pdf.min.js'); }).then(function () {
      var L = window.pdfjsLib; L.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js'; return L;
    }).catch(function (e) { libP = null; throw e; });
    return libP;
  }
  function fit() { return Math.max(0.3, (box.clientWidth - (window.innerWidth < 768 ? 16 : 32)) / w1); }
  function scale() { return zoom ? zoom / 100 : fit(); }
  function sizeAll() { var s = scale(); pages.forEach(function (p) { p.c.style.width = Math.floor(w1 * s) + 'px'; p.c.style.height = Math.floor((p.h || h1) * s) + 'px'; }); }
  function draw(p, tk) {
    var s = scale();
    if (p.busy || p.done === s) return;
    p.busy = 1;
    pdf.getPage(p.n).then(function (pg) {
      if (tk !== token) return;
      var vp = pg.getViewport({ scale: s }), r = Math.min(2, window.devicePixelRatio || 1), c = p.c;
      p.h = vp.height / s; c.width = Math.floor(vp.width * r); c.height = Math.floor(vp.height * r);
      c.style.width = Math.floor(vp.width) + 'px'; c.style.height = Math.floor(vp.height) + 'px';
      return pg.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: r !== 1 ? [r, 0, 0, r, 0, 0] : null }).promise.then(function () { p.done = s; });
    }).catch(function () { /* страница не отрисовалась — пустой лист, документ доступен по «Download PDF» */ })
      .then(function () { p.busy = 0; if (tk === token && p.vis && p.done !== scale()) draw(p, tk); });
  }
  function observe() {
    if (io) io.disconnect();
    io = new IntersectionObserver(function (en) { en.forEach(function (e) { var p = e.target._p; p.vis = e.isIntersecting; if (p.vis) draw(p, token); }); }, { root: box, rootMargin: '150% 0px' });
    pages.forEach(function (p) { io.observe(p.c); });
  }
  function counter() {
    if (!pages.length) return;
    var top = box.getBoundingClientRect().top, n = 1;
    pages.forEach(function (p) { if (p.c.getBoundingClientRect().top - top < box.clientHeight / 2) n = p.n; });
    count.textContent = '';
    count.appendChild(mk('span', 'v4-c-p', t('page', 'Page') + ' '));
    count.appendChild(document.createTextNode(String(n)));
    count.appendChild(mk('span', 'v4-c-of', ' ' + t('of', 'of') + ' '));
    count.appendChild(document.createTextNode(String(pages.length)));
  }
  box.addEventListener('scroll', function () { if (pages.length) window.requestAnimationFrame(counter); });
  function actions(list) { var a = mk('div', 'v4-sum-actions'); list.forEach(function (x) { a.appendChild(x); }); return a; }
  function summary(m) {
    var s = mk('div', 'v4-sum');
    if (m.cat) s.appendChild(mk('span', 'v4-sum-cat', m.cat));
    s.appendChild(mk('p', 'v4-sum-title', m.title));
    if (m.src) s.appendChild(mk('p', '', m.src));
    s.appendChild(mk('p', '', t('full_text', 'The full text is available from the publisher.')));
    s.appendChild(actions([mk('a', 'btn-primary', t('read_at', 'Read at publisher ↗'), { href: m.doi, target: '_blank', rel: 'noopener', 'data-goal': 'doi_outbound', 'data-goal-param': doiId(m) }),
      mk('a', 'btn-outline', t('request', 'Request the full text'), { href: t('request_href', '/contact-us/#question') })]));
    box.appendChild(s);
  }
  function fail(m) {
    reset(); count.textContent = '';
    var s = mk('div', 'v4-sum'), list = [];
    s.appendChild(mk('p', 'v4-sum-title', t('failed', 'The document could not be displayed.')));
    if (m.pdf) list.push(mk('a', 'btn-primary', t('download', 'Download PDF'), { href: m.pdf, download: m.slug + '.pdf', 'data-goal': 'doc_download', 'data-goal-param': 'pub-' + m.slug }));
    list.push(mk('a', 'btn-outline', t('publisher', 'Publisher ↗'), { href: m.doi, target: '_blank', rel: 'noopener', 'data-goal': 'doi_outbound', 'data-goal-param': doiId(m) }));
    s.appendChild(actions(list)); box.appendChild(s);
  }
  function showPdf(m, tk) {
    box.appendChild(mk('p', 'v4-rd-wait', t('loading', 'Loading the document…')));
    lib().then(function (L) { return L.getDocument({ url: m.pdf, isEvalSupported: false }).promise; }).then(function (doc) {
      if (tk !== token) { doc.destroy(); return; }
      pdf = doc;
      return doc.getPage(1).then(function (pg) {
        var vp = pg.getViewport({ scale: 1 }), n = doc.numPages;
        w1 = vp.width; h1 = vp.height; box.textContent = '';
        for (var i = 1; i <= n; i++) {
          var c = mk('canvas', '', '', { role: 'img', 'aria-label': t('page_aria', 'Page {n} of {m}').replace('{n}', i).replace('{m}', n) }), w = mk('div', 'v4-page'), p = { n: i, c: c, done: 0 };
          c._p = p; w.appendChild(c); box.appendChild(w); pages.push(p);
        }
        sizeAll(); observe(); counter();
      });
    }).catch(function () { if (tk === token) fail(m); });
  }
  function setZoom(z) { zoom = z; if (!pdf) return; sizeAll(); observe(); counter(); }
  q('.v4-rd-fit').addEventListener('click', function () { setZoom(0); });
  function zoomIn() { var c = zoom || Math.round(fit() * 100); setZoom(Math.min(200, (Math.floor(c / 25) + 1) * 25)); }
  function zoomOut() { var c = zoom || Math.round(fit() * 100); setZoom(Math.max(50, (Math.ceil(c / 25) - 1) * 25)); }
  q('.v4-rd-in').addEventListener('click', zoomIn);
  q('.v4-rd-out').addEventListener('click', zoomOut);
  /* меню «⋯» (телефон): Enter / пробел открывают, Esc и клик вне — закрывают, фокус возвращается на «⋯» (после любого пункта) */
  function closeMenu() { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); }
  more.addEventListener('click', function () {
    var opening = menu.hidden;
    menu.hidden = !opening; more.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) menu.querySelector('[role="menuitem"]').focus();
  });
  menu.addEventListener('click', function (e) {
    var it = closest(e.target, '[role="menuitem"]');
    if (!it) return;
    if (it.classList.contains('v4-mi-fit')) setZoom(0); else if (it.classList.contains('v4-mi-in')) zoomIn(); else if (it.classList.contains('v4-mi-out')) zoomOut();
    closeMenu();
    setTimeout(function () { more.focus(); }, 0);
  });
  menu.addEventListener('keydown', function (e) {
    var items = all('[role="menuitem"]', menu), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  reader.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target) && !more.contains(e.target)) closeMenu(); }, true);
  function reset() { if (io) { io.disconnect(); io = null; } if (pdf) { try { pdf.destroy(); } catch (e) { /* уже закрыт */ } pdf = null; } pages = []; box.textContent = ''; box.scrollTop = 0; }
  function open(a, push) {
    var m = meta(a);
    token++; reset(); zoom = 0;
    opener = push ? a : null;
    title.textContent = m.title; pub.href = m.doi; miPub.href = m.doi; dl.hidden = zoomBox.hidden = more.hidden = !m.pdf; count.textContent = '';
    pub.setAttribute('data-goal-param', doiId(m)); miPub.setAttribute('data-goal-param', doiId(m));
    dl.setAttribute('data-goal-param', 'pub-' + m.slug); miDl.setAttribute('data-goal-param', 'pub-' + m.slug);
    if (window.igGoal) window.igGoal('reader_open', { value: m.slug });
    closeMenu();
    if (m.pdf) { dl.href = m.pdf; dl.setAttribute('download', m.slug + '.pdf'); miDl.href = m.pdf; miDl.setAttribute('download', m.slug + '.pdf'); }
    reader.hidden = false; document.body.classList.add('v4-reading'); inertAround(reader);
    q('.v4-rd-close').focus();
    if (push) { history.pushState({ v4read: m.slug }, '', location.pathname + location.search.replace(/([?&])read=[\w-]+&?/, '$1').replace(/[?&]$/, '') + '#read=' + m.slug); pushed = true; }
    if (m.pdf) showPdf(m, token); else summary(m);
  }
  function close(fromHistory) {
    if (reader.hidden) return;
    token++; reset(); closeMenu(); reader.hidden = true; document.body.classList.remove('v4-reading'); releaseInert();
    if (!fromHistory) {
      if (pushed) history.back();
      else if (/^#read=/.test(location.hash) || /[?&]read=/.test(location.search)) history.replaceState(null, '', location.pathname + location.search.replace(/([?&])read=[\w-]+&?/, '$1').replace(/[?&]$/, ''));
    }
    pushed = false;
    if (opener && document.contains(opener)) opener.focus();
    opener = null;
  }
  function wanted() { var m = location.hash.match(/^#read=([\w-]+)$/) || location.search.match(/[?&]read=([\w-]+)/); return m ? document.querySelector('a[data-v4-read="' + m[1] + '"]') : null; }
  q('.v4-rd-close').addEventListener('click', function () { close(false); });
  reader.addEventListener('click', function (e) { if (e.target === reader) close(false); });
  document.addEventListener('keydown', function (e) {
    if (reader.hidden) return;
    if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); closeMenu(); more.focus(); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(false); } else if (e.key === 'Tab') trap(e, focusables(reader));
  });
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = closest(e.target, 'a[data-v4-read]');
    if (!a) return;
    e.preventDefault(); open(a, true);
  });
  window.addEventListener('popstate', function () { var a = wanted(); if (a) { if (!reader.hidden) close(true); open(a, false); } else close(true); });
  window.addEventListener('resize', function () { if (pdf && !zoom) { sizeAll(); observe(); } });
  window.__v4reader = { open: open, fromHash: function () { var a = wanted(); if (a) { if (!reader.hidden) close(true); open(a, false); } } };
})();
