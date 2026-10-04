// Applies the saved theme before React mounts, so the page never flashes the
// wrong colors. Loaded as a blocking script from index.html; kept as a file
// rather than inline so the Content-Security-Policy can stay script-src 'self'.
(function () {
  var t = 'ford-racing';
  try { t = localStorage.getItem('theme') || t; } catch (e) { /* storage blocked */ }
  var validThemes = ['ford-racing', 'fordraptorforum', 'raptor-assault'];
  if (validThemes.indexOf(t) === -1) t = 'ford-racing';
  document.documentElement.dataset.theme = t;
  var dark = false;
  try { dark = t === 'fordraptorforum' || localStorage.getItem('darkMode') === 'true'; } catch (e) { dark = t === 'fordraptorforum'; }
  if (dark) document.documentElement.classList.add('dark');
})();
