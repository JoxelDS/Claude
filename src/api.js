/* ══════════════════════════════════════════════════════════
   API Client — talks to the Express server for user accounts
   ══════════════════════════════════════════════════════════ */

const API_BASE = "/api";

let _accessToken = null;

// ── Token helpers ─────────────────────────────────────────

function setAccessToken(token) {
  _accessToken = token;
}

function clearAccessToken() {
  _accessToken = null;
}

async function authFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (_accessToken) headers["Authorization"] = `Bearer ${_accessToken}`;

  let res = await fetch(url, { ...options, headers, credentials: "include" });

  // If 401 (token expired), try refreshing once
  if (res.status === 401 && _accessToken) {
    const refreshed = await refreshToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${_accessToken}`;
      res = await fetch(url, { ...options, headers, credentials: "include" });
    }
  }

  return res;
}

async function refreshToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) { clearAccessToken(); return false; }
    const data = await res.json();
    setAccessToken(data.accessToken);
    return true;
  } catch {
    clearAccessToken();
    return false;
  }
}

// ── Auth endpoints ────────────────────────────────────────

export async function apiLogin(badge) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ badge }),
  });

  if (res.status === 403) {
    return { ok: false, reason: "pending" };
  }
  if (res.status === 401) {
    return { ok: false, reason: "not_found" };
  }
  if (!res.ok) {
    return { ok: false, reason: "error" };
  }

  const data = await res.json();
  setAccessToken(data.accessToken);
  return { ok: true, user: data.user };
}

export async function apiRegister(badge, name, department) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ badge, name, department }),
  });

  if (res.status === 409) {
    return { ok: false, reason: "exists" };
  }
  if (!res.ok) {
    return { ok: false, reason: "error" };
  }

  return { ok: true };
}

export async function apiLogout() {
  try {
    await authFetch(`${API_BASE}/auth/logout`, { method: "POST" });
  } catch { /* ignore */ }
  clearAccessToken();
}

export async function apiGetMe() {
  const res = await authFetch(`${API_BASE}/auth/me`);
  if (!res.ok) return null;
  return res.json();
}

// ── Admin endpoints ───────────────────────────────────────

export async function apiGetUsers() {
  const res = await authFetch(`${API_BASE}/admin/users`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.users || [];
}

export async function apiGetPendingUsers() {
  const res = await authFetch(`${API_BASE}/admin/users/pending`);
  if (!res.ok) return { pending: [], count: 0 };
  return res.json();
}

export async function apiApproveUser(id) {
  const res = await authFetch(`${API_BASE}/admin/users/${id}/approve`, {
    method: "POST",
  });
  return res.ok;
}

export async function apiDenyUser(id) {
  const res = await authFetch(`${API_BASE}/admin/users/${id}/deny`, {
    method: "POST",
  });
  return res.ok;
}

export async function apiChangeRole(id, role) {
  const res = await authFetch(`${API_BASE}/admin/users/${id}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  return res.ok;
}

export async function apiDeleteUser(id) {
  const res = await authFetch(`${API_BASE}/admin/users/${id}`, {
    method: "DELETE",
  });
  return res.ok;
}

export async function apiAddUser(badge, name, department, role) {
  const res = await authFetch(`${API_BASE}/admin/users`, {
    method: "POST",
    body: JSON.stringify({ badge, name, department, role: role || "inspector" }),
  });

  if (res.status === 409) {
    return { ok: false, reason: "exists" };
  }
  if (!res.ok) {
    return { ok: false, reason: "error" };
  }

  const data = await res.json();
  return { ok: true, user: data.user };
}

// ── Report endpoints ─────────────────────────────────────

export async function apiGetReports() {
  const res = await authFetch(`${API_BASE}/reports?limit=100`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.reports || [];
}

export async function apiCreateReport(report) {
  const res = await authFetch(`${API_BASE}/reports`, {
    method: "POST",
    body: JSON.stringify(report),
  });
  if (!res.ok) return { ok: false };
  const data = await res.json();
  return { ok: true, report: data.report };
}

export async function apiDeleteReport(id) {
  const res = await authFetch(`${API_BASE}/reports/${id}`, {
    method: "DELETE",
  });
  return res.ok;
}

export async function apiClearAllReports(reportIds) {
  const results = await Promise.allSettled(
    reportIds.map(id => authFetch(`${API_BASE}/reports/${id}`, { method: "DELETE" }))
  );
  return results.every(r => r.status === "fulfilled" && r.value.ok);
}

// ── Session restore ───────────────────────────────────────

export async function tryRestoreSession() {
  const refreshed = await refreshToken();
  if (!refreshed) return null;
  return apiGetMe();
}

export function hasActiveToken() {
  return !!_accessToken;
}
