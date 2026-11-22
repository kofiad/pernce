// Features: tabs (WAI-ARIA tablist, roving tabindex) over panels that each
// hold an accordion (one item open at a time). Without this script the first
// tab and its first item are already open; nothing else here is needed.
(function () {
  var tabs = [].slice.call(document.querySelectorAll('[role="tab"]'));
  if (!tabs.length) return;
  function openItem(panel, index) {
    [].forEach.call(panel.querySelectorAll('.acc-i'), function (item, i) {
      var on = i === index;
      item.classList.toggle('on', on);
      item.querySelector('.acc-t').setAttribute('aria-expanded', on);
      item.querySelector('.acc-b').hidden = !on;
    });
  }
  function select(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle('on', on);
      panel.hidden = !on;
      if (on) openItem(panel, 0);
    });
    if (focus) tab.focus();
    else tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { select(tab, false); });
    tab.addEventListener('keydown', function (e) {
      var to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(tabs[(to + tabs.length) % tabs.length], true);
    });
  });
  [].forEach.call(document.querySelectorAll('.fpanel'), function (panel) {
    [].forEach.call(panel.querySelectorAll('.acc-t'), function (btn, i) {
      btn.addEventListener('click', function () { openItem(panel, i); });
    });
  });
})();
