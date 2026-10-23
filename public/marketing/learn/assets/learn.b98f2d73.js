// SDX Inspect · Learn — progress, quizzes, certificate, chapters. No libraries, no network.
(() => {
  document.documentElement.classList.add("js");
  const KEY = "learn.sdx.v1";
  const LESSONS = (document.body.dataset.lessons || "").split(",").filter(Boolean);
  const ROLES = (document.body.dataset.roles || "").split(",").filter(Boolean);
  const T = JSON.parse(document.getElementById("learn-i18n")?.textContent || "{}");
  const PASS = 4;
  let mem = null;
  const load = () => { try { const s = localStorage.getItem(KEY); const o = s ? JSON.parse(s) : null; if (o && o.v === 1) return o; } catch (e) {} return mem || { v: 1, fs: {}, ag: {} }; };
  const save = (o) => { mem = o; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
  const st = load(); st.fs = st.fs || {}; st.ag = st.ag || {};
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const fmt = (s, o) => String(s || "").replace(/\{(\w+)\}/g, (_, k) => (o && k in o ? o[k] : ""));
  const passed = (id) => (st.fs[id]?.best || 0) >= PASS;
  const doneCount = () => LESSONS.filter(passed).length;

  // ── progress on track / hub pages
  function paint() {
    document.querySelectorAll("[data-lesson]").forEach((el) => {
      const r = st.fs[el.dataset.lesson];
      const state = !r ? "new" : r.best >= PASS ? "done" : "tried";
      el.dataset.state = state;
      const s = el.querySelector(".state");
      if (s) s.textContent = state === "done" ? fmt(T.done, { n: r.best }) : state === "tried" ? fmt(T.tried, { n: r.best }) : T.notyet || "";
    });
    document.querySelectorAll("[data-role]").forEach((el) => {
      const r = st.ag[el.dataset.role];
      el.dataset.state = r && r.best >= 2 ? "done" : r ? "tried" : "new";
      const s = el.querySelector(".state");
      if (s) s.textContent = r ? (r.best >= 2 ? T.checked || "" : fmt(T.tried3, { n: r.best })) : T.notyet || "";
    });
    const n = doneCount();
    document.querySelectorAll("[data-progress='fs']").forEach((el) => {
      el.style.setProperty("--p", (LESSONS.length ? (n / LESSONS.length) * 100 : 0) + "%");
    });
    document.querySelectorAll("[data-count='fs']").forEach((el) => { el.textContent = fmt(T.count, { n, of: LESSONS.length }); });
    const ag = ROLES.filter((r) => (st.ag[r]?.best || 0) >= 2).length;
    document.querySelectorAll("[data-progress='ag']").forEach((el) => { el.style.setProperty("--p", (ROLES.length ? (ag / ROLES.length) * 100 : 0) + "%"); });
    document.querySelectorAll("[data-count='ag']").forEach((el) => { el.textContent = fmt(T.countRoles, { n: ag, of: ROLES.length }); });
    const next = LESSONS.find((id) => !passed(id));
    const started = LESSONS.some((id) => st.fs[id]);
    document.querySelectorAll("[data-continue]").forEach((a) => {
      let map = {}; try { map = JSON.parse(a.dataset.continue); } catch (e) {}
      if (next && map[next]) { a.href = map[next]; a.textContent = started ? fmt(T.continueN, { n: LESSONS.indexOf(next) + 1 }) : T.start1; }
      else if (!next && map.cert) { a.href = map.cert; a.textContent = T.getCert; }
    });
    paintCert();
  }

  // ── quizzes
  document.querySelectorAll("form.quiz").forEach((form) => {
    const kind = form.dataset.kind, id = form.dataset.id, need = +form.dataset.pass || PASS;
    const qs = [...form.querySelectorAll(".q")];
    const out = form.querySelector(".result");
    const answers = new Map();
    form.addEventListener("submit", (e) => e.preventDefault());
    qs.forEach((q, i) => {
      q.addEventListener("change", (e) => {
        if (q.classList.contains("done")) return;
        const v = +e.target.value, right = +q.dataset.answer;
        answers.set(i, v === right);
        q.classList.add("done");
        q.querySelectorAll("input").forEach((inp) => { inp.disabled = true; });
        const labels = [...q.querySelectorAll("label")];
        labels[right]?.classList.add("right");
        if (v !== right) labels[v]?.classList.add("wrong");
        const why = q.querySelector(".why"); if (why) why.hidden = false;
        if (answers.size === qs.length) finish();
      });
    });
    function finish() {
      const score = [...answers.values()].filter(Boolean).length;
      const bag = kind === "ag" ? st.ag : st.fs;
      const prev = bag[id] || { best: 0, n: 0 };
      bag[id] = { best: Math.max(prev.best || 0, score), n: (prev.n || 0) + 1, at: today() };
      save(st);
      const ok = score >= need;
      out.className = "result " + (ok ? "pass" : "fail");
      out.innerHTML = "";
      const p = document.createElement("p"); p.textContent = fmt(ok ? T.passed : T.failed, { n: score, of: qs.length, need }); out.appendChild(p);
      const row = document.createElement("p"); row.style.marginTop = "10px"; row.style.display = "flex"; row.style.gap = "10px"; row.style.flexWrap = "wrap";
      const again = document.createElement("button"); again.type = "button"; again.className = "btn btn-soft"; again.textContent = T.again;
      again.addEventListener("click", reset); row.appendChild(again);
      const nx = form.dataset.next; if (ok && nx) { const a = document.createElement("a"); a.className = "btn btn-primary"; a.href = nx; a.textContent = form.dataset.nextLabel || T.next; row.appendChild(a); }
      out.appendChild(row);
      out.scrollIntoView({ block: "nearest" });
      paint();
    }
    function reset() {
      answers.clear(); out.className = "result"; out.innerHTML = "";
      qs.forEach((q) => { q.classList.remove("done"); q.querySelectorAll("input").forEach((inp) => { inp.disabled = false; inp.checked = false; }); q.querySelectorAll("label").forEach((l) => l.classList.remove("right", "wrong")); const w = q.querySelector(".why"); if (w) w.hidden = true; });
      qs[0]?.querySelector("input")?.focus();
    }
  });

  // ── video chapters + transcript
  const vid = document.querySelector(".player video");
  if (vid) {
    const chapters = [...document.querySelectorAll(".chapters button")];
    const paras = [...document.querySelectorAll(".prose p[data-t]")];
    const seek = (t) => { try { vid.currentTime = t; const p = vid.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
    chapters.forEach((b) => b.addEventListener("click", () => seek(+b.dataset.t)));
    paras.forEach((p) => p.addEventListener("click", () => seek(+p.dataset.t)));
    const mark = () => {
      const t = vid.currentTime || 0;
      let ci = -1; chapters.forEach((b, i) => { if (+b.dataset.t <= t + 0.05) ci = i; });
      chapters.forEach((b, i) => b.setAttribute("aria-current", i === ci ? "true" : "false"));
      let pi = -1; paras.forEach((p, i) => { if (+p.dataset.t <= t + 0.05) pi = i; });
      paras.forEach((p, i) => p.classList.toggle("now", i === pi && !vid.paused));
    };
    vid.addEventListener("timeupdate", mark); vid.addEventListener("pause", mark); vid.addEventListener("seeked", mark);
  }

  // ── certificate
  function paintCert() {
    const box = document.querySelector(".cert-wrap"); if (!box) return;
    const ok = doneCount() === LESSONS.length && LESSONS.length > 0;
    box.querySelectorAll("[data-cert-lesson]").forEach((li) => { const r = st.fs[li.dataset.certLesson]; li.classList.toggle("ok", passed(li.dataset.certLesson)); const s = li.querySelector("span:last-child"); if (s) s.textContent = r ? fmt(passed(li.dataset.certLesson) ? T.done : T.tried, { n: r.best }) : T.notyet; });
    box.querySelector(".cert-form").hidden = !ok;
    box.querySelector(".cert-locked").hidden = ok;
    const c = st.cert;
    const cert = box.querySelector(".certificate");
    if (ok && c && c.name) {
      cert.querySelector(".name").textContent = c.name;
      cert.querySelector("[data-cert-date]").textContent = c.at;
      cert.querySelector("[data-cert-id]").textContent = c.id;
      cert.classList.add("on");
      box.querySelector(".cert-print").hidden = false;
    }
  }
  const certForm = document.querySelector(".cert-form");
  if (certForm) {
    const inp = certForm.querySelector("input");
    if (st.cert?.name) inp.value = st.cert.name;
    certForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = inp.value.replace(/\s+/g, " ").trim().slice(0, 60);
      if (!name) { inp.focus(); return; }
      st.cert = { name, at: today(), id: "SDX-" + hash(name + "|" + today()).slice(0, 6) };
      save(st); paintCert();
      document.querySelector(".certificate")?.scrollIntoView({ block: "start" });
    });
    document.querySelector(".cert-print")?.addEventListener("click", () => { document.body.classList.add("printing-cert"); window.print(); setTimeout(() => document.body.classList.remove("printing-cert"), 500); });
  }
  document.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => window.print()));

  // ── progress code (Safari may clear site storage after 7 days without a visit)
  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } let out = ""; for (let i = 0; i < 7; i++) { out += ABC[h % 32]; h = (Math.floor(h / 32) ^ Math.imul(h, 2654435761)) >>> 0; } return out; }
  function makeCode() {
    let bits = 0n;
    LESSONS.forEach((id) => { bits = (bits << 3n) | BigInt(Math.min(7, st.fs[id]?.best || 0)); });
    ROLES.forEach((id) => { bits = (bits << 2n) | BigInt(Math.min(3, st.ag[id]?.best || 0)); });
    let sum = 0n; let b = bits; while (b > 0n) { sum += b & 31n; b >>= 5n; }
    bits = (bits << 5n) | (sum & 31n);
    let s = ""; const total = LESSONS.length * 3 + ROLES.length * 2 + 5; const chars = Math.ceil(total / 5);
    for (let i = chars - 1; i >= 0; i--) s += ABC[Number((bits >> BigInt(i * 5)) & 31n)];
    return "SDX1-" + s;
  }
  function readCode(code) {
    const m = String(code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").match(/^SDX1-([A-Z2-9]+)$/); if (!m) return false;
    let bits = 0n; for (const ch of m[1]) { const v = ABC.indexOf(ch); if (v < 0) return false; bits = (bits << 5n) | BigInt(v); }
    const total = LESSONS.length * 3 + ROLES.length * 2 + 5; const pad = BigInt(Math.ceil(total / 5) * 5 - total);
    if (m[1].length !== Math.ceil(total / 5)) return false;
    const sum = bits & 31n; let data = bits >> 5n; let s = 0n; let b = data; while (b > 0n) { s += b & 31n; b >>= 5n; } if ((s & 31n) !== sum) return false;
    void pad;
    const roles = [...ROLES].reverse(), lessons = [...LESSONS].reverse();
    roles.forEach((id) => { const v = Number(data & 3n); data >>= 2n; if (v) st.ag[id] = { best: Math.max(st.ag[id]?.best || 0, v), n: st.ag[id]?.n || 1, at: st.ag[id]?.at || today() }; });
    lessons.forEach((id) => { const v = Number(data & 7n); data >>= 3n; if (v) st.fs[id] = { best: Math.max(st.fs[id]?.best || 0, v), n: st.fs[id]?.n || 1, at: st.fs[id]?.at || today() }; });
    save(st); paint(); return true;
  }
  const codeBox = document.querySelector(".code-box");
  if (codeBox) {
    const out = codeBox.querySelector(".code"), msg = codeBox.querySelector(".code-msg");
    const show = () => { out.textContent = makeCode(); };
    show();
    codeBox.querySelector("[data-copy]")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(out.textContent); msg.textContent = T.copied; } catch (e) { msg.textContent = out.textContent; } });
    codeBox.querySelector("form")?.addEventListener("submit", (e) => { e.preventDefault(); const ok = readCode(e.target.querySelector("input").value); msg.textContent = ok ? T.codeOk : T.codeBad; show(); });
  }
  window.addEventListener("storage", (e) => { if (e.key === KEY) { const o = load(); Object.assign(st, o); paint(); } });
  window.__learn = { state: () => JSON.parse(JSON.stringify(st)), makeCode, readCode };
  paint();
})();
