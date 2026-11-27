(function () {
  try {
    var mode = localStorage.getItem('momo-theme-mode') || 'auto';
    var resolved = localStorage.getItem('momo-theme-resolved');
    var dark = mode === 'dark' || (mode === 'auto' && (resolved ? resolved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches));
    var theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0b0b0b' : '#f2f2f2');
  } catch (error) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
