/* Отложенная загрузка JS Next (scripts/postbuild.mjs, по умолчанию; IG_DEFER_JS=0 — выключить).
   Чанки подключаются при первом действии пользователя (касание, клавиша, прокрутка) или через 1,5 с после load.
   Нажатие на интерактивный элемент до гидрации (бургер, «Read More», кнопка видео, «Copy», кнопки согласия, вопросы FAQ, фильтр Education, карточки публикаций, «Я — специалист»)
   запоминается и повторяется само, как только React закончит гидрацию (событие ig-hydrated) — второе нажатие не нужно. */
(function () {
  var s = document.currentScript;
  var list = ((s && s.getAttribute('data-chunks')) || '').split(' ').filter(Boolean);
  var INTERACTIVE = '.burger, .open-modal, .v4-play, .v3-copy, .ig-consent button, .cookie-settings, .accordion-slot, .programs-btn[data-filter], a[data-v4-read], .hcp-confirm';
  var EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
  var loaded = false, hydrated = false, pending = null;
  function go() {
    if (loaded) return; loaded = true;
    EVENTS.forEach(function (e) { window.removeEventListener(e, go, true); });
    list.forEach(function (u) { var e = document.createElement('script'); e.src = u; e.async = true; document.body.appendChild(e); });
  }
  EVENTS.forEach(function (e) { window.addEventListener(e, go, { capture: true, passive: true }); });
  // клик до гидрации: запомнить цель и не дать ему пропасть
  document.addEventListener('click', function (e) {
    if (hydrated) return;
    var t = e.target && e.target.closest ? e.target.closest(INTERACTIVE) : null;
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    pending = t; go();
  }, true);
  // Enter / пробел на элементах-«кнопках» без <button> (вопросы FAQ) до гидрации — как нажатие
  document.addEventListener('keydown', function (e) {
    if (hydrated || (e.key !== 'Enter' && e.key !== ' ')) return;
    var t = e.target && e.target.closest ? e.target.closest('.accordion-slot') : null;
    if (!t) return;
    e.preventDefault(); pending = t; go();
  }, true);
  window.addEventListener('ig-hydrated', function () {
    hydrated = true;
    if (pending && document.contains(pending)) { var t = pending; pending = null; setTimeout(function () { t.click(); }, 0); }
  });
  function later() { setTimeout(go, 1500); }
  // читалка по адресу (#read= / ?read=): JS сразу, без ожидания
  if (/[#?&]read=[\w-]+/.test(location.href)) go();
  if (document.readyState === 'complete') later(); else window.addEventListener('load', later);
})();
