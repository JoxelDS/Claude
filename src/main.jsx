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

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Register service worker for offline caching + faster repeat loads
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`
    ).catch(() => {});
  });
}
