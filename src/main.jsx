import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import LanguageFab from "./LanguageFab.jsx";

// v487 — Google Translate replaces text nodes with its own <font> wrappers,
// leaving React holding detached nodes. The next re-render (filtering the
// history, switching chips) then throws NotFoundError from removeChild /
// insertBefore ("The object can not be found here" on Safari), the boundary
// takes over and it looks like a logout. Standard guard: when the child is
// no longer ours, do nothing instead of throwing (facebook/react#11538).
(function guardDomAgainstTranslator() {
  if (typeof Node !== "function" || !Node.prototype) return;
  const origRemove = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) { if (console && console.debug) console.debug("[dom] skipped removeChild of a node the page translator moved"); return child; }
    return origRemove.apply(this, arguments);
  };
  const origInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, ref) {
    if (ref && ref.parentNode !== this) { if (console && console.debug) console.debug("[dom] skipped insertBefore next to a node the page translator moved"); return newNode; }
    return origInsert.apply(this, arguments);
  };
})();

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
            <p style={{ color: "#777", fontSize: "0.8rem", marginBottom: "1rem" }}>
              You are still signed in — reloading brings you back where you were. Your draft is saved.
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
    <LanguageFab />
  </ErrorBoundary>
);

// v460 — the update banner lives at the BOTTOM (above the report's sticky
// Save bar when it is showing) so it never hides under the fixed header or
// the phone notch, and it can be put off with "Later" while a report is in
// progress. The draft autosaves, so Reload is safe; the text says so.
function showUpdateBanner() {
  if (document.getElementById("sw-update-banner")) return;
  const banner = document.createElement("div");
  banner.id = "sw-update-banner";
  banner.className = "swUpdateBanner";
  banner.innerHTML = `
    <div class="swUpdateText"><b>⬆ New version ready</b><span>Finish and save what you are doing, then reload. Your draft is saved automatically.</span></div>
    <div class="swUpdateBtns">
      <button type="button" id="sw-later-btn" class="swUpdateLater">Later</button>
      <button type="button" id="sw-reload-btn" class="swUpdateReload">Reload now</button>
    </div>`;
  document.body.appendChild(banner);
  const place = () => {
    const bar = document.querySelector(".stickyActionBar");
    banner.style.bottom = bar ? `${bar.getBoundingClientRect().height}px` : "0px";
  };
  place();
  const mo = new MutationObserver(place);
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", place);
  document.getElementById("sw-reload-btn").addEventListener("click", () => { try { window.__sdxFlushDraft && window.__sdxFlushDraft(); } catch {} window.location.reload(); });
  document.getElementById("sw-later-btn").addEventListener("click", () => {
    banner.remove(); mo.disconnect(); window.removeEventListener("resize", place);
    // come back in 10 minutes — the update is still waiting
    setTimeout(showUpdateBanner, 10 * 60 * 1000);
  });
}
window.__sdxShowUpdateBanner = showUpdateBanner; // harness hook

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
            if (worker.state === "activated") showUpdateBanner();
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
