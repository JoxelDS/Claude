import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("App crash:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", padding: "2rem",
          fontFamily: "sans-serif", background: "#1e1b4b", color: "#fff"
        }}>
          <div style={{
            background: "#fff", color: "#1e1b4b", borderRadius: 16,
            padding: "2rem", maxWidth: 480, width: "100%", textAlign: "center"
          }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚠️</div>
            <h2 style={{ margin: "0 0 0.5rem" }}>Something went wrong</h2>
            <p style={{ color: "#555", fontSize: "0.9rem", marginBottom: "1rem" }}>
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#1e1b4b", color: "#fff", border: "none",
                borderRadius: 8, padding: "0.75rem 2rem", fontSize: "1rem",
                cursor: "pointer"
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Smooth Engine ──────────────────────────────────────────────
   A permanent, app-wide smoothness layer. It watches the DOM and
   gives every card, list row, and panel a soft entrance the first
   time it appears or scrolls into view — automatically, including
   screens added in the future. Zero work per feature; honors
   prefers-reduced-motion; observers detach after animating so
   there is no lasting cost per element.
──────────────────────────────────────────────────────────────── */
(function smoothEngine() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const SELECTOR = [
    ".card", ".historyCard", ".fuItem", ".step", ".feat",
    ".recurringItem", ".worstLocation", ".flaggedLocation",
    ".themeCard", ".analysisStat", ".modalBox",
  ].join(",");

  const seen = new WeakSet();
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      io.unobserve(el);
      el.classList.add("sv-in");
      // Clean up the class once the animation finishes so styles stay inert
      el.addEventListener("animationend", () => el.classList.remove("sv-in"), { once: true });
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

  function attach(root) {
    if (!(root instanceof Element)) return;
    const targets = root.matches?.(SELECTOR) ? [root] : [];
    targets.push(...root.querySelectorAll?.(SELECTOR) ?? []);
    for (const el of targets) {
      if (seen.has(el)) continue;
      seen.add(el);
      io.observe(el);
    }
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) attach(n);
  });

  window.addEventListener("DOMContentLoaded", () => {
    attach(document.body);
    mo.observe(document.body, { childList: true, subtree: true });
  });
})();

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Register service worker for offline support + automatic update detection
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        // When a new SW is waiting to activate, show a reload prompt
        function promptReload(worker) {
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") {
              // New SW took over — show a non-blocking update banner
              const banner = document.createElement("div");
              banner.id = "sw-update-banner";
              banner.style.cssText = [
                "position:fixed;bottom:0;left:0;right:0;z-index:99999",
                "background:#2A295C;color:#fff;padding:0.75rem 1.25rem",
                "display:flex;align-items:center;justify-content:space-between;gap:12px",
                "font-family:sans-serif;font-size:0.9rem;box-shadow:0 -2px 12px rgba(0,0,0,0.3)",
              ].join(";");
              banner.innerHTML = `
                <span>A new version of the app is ready.</span>
                <button id="sw-reload-btn" style="background:#EE0000;color:#fff;border:none;border-radius:6px;padding:0.4rem 1rem;font-size:0.85rem;cursor:pointer;font-weight:600;">
                  Reload
                </button>
              `;
              document.body.appendChild(banner);
              document.getElementById("sw-reload-btn").addEventListener("click", () => {
                window.location.reload();
              });
            }
          });
        }

        if (reg.waiting) {
          // SW already waiting (page was already open during previous deploy)
          promptReload(reg.waiting);
        }
        reg.addEventListener("updatefound", () => {
          promptReload(reg.installing);
        });

        // Check for updates every 60 seconds while page is open
        setInterval(() => reg.update(), 60 * 1000);
      })
      .catch(() => {});
  });
}
