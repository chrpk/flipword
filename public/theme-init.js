// Apply the saved theme before first paint to avoid a flash. A file rather than an inline script, so the
// Content-Security-Policy in _headers can forbid inline scripts.
try {
  var pref = localStorage.getItem("flipword.theme") || "system";
  var dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch {}
