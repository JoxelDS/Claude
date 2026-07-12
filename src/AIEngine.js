/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SDX AI ENGINE  —  Self-Improving Analytics & Performance Core  ║
 * ║  Runs entirely in the browser (localStorage).  No server needed.║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Architecture
 * ─────────────
 *  • AIMemory           — persistent key-value brain stored in localStorage
 *  • UsageTracker       — counts every user action, page visited, time spent
 *  • PatternMiner       — re-analyses history on every save to find new patterns
 *  • InspectorProfiler  — per-inspector pass rate, blindspots, improvement trends
 *  • SupervisorProfiler — per-supervisor site failure rates & recurring problem sites
 *  • LocationProfiler   — per-floor / per-locationType failure breakdowns & trends
 *  • BehaviorTracker    — time-of-day, day-of-week, inspection type frequency patterns
 *  • CrossInspectorAnalyzer — detects inspector thoroughness bias & inspector/location correlation
 *  • IssueResolutionTracker — tracks whether action items actually get fixed on follow-up visits
 *  • SuggestionGen      — converts all patterns into ranked actionable suggestions (17 types)
 *  • PerformanceWatchdog — monitors real paint/interaction timing via PerformanceObserver
 *  • AIEngine (default export) — orchestrates everything; call .boot() once
 */

/* ── Storage keys ───────────────────────────────────────────────── */
// These are declared as `let` so boot(venueId) can rebind them to
// venue-scoped keys (e.g. "sdx_ai_memory_v2_hard-rock-stadium").
// Until boot() is called they remain the base key names so any
// accidental early reads still get a coherent (though un-scoped) bucket.
let MEM_KEY         = "sdx_ai_memory_v2";
let USAGE_KEY       = "sdx_ai_usage_v2";
let PATTERNS_KEY    = "sdx_ai_patterns_v2";
let PERF_KEY        = "sdx_ai_perf_v2";
let SUGGESTIONS_KEY = "sdx_ai_suggestions_v2";
let PROFILES_KEY    = "sdx_ai_profiles_v3";
let BEHAVIOR_KEY    = "sdx_ai_behavior_v3";

/* ── Helpers ────────────────────────────────────────────────────── */
function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function nowISO() { return new Date().toISOString(); }
function todayKey() { return new Date().toISOString().slice(0, 10); }
// Composite site key: "Wynwood Walkthrough #142a" vs "Wynwood Walkthrough #122a"
// Uses both siteName and siteNumber (permit number) so two sites sharing the same
// name but at different numbers are tracked separately.
function siteKey(rec) {
  const name = (rec.siteName || rec.location || "Unknown").trim();
  const num  = (rec.siteNumber || "").trim();
  return num ? `${name} #${num}` : name;
}

/* ══════════════════════════════════════════════════════════════════
   AIMemory  — the engine's persistent brain
══════════════════════════════════════════════════════════════════ */
const AIMemory = {
  get(key, fallback = null) {
    const mem = loadJSON(MEM_KEY, {});
    return key in mem ? mem[key] : fallback;
  },
  set(key, value) {
    const mem = loadJSON(MEM_KEY, {});
    mem[key] = value;
    saveJSON(MEM_KEY, mem);
  },
  increment(key, by = 1) {
    this.set(key, (this.get(key, 0)) + by);
  },
  getAll() { return loadJSON(MEM_KEY, {}); },
};

/* ══════════════════════════════════════════════════════════════════
   UsageTracker  — records every meaningful user action
══════════════════════════════════════════════════════════════════ */
const UsageTracker = {
  _data: null,
  _load() {
    if (!this._data) this._data = loadJSON(USAGE_KEY, {
      sessions: 0,
      totalInteractions: 0,
      byPage: {},
      byAction: {},
      byDay: {},
      timeOnPage: {},
      lastSeen: null,
      firstSeen: null,
    });
    return this._data;
  },
  _save() { saveJSON(USAGE_KEY, this._data); },

  startSession() {
    const d = this._load();
    d.sessions += 1;
    if (!d.firstSeen) d.firstSeen = nowISO();
    d.lastSeen = nowISO();
    const day = todayKey();
    if (!d.byDay[day]) d.byDay[day] = { sessions: 0, interactions: 0 };
    d.byDay[day].sessions += 1;
    // Prune older than 90 days
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    for (const k of Object.keys(d.byDay)) {
      if (new Date(k) < cutoff) delete d.byDay[k];
    }
    this._save();
  },

  trackPage(pageName) {
    const d = this._load();
    if (!d.byPage[pageName]) d.byPage[pageName] = { visits: 0, lastVisit: null };
    d.byPage[pageName].visits += 1;
    d.byPage[pageName].lastVisit = nowISO();
    this._save();
  },

  trackAction(actionName, metadata = {}) {
    const d = this._load();
    d.totalInteractions += 1;
    if (!d.byAction[actionName]) d.byAction[actionName] = { count: 0, lastUsed: null, meta: {} };
    d.byAction[actionName].count += 1;
    d.byAction[actionName].lastUsed = nowISO();
    for (const [k, v] of Object.entries(metadata)) {
      if (!d.byAction[actionName].meta[k]) d.byAction[actionName].meta[k] = {};
      const vs = String(v);
      d.byAction[actionName].meta[k][vs] = (d.byAction[actionName].meta[k][vs] || 0) + 1;
    }
    const day = todayKey();
    if (!d.byDay[day]) d.byDay[day] = { sessions: 0, interactions: 0 };
    d.byDay[day].interactions += 1;
    this._save();
  },

  getReport() {
    const d = this._load();
    const days = Object.entries(d.byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30);
    const totalDays = days.length;
    const avgDaily = totalDays
      ? Math.round(days.reduce((s, [, v]) => s + v.interactions, 0) / totalDays)
      : 0;
    const topPages = Object.entries(d.byPage)
      .sort((a, b) => b[1].visits - a[1].visits)
      .slice(0, 5)
      .map(([name, v]) => ({ name, visits: v.visits }));
    const topActions = Object.entries(d.byAction)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([name, v]) => ({ name, count: v.count }));
    return {
      sessions: d.sessions,
      totalInteractions: d.totalInteractions,
      avgDailyInteractions: avgDaily,
      firstSeen: d.firstSeen,
      lastSeen: d.lastSeen,
      activeDays: totalDays,
      topPages,
      topActions,
      recentDays: days.slice(0, 7).map(([date, v]) => ({ date, ...v })),
    };
  },
};

/* ══════════════════════════════════════════════════════════════════
   InspectorProfiler  — per-inspector deep analysis
   Tracks: pass rate, issue blindspots, improvement trend,
   avg issues found, inspection speed pattern, most-visited sites
══════════════════════════════════════════════════════════════════ */
const InspectorProfiler = {
  mine(history) {
    if (!history || history.length < 2) return [];
    const map = {}; // { name: { records: [], passes, issues, cats: {}, sites: Set } }

    for (const rec of history) {
      const name = (rec.inspectorName || "").trim();
      if (!name) continue; // skip inspections with no inspector name
      if (!map[name]) map[name] = { records: [], passes: 0, issues: 0, cats: {}, sites: new Set() };
      map[name].records.push(rec);
      if (rec.overallStatus === "Pass") map[name].passes += 1;
      const items = rec.actionItems || [];
      map[name].issues += items.length;
      map[name].sites.add(siteKey(rec));
      for (const item of items) {
        const cat = (item.issue || "").split(":")[0].trim() || "Other";
        map[name].cats[cat] = (map[name].cats[cat] || 0) + 1;
      }
    }

    // ── Compute per-site baseline pass rates (all inspectors combined) ──
    // Used to normalize each inspector's pass rate against site difficulty.
    const siteBaseline = {}; // { siteKey: { passes, total } }
    for (const rec of history) {
      const sk = siteKey(rec);
      if (!siteBaseline[sk]) siteBaseline[sk] = { passes: 0, total: 0 };
      siteBaseline[sk].total += 1;
      if (rec.overallStatus === "Pass") siteBaseline[sk].passes += 1;
    }
    const siteBaselineRate = {}; // { siteKey: avgPassRate 0-100 }
    for (const [sk, s] of Object.entries(siteBaseline)) {
      if (s.total >= 3) siteBaselineRate[sk] = Math.round((s.passes / s.total) * 100);
    }

    return Object.entries(map)
      .filter(([, v]) => v.records.length >= 2)
      .map(([name, v]) => {
        const total = v.records.length;
        const passRate = Math.round((v.passes / total) * 100);
        const avgIssues = parseFloat((v.issues / total).toFixed(1));

        // Blindspots: categories flagged in <20% of their inspections
        // (compared to overall occurrence rates — approximated by low count)
        const blindspots = Object.entries(v.cats)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([cat, count]) => ({ cat, count, rate: Math.round((count / total) * 100) }));

        // Improvement trend: compare first half vs second half pass rate
        const sorted = [...v.records].sort((a, b) =>
          (a.inspectionDate || "").localeCompare(b.inspectionDate || "")
        );
        const half = Math.floor(sorted.length / 2);
        const firstHalf = sorted.slice(0, half);
        const secondHalf = sorted.slice(half);
        const firstPassRate = firstHalf.length
          ? Math.round((firstHalf.filter(r => r.overallStatus === "Pass").length / firstHalf.length) * 100) : null;
        const secondPassRate = secondHalf.length
          ? Math.round((secondHalf.filter(r => r.overallStatus === "Pass").length / secondHalf.length) * 100) : null;
        const trend = (firstPassRate !== null && secondPassRate !== null)
          ? (secondPassRate - firstPassRate)
          : 0;

        // Most recent 3 inspections
        const recent = sorted.slice(-3).map(r => ({
          date: r.inspectionDate,
          status: r.overallStatus,
          site: siteKey(r),
          issues: (r.actionItems || []).length,
        }));

        // ── Time tracking: only use records where the on-site timer was explicitly confirmed ──────────
        const timedRecords = v.records.filter(r => r.timerConfirmed === true);
        const durations = timedRecords
          .map(r => r.inspectionDurationSeconds ?? r.reportDurationSeconds)
          .filter(d => typeof d === "number" && d > 0);
        const avgDurationSec = durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null;
        const minDurationSec = durations.length ? Math.min(...durations) : null;
        const maxDurationSec = durations.length ? Math.max(...durations) : null;
        const totalTimeSec = durations.length ? durations.reduce((a, b) => a + b, 0) : null;
        const onSiteTimedCount = timedRecords.filter(r => typeof r.inspectionDurationSeconds === "number" && r.inspectionDurationSeconds > 0).length;
        // Duration trend: first half avg vs second half avg (positive = getting slower)
        const sortedByDate = [...timedRecords]
          .filter(r => (typeof r.inspectionDurationSeconds === "number" && r.inspectionDurationSeconds > 0) || (typeof r.reportDurationSeconds === "number" && r.reportDurationSeconds > 0))
          .filter(r => r.inspectionDate)
          .sort((a, b) => (a.inspectionDate || "").localeCompare(b.inspectionDate || ""));
        const dHalf = Math.floor(sortedByDate.length / 2);
        const firstHalfDurations = sortedByDate.slice(0, dHalf).map(r => r.inspectionDurationSeconds ?? r.reportDurationSeconds);
        const secondHalfDurations = sortedByDate.slice(dHalf).map(r => r.inspectionDurationSeconds ?? r.reportDurationSeconds);
        const firstHalfAvgDur = firstHalfDurations.length
          ? Math.round(firstHalfDurations.reduce((a, b) => a + b, 0) / firstHalfDurations.length) : null;
        const secondHalfAvgDur = secondHalfDurations.length
          ? Math.round(secondHalfDurations.reduce((a, b) => a + b, 0) / secondHalfDurations.length) : null;
        // durationTrend: negative = getting faster (good), positive = getting slower (bad)
        const durationTrend = (firstHalfAvgDur !== null && secondHalfAvgDur !== null)
          ? secondHalfAvgDur - firstHalfAvgDur : null;
        // Per-site time breakdown
        const siteTimeMap = {};
        for (const r of timedRecords) {
          const sk = siteKey(r);
          if (!siteTimeMap[sk]) siteTimeMap[sk] = { total: 0, count: 0 };
          const dur = r.inspectionDurationSeconds ?? r.reportDurationSeconds;
          if (typeof dur === "number" && dur > 0) {
            siteTimeMap[sk].total += dur;
            siteTimeMap[sk].count += 1;
          }
        }
        const timePerSite = Object.entries(siteTimeMap)
          .map(([site, s]) => ({
            site,
            avgSec: s.count ? Math.round(s.total / s.count) : null,
            count: s.count,
          }))
          .filter(s => s.avgSec !== null)
          .sort((a, b) => b.avgSec - a.avgSec);

        // ── Turnaround time: inspectionDate → savedAt (submission lag) ──
        // Same-day = 0, next-day = 1, etc.  Measures how quickly the inspector submits.
        const turnaroundDays = v.records
          .filter(r => r.inspectionDate && r.savedAt)
          .map(r => {
            const inspMs = new Date(r.inspectionDate + "T00:00:00").getTime();
            const saveMs = new Date(r.savedAt).getTime();
            return Math.max(0, Math.round((saveMs - inspMs) / 86400000));
          });
        const avgTurnaroundDays = turnaroundDays.length
          ? parseFloat((turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length).toFixed(1))
          : null;
        const sameDayRate = turnaroundDays.length
          ? Math.round((turnaroundDays.filter(d => d === 0).length / turnaroundDays.length) * 100)
          : null;

        // ── Inspector throughput: inspections per active day ──
        // Active days = distinct inspectionDate values this inspector worked.
        const activeDates = new Set(v.records.map(r => r.inspectionDate).filter(Boolean));
        const activeDayCount = activeDates.size;
        const inspPerDay = activeDayCount > 0
          ? parseFloat((total / activeDayCount).toFixed(1))
          : null;

        // ── Site re-inspection interval: avg days between consecutive visits to the SAME site ──
        // Group records by site, sort by inspectionDate, compute day gaps.
        const siteVisits = {}; // { siteKey: [date1, date2, ...] sorted asc }
        for (const r of v.records) {
          if (!r.inspectionDate) continue;
          const sk = siteKey(r);
          if (!siteVisits[sk]) siteVisits[sk] = [];
          siteVisits[sk].push(r.inspectionDate);
        }
        const reinspIntervals = []; // day counts between consecutive visits, all sites
        const siteReinspDetail = []; // { site, visits, avgDays } for display
        for (const [sk, dates] of Object.entries(siteVisits)) {
          const sorted2 = [...new Set(dates)].sort();
          if (sorted2.length < 2) continue;
          const siteDayGaps = [];
          for (let i = 1; i < sorted2.length; i++) {
            const a = new Date(sorted2[i - 1]).getTime();
            const b = new Date(sorted2[i]).getTime();
            const days = Math.round((b - a) / 86400000);
            if (days > 0) { siteDayGaps.push(days); reinspIntervals.push(days); }
          }
          if (siteDayGaps.length > 0) {
            siteReinspDetail.push({
              site: sk,
              visits: sorted2.length,
              avgDays: parseFloat((siteDayGaps.reduce((a, b) => a + b, 0) / siteDayGaps.length).toFixed(0)),
              lastVisit: sorted2[sorted2.length - 1],
            });
          }
        }
        const avgReinspDays = reinspIntervals.length
          ? parseFloat((reinspIntervals.reduce((a, b) => a + b, 0) / reinspIntervals.length).toFixed(0))
          : null;
        // Sort by most-frequently revisited sites first
        siteReinspDetail.sort((a, b) => b.visits - a.visits);

        // ── Event inspection tracking ──────────────────────────────
        const eventRecs = v.records.filter(r => r.eventName && r.eventName.trim());
        const eventInspectionCount = eventRecs.length;
        const eventPassRate = eventRecs.length
          ? Math.round((eventRecs.filter(r => r.overallStatus === "Pass").length / eventRecs.length) * 100)
          : null;
        const eventNames = [...new Set(eventRecs.map(r => r.eventName.trim()))].slice(0, 5);

        // ── Participant tracking ───────────────────────────────────
        const participantNames = [
          ...new Set(v.records.map(r => r.participantName).filter(Boolean).map(p => p.trim()))
        ].slice(0, 5);

        // ── Note type breakdown per inspector ─────────────────────
        const inspNoteTypes = {};
        for (const r of v.records) {
          if (r.noteType) inspNoteTypes[r.noteType] = (inspNoteTypes[r.noteType] || 0) + 1;
        }
        const noteTypeBreakdown = Object.entries(inspNoteTypes)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count);

        // ── Site-normalized pass rate ────────────────────────────────────
        // Compare each inspector's pass rate at each site to that site's overall baseline.
        // If a site is historically hard (60% avg), an inspector at 70% is punching above weight.
        // normalizedPassRate = weighted avg of (inspectorRate - siteBaseline) per site, offset back to 0-100.
        const siteNormDeltas = [];
        const sitesWithBaseline = [...v.sites].filter(sk => siteBaselineRate[sk] !== undefined);
        for (const sk of sitesWithBaseline) {
          // Inspector's pass rate at this specific site
          const siteRecs = v.records.filter(r => siteKey(r) === sk);
          if (siteRecs.length < 2) continue;
          const siteInspPasses = siteRecs.filter(r => r.overallStatus === "Pass").length;
          const siteInspRate = Math.round((siteInspPasses / siteRecs.length) * 100);
          const delta = siteInspRate - siteBaselineRate[sk]; // positive = beating site avg
          siteNormDeltas.push({ delta, weight: siteRecs.length });
        }
        // Weighted avg delta: positive = above-average for their sites, negative = below
        const totalWeight = siteNormDeltas.reduce((s, d) => s + d.weight, 0);
        const weightedDelta = totalWeight > 0
          ? Math.round(siteNormDeltas.reduce((s, d) => s + d.delta * d.weight, 0) / totalWeight)
          : 0;
        // normalizedPassRate: clamp to 0-100 (centered at passRate, adjusted by site difficulty)
        const normalizedPassRate = Math.max(0, Math.min(100, passRate + Math.round(weightedDelta * 0.4)));
        // Use normalizedPassRate when we have enough site data, else raw passRate
        const effectivePassRate = sitesWithBaseline.length >= 2 && siteNormDeltas.length >= 2
          ? normalizedPassRate : passRate;

        // ── Note quality score ───────────────────────────────────────────
        // Measures how thoroughly an inspector fills out the form:
        //   1. Checklist completion rate — % of items that have a status set
        //   2. Item notes written — % of flagged/attention items that have a written note
        //   3. Observation specificity — avg character length of those notes
        // Combined into a 0-25 point score.
        let totalChecklistItems = 0;
        let completedChecklistItems = 0;
        let flaggedItemsWithNote = 0;
        let flaggedItemsTotal = 0;
        const allItemNoteTexts = [];
        for (const r of v.records) {
          const insp = r.inspection || {};
          for (const section of Object.values(insp)) {
            if (!section || typeof section !== "object") continue;
            for (const item of Object.values(section)) {
              if (!item || typeof item !== "object") continue;
              // Skip temp-only entries and pure metadata
              if (Object.keys(item).every(k => ["handSinkTempF","threeCompSinkSanitizer","handSinkOutOfOrder","threeCompSinkOutOfOrder","coolerTempF","freezerTempF"].includes(k))) continue;
              const hasStatus = item.status && item.status !== "";
              if (!hasStatus) continue; // item not touched at all — skip
              totalChecklistItems++;
              completedChecklistItems++;
              const isFlagged = item.status === "Needs Attention" || item.status === "Fail" || item.status === "Needs Cleaning";
              if (isFlagged) {
                flaggedItemsTotal++;
                const noteText = (item.notes || "").trim();
                if (noteText.length > 0) {
                  flaggedItemsWithNote++;
                  allItemNoteTexts.push(noteText);
                }
              }
            }
          }
        }
        // Completion rate: % of touched items that have a status (already 100% by construction above)
        // Flagged note coverage: % of flagged items that have a written explanation
        const flaggedNoteCoverage = flaggedItemsTotal > 0
          ? Math.round((flaggedItemsWithNote / flaggedItemsTotal) * 100)
          : 100; // no flags = can't penalize
        // Note specificity: avg char length of written notes on flagged items
        const avgNoteLength = allItemNoteTexts.length
          ? Math.round(allItemNoteTexts.reduce((s, t) => s + t.length, 0) / allItemNoteTexts.length)
          : 0;
        // Score breakdown (0-25 pts):
        //   Up to 15 pts for flagged-item note coverage (100% = 15pts, 75%+ = 10pts, 50%+ = 5pts, <50% = 0)
        //   Up to 10 pts for note specificity (50+ chars avg = 10, 30+ = 7, 15+ = 4, <15 = 0)
        const coverageScore = flaggedItemsTotal === 0 ? 10  // no flags, neutral
          : flaggedNoteCoverage >= 100 ? 15
          : flaggedNoteCoverage >= 75  ? 10
          : flaggedNoteCoverage >= 50  ? 5
          : 0;
        const specificityScore = avgNoteLength >= 50 ? 10
          : avgNoteLength >= 30 ? 7
          : avgNoteLength >= 15 ? 4
          : 0;
        const noteQualityScore = coverageScore + specificityScore;

        // ── Score variance (rubber-stamp detection) ──────────────────────
        // Real inspectors see variance — different sites have different conditions.
        // An inspector with suspiciously low variance across many records may be copying results.
        // Variance = std deviation of per-inspection pass/fail (0 or 1 per record).
        const passValues = v.records.map(r => r.overallStatus === "Pass" ? 1 : 0);
        const passValueMean = passValues.reduce((a, b) => a + b, 0) / passValues.length;
        const passVariance = passValues.reduce((s, x) => s + Math.pow(x - passValueMean, 2), 0) / passValues.length;
        // passVariance ranges 0 (all same) to 0.25 (50/50 split — max natural variance)
        // Flag if >= 5 records and variance < 0.05 (>95% same result every time)
        const isSuspiciouslyFlat = v.records.length >= 5 && passVariance < 0.05;
        // Also flag if pass rate is extremely high (>95%) AND low issue rate — likely rubber-stamping
        const isRubberStampPattern = passRate >= 95 && avgIssues < 0.5 && total >= 5;

        // ── Consistency score (0-20): how stable their quality is over recent records ──
        // Compare recent 8-record window vs overall pass rate.
        // Low variance from their own baseline = consistent (good). High swing = erratic.
        const recentSorted = [...v.records].sort((a, b) => (a.inspectionDate || "").localeCompare(b.inspectionDate || ""));
        const windowSize = Math.min(recentSorted.length, 8);
        const recentWindow = recentSorted.slice(-windowSize);
        const windowPasses = recentWindow.filter(r => r.overallStatus === "Pass").length;
        const windowPassRate = Math.round((windowPasses / recentWindow.length) * 100);
        const passRateVariance = Math.abs(windowPassRate - passRate);
        const consistencyScore = Math.max(0, 20 - Math.round(passRateVariance * 0.4));

        // ── Real Work Score ───────────────────────────────────────────────
        // Pure output-quality scoring — no time component.
        // Components:
        //   effectivePassRate × 0.35  →  0–35 pts  (site-normalized pass rate)
        //   issueRate         × 0.30  →  0–30 pts  (avg 3+ issues/visit = full)
        //   noteQualityScore          →  0–25 pts  (specificity of findings)
        //   consistencyScore × 0.50  →  0–10 pts  (stable performance)
        // Rubber-stamp patterns are penalized separately in buildVerdict() via signals.
        const issueComponent = Math.min(30, Math.round((avgIssues / 3) * 30));
        const consistencyComponent = Math.round(consistencyScore * 0.5); // 0-10 pts
        const performanceScore = Math.min(100, Math.round(
          effectivePassRate * 0.35
          + issueComponent
          + noteQualityScore
          + consistencyComponent
        ));

        return {
          name,
          total,
          passRate,
          passCount: v.passes,
          avgIssues,
          topIssues: blindspots,
          sites: [...v.sites],
          siteCount: v.sites.size,
          trend,        // positive = improving, negative = declining
          trendLabel: trend > 10 ? "improving" : trend < -10 ? "declining" : "stable",
          recent,
          firstPassRate,
          secondPassRate,
          // Time tracking (within inspection — report duration)
          avgDurationSec,
          minDurationSec,
          maxDurationSec,
          totalTimeSec,
          durationTrend,
          firstHalfAvgDur,
          secondHalfAvgDur,
          timePerSite,
          durationCount: durations.length,
          // Turnaround time (inspectionDate → savedAt submission lag)
          avgTurnaroundDays,
          sameDayRate,
          turnaroundCount: turnaroundDays.length,
          // Inspector throughput
          activeDayCount,
          inspPerDay,
          // Site re-inspection interval
          avgReinspDays,
          siteReinspDetail,
          // Event inspections
          eventInspectionCount,
          eventRate: total ? Math.round((eventInspectionCount / total) * 100) : 0,
          eventPassRate,
          eventNames,
          // Participants
          participantNames,
          // Note type breakdown
          noteTypeBreakdown,
          // Overall performance score (Real Work Score)
          performanceScore,
          // Site-normalized metrics
          normalizedPassRate,
          effectivePassRate,
          weightedDelta,
          sitesWithBaseline: sitesWithBaseline.length,
          // Note quality
          avgNoteLength,
          noteQualityScore,
          flaggedNoteCoverage,
          // Rubber-stamp / variance detection
          passVariance: parseFloat(passVariance.toFixed(3)),
          isSuspiciouslyFlat,
          isRubberStampPattern,
          // Consistency
          consistencyScore,
        };
      })
      .sort((a, b) => b.total - a.total);
  },
};

/* ══════════════════════════════════════════════════════════════════
   SupervisorProfiler  — per-supervisor site & compliance analysis
   Tracks: which sites under each supervisor fail most, recurring
   problems, whether issues are being resolved or persisting
══════════════════════════════════════════════════════════════════ */
const SupervisorProfiler = {
  mine(history) {
    if (!history || history.length < 2) return [];
    const map = {}; // { supName: { records, passes, sites: Set, issueCats, recurringIssues } }

    for (const rec of history) {
      const sup = (rec.supervisorName || "").trim() || "Unknown";
      if (!map[sup]) map[sup] = { records: [], passes: 0, sites: new Set(), issueCats: {}, problematicSites: {} };
      map[sup].records.push(rec);
      if (rec.overallStatus === "Pass") map[sup].passes += 1;
      const sk = siteKey(rec);
      map[sup].sites.add(sk);
      if (!map[sup].problematicSites[sk]) map[sup].problematicSites[sk] = { total: 0, fails: 0, issues: [] };
      map[sup].problematicSites[sk].total += 1;
      if (rec.overallStatus !== "Pass") map[sup].problematicSites[sk].fails += 1;
      for (const item of (rec.actionItems || [])) {
        map[sup].problematicSites[sk].issues.push(item.issue || "");
      }
      for (const item of (rec.actionItems || [])) {
        const cat = (item.issue || "").split(":")[0].trim() || "Other";
        map[sup].issueCats[cat] = (map[sup].issueCats[cat] || 0) + 1;
      }
    }

    return Object.entries(map)
      .filter(([, v]) => v.records.length >= 2)
      .map(([name, v]) => {
        const total = v.records.length;
        const passRate = Math.round((v.passes / total) * 100);

        // Most problematic sites under this supervisor
        const problemSites = Object.entries(v.problematicSites)
          .filter(([, s]) => s.total >= 2)
          .map(([site, s]) => ({
            site,
            failRate: Math.round((s.fails / s.total) * 100),
            total: s.total,
            fails: s.fails,
            // Recurring: issues that appear more than once
            recurringIssues: (() => {
              const cnt = {};
              for (const iss of s.issues) { cnt[iss] = (cnt[iss] || 0) + 1; }
              return Object.entries(cnt).filter(([, c]) => c > 1).map(([i, c]) => ({ issue: i, times: c })).slice(0, 3);
            })(),
          }))
          .sort((a, b) => b.failRate - a.failRate)
          .slice(0, 4);

        const topIssues = Object.entries(v.issueCats)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([cat, count]) => ({ cat, count, rate: Math.round((count / total) * 100) }));

        return {
          name,
          total,
          passRate,
          passCount: v.passes,
          siteCount: v.sites.size,
          sites: [...v.sites],
          problemSites,
          topIssues,
          hasRecurringIssues: problemSites.some(s => s.recurringIssues.length > 0),
        };
      })
      .sort((a, b) => b.total - a.total);
  },
};

/* ══════════════════════════════════════════════════════════════════
   LocationProfiler  — per-floor, per-locationType breakdown
   Tracks: floor-level pass rates, locationType (Concession /
   Portable / Subcontractor) failure patterns, site-level trends
══════════════════════════════════════════════════════════════════ */
const LocationProfiler = {
  mine(history) {
    if (!history || history.length < 2) return { byFloor: [], byType: [], bySite: [] };

    // ── By floor ───────────────────────────────────────────
    const floorMap = {};
    for (const rec of history) {
      const fl = rec.floor || "Unspecified";
      if (!floorMap[fl]) floorMap[fl] = { total: 0, passes: 0, issues: 0, cats: {} };
      floorMap[fl].total += 1;
      if (rec.overallStatus === "Pass") floorMap[fl].passes += 1;
      for (const item of (rec.actionItems || [])) {
        floorMap[fl].issues += 1;
        const cat = (item.issue || "").split(":")[0].trim() || "Other";
        floorMap[fl].cats[cat] = (floorMap[fl].cats[cat] || 0) + 1;
      }
    }
    const byFloor = Object.entries(floorMap)
      .map(([floor, v]) => ({
        floor,
        total: v.total,
        passRate: Math.round((v.passes / v.total) * 100),
        avgIssues: parseFloat((v.issues / v.total).toFixed(1)),
        topIssue: Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      }))
      .sort((a, b) => a.passRate - b.passRate); // worst first

    // ── By location type ───────────────────────────────────
    const typeMap = {};
    for (const rec of history) {
      const lt = rec.locationType || "Unspecified";
      if (!typeMap[lt]) typeMap[lt] = { total: 0, passes: 0, issues: 0, cats: {} };
      typeMap[lt].total += 1;
      if (rec.overallStatus === "Pass") typeMap[lt].passes += 1;
      for (const item of (rec.actionItems || [])) {
        typeMap[lt].issues += 1;
        const cat = (item.issue || "").split(":")[0].trim() || "Other";
        typeMap[lt].cats[cat] = (typeMap[lt].cats[cat] || 0) + 1;
      }
    }
    const byType = Object.entries(typeMap)
      .map(([type, v]) => ({
        type,
        total: v.total,
        passRate: Math.round((v.passes / v.total) * 100),
        avgIssues: parseFloat((v.issues / v.total).toFixed(1)),
        topIssues: Object.entries(v.cats)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([cat, count]) => ({ cat, count })),
      }))
      .sort((a, b) => a.passRate - b.passRate);

    // ── By site with trend ─────────────────────────────────
    const siteMap = {};
    const sortedHist = [...history].sort((a, b) =>
      (a.inspectionDate || "").localeCompare(b.inspectionDate || "")
    );
    for (const rec of sortedHist) {
      const site = siteKey(rec);
      if (!siteMap[site]) siteMap[site] = { records: [], passes: 0, issues: 0 };
      siteMap[site].records.push(rec);
      if (rec.overallStatus === "Pass") siteMap[site].passes += 1;
      siteMap[site].issues += (rec.actionItems || []).length;
    }
    const bySite = Object.entries(siteMap)
      .filter(([, v]) => v.records.length >= 2)
      .map(([site, v]) => {
        const total = v.records.length;
        const half = Math.floor(total / 2);
        const firstPassRate = half
          ? Math.round((v.records.slice(0, half).filter(r => r.overallStatus === "Pass").length / half) * 100) : null;
        const secondPassRate = (total - half)
          ? Math.round((v.records.slice(half).filter(r => r.overallStatus === "Pass").length / (total - half)) * 100) : null;
        const trend = (firstPassRate !== null && secondPassRate !== null) ? secondPassRate - firstPassRate : 0;
        return {
          site,
          total,
          passRate: Math.round((v.passes / total) * 100),
          avgIssues: parseFloat((v.issues / total).toFixed(1)),
          trend,
          trendLabel: trend > 10 ? "improving" : trend < -10 ? "worsening" : "stable",
          lastInspected: v.records[v.records.length - 1].inspectionDate || null,
        };
      })
      .sort((a, b) => a.passRate - b.passRate);

    return { byFloor, byType, bySite };
  },
};

/* ══════════════════════════════════════════════════════════════════
   BehaviorTracker  — time-of-day, day-of-week, inspection type
   frequency, form field completeness patterns
══════════════════════════════════════════════════════════════════ */
const BehaviorTracker = {
  mine(history) {
    if (!history || history.length < 2) return {};

    const hourBuckets  = Array(24).fill(0);   // inspections by hour of day
    const dayBuckets   = Array(7).fill(0);    // inspections by day of week (0=Sun)
    const typeFreq     = {};                  // inspectionType frequency
    const noteTypeFreq = {};                  // noteType frequency
    let missingInspector   = 0;
    let missingSupervisor  = 0;
    let missingTemps       = 0;
    let missingFoodTemps   = 0;
    let missingFloor       = 0;
    let zeroIssuePass      = 0; // passes with 0 action items (thorough?)
    let highIssueCount     = 0; // records with 5+ action items

    for (const rec of history) {
      // Time of save
      const ts = rec.savedAt || rec.inspectionDate;
      if (ts) {
        const d = new Date(ts);
        hourBuckets[d.getHours()]++;
        dayBuckets[d.getDay()]++;
      }
      // Type frequency
      if (rec.inspectionType) {
        typeFreq[rec.inspectionType] = (typeFreq[rec.inspectionType] || 0) + 1;
      }
      if (rec.noteType) {
        noteTypeFreq[rec.noteType] = (noteTypeFreq[rec.noteType] || 0) + 1;
      }
      // Field completeness
      if (!rec.inspectorName || rec.inspectorName.trim() === "") missingInspector++;
      if (!rec.supervisorName || rec.supervisorName.trim() === "") missingSupervisor++;
      if (!rec.temps?.handSinkTempF && !rec.temps?.threeCompSinkTempF) missingTemps++;
      if (!rec.floor || rec.floor.trim() === "") missingFloor++;
      // foodTemps completeness — object with at least one numeric entry
      const hasFoodTemps = rec.foodTemps && Object.values(rec.foodTemps).some(v => v && Number(v) > 0);
      if (!hasFoodTemps) missingFoodTemps++;
      const issues = (rec.actionItems || []).length;
      if (issues === 0 && rec.overallStatus === "Pass") zeroIssuePass++;
      if (issues >= 5) highIssueCount++;
    }

    // Peak usage windows
    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
    const peakDay  = dayBuckets.indexOf(Math.max(...dayBuckets));
    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

    // Top inspection types
    const topTypes = Object.entries(typeFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count, pct: Math.round((count / history.length) * 100) }));

    // Field completion rates
    const total = history.length;
    const completeness = {
      inspectorName:  Math.round(((total - missingInspector)  / total) * 100),
      supervisorName: Math.round(((total - missingSupervisor) / total) * 100),
      temps:          Math.round(((total - missingTemps)      / total) * 100),
      foodTemps:      Math.round(((total - missingFoodTemps)  / total) * 100),
      floor:          Math.round(((total - missingFloor)      / total) * 100),
    };

    // Issue density
    const totalIssues = history.reduce((s, r) => s + (r.actionItems || []).length, 0);
    const avgIssues = parseFloat((totalIssues / total).toFixed(1));

    return {
      peakHour,
      peakHourLabel: `${peakHour}:00–${peakHour + 1}:00`,
      peakDay,
      peakDayLabel: dayNames[peakDay],
      hourBuckets,
      dayBuckets,
      topTypes,
      noteTypeFreq,
      completeness,
      missingFields: {
        inspectorName: missingInspector,
        supervisorName: missingSupervisor,
        temps: missingTemps,
        foodTemps: missingFoodTemps,
        floor: missingFloor,
      },
      zeroIssuePasses: zeroIssuePass,
      highIssueRecords: highIssueCount,
      avgIssues,
      total,
    };
  },
};

/* ══════════════════════════════════════════════════════════════════
   CrossInspectorAnalyzer  — compares inspectors head-to-head to
   detect thoroughness bias and inspector/location correlations
══════════════════════════════════════════════════════════════════ */
const CrossInspectorAnalyzer = {
  mine(history) {
    if (!history || history.length < 4) return null;

    // Build per-inspector issue count distribution
    // An inspector who NEVER writes issues is a "rubber-stamper"
    // An inspector who writes far MORE issues than peers is "thorough"
    const inspMap = {};
    for (const rec of history) {
      const name = rec.inspectorName || "Unknown";
      if (!inspMap[name]) inspMap[name] = { total: 0, passes: 0, issueTotal: 0, zeroIssuePasses: 0, sites: {} };
      inspMap[name].total += 1;
      const issueCount = (rec.actionItems || []).length;
      inspMap[name].issueTotal += issueCount;
      if (rec.overallStatus === "Pass") inspMap[name].passes += 1;
      if (rec.overallStatus === "Pass" && issueCount === 0) inspMap[name].zeroIssuePasses += 1;
      // Track which sites each inspector visited
      const site = siteKey(rec);
      if (!inspMap[name].sites[site]) inspMap[name].sites[site] = { total: 0, passes: 0 };
      inspMap[name].sites[site].total += 1;
      if (rec.overallStatus === "Pass") inspMap[name].sites[site].passes += 1;
    }

    const profiles = Object.entries(inspMap)
      .filter(([, v]) => v.total >= 2)
      .map(([name, v]) => ({
        name,
        total: v.total,
        passRate: Math.round((v.passes / v.total) * 100),
        avgIssues: parseFloat((v.issueTotal / v.total).toFixed(1)),
        zeroIssuePct: Math.round((v.zeroIssuePasses / v.total) * 100),
        siteCount: Object.keys(v.sites).length,
      }));

    if (profiles.length < 2) return { profiles, siteCorrelations: [], rubberStampers: [], thorough: [] };

    // Overall average issues per inspection across all inspectors
    const globalAvgIssues = profiles.reduce((s, p) => s + p.avgIssues, 0) / profiles.length;

    // Rubber-stampers: ≥70% zero-issue passes (may be under-reporting)
    const rubberStampers = profiles
      .filter(p => p.zeroIssuePct >= 70 && p.total >= 3)
      .map(p => ({ ...p, deviation: parseFloat((globalAvgIssues - p.avgIssues).toFixed(1)) }));

    // Thorough inspectors: avg issues ≥1.5× global average
    const thorough = profiles
      .filter(p => p.avgIssues >= globalAvgIssues * 1.5 && p.total >= 3)
      .map(p => ({ ...p, deviation: parseFloat((p.avgIssues - globalAvgIssues).toFixed(1)) }));

    // Site correlation: find sites where pass rate varies widely across inspectors
    // i.e., same site passes under inspector A but fails under inspector B
    const siteInspectorMap = {};
    for (const rec of history) {
      const site = siteKey(rec);
      const name = rec.inspectorName || "Unknown";
      if (!siteInspectorMap[site]) siteInspectorMap[site] = {};
      if (!siteInspectorMap[site][name]) siteInspectorMap[site][name] = { total: 0, passes: 0 };
      siteInspectorMap[site][name].total += 1;
      if (rec.overallStatus === "Pass") siteInspectorMap[site][name].passes += 1;
    }

    const siteCorrelations = [];
    for (const [site, byInsp] of Object.entries(siteInspectorMap)) {
      const qualified = Object.entries(byInsp)
        .filter(([, v]) => v.total >= 2)
        .map(([insp, v]) => ({ insp, passRate: Math.round((v.passes / v.total) * 100), total: v.total }));
      if (qualified.length < 2) continue;
      const rates = qualified.map(q => q.passRate);
      const spread = Math.max(...rates) - Math.min(...rates);
      if (spread >= 40) {
        // Notable inspector/site discrepancy
        qualified.sort((a, b) => b.passRate - a.passRate);
        siteCorrelations.push({
          site,
          spread,
          best: qualified[0],
          worst: qualified[qualified.length - 1],
          all: qualified,
        });
      }
    }
    siteCorrelations.sort((a, b) => b.spread - a.spread);

    return { profiles, siteCorrelations: siteCorrelations.slice(0, 5), rubberStampers, thorough, globalAvgIssues: parseFloat(globalAvgIssues.toFixed(1)) };
  },
};

/* ══════════════════════════════════════════════════════════════════
   IssueResolutionTracker  — detects if action items from one visit
   reappear on the next visit (meaning they weren't resolved)
══════════════════════════════════════════════════════════════════ */
const IssueResolutionTracker = {
  mine(history) {
    if (!history || history.length < 4) return null;

    // Group records by site, sort by date
    const siteMap = {};
    for (const rec of history) {
      const site = siteKey(rec);
      if (!siteMap[site]) siteMap[site] = [];
      siteMap[site].push(rec);
    }

    const siteResults = [];
    let totalFollowUps = 0;
    let totalRecurredAtFollowUp = 0;

    for (const [site, recs] of Object.entries(siteMap)) {
      const sorted = [...recs].sort((a, b) =>
        new Date(a.inspectionDate || 0) - new Date(b.inspectionDate || 0)
      );
      if (sorted.length < 2) continue;

      let siteFollowUps = 0;
      let siteRecurred = 0;
      const persistentIssues = {};

      for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        const currIssues = (curr.actionItems || []).map(a => (a.issue || "").split(":")[0].trim().toLowerCase()).filter(Boolean);
        const nextIssues = (next.actionItems || []).map(a => (a.issue || "").split(":")[0].trim().toLowerCase()).filter(Boolean);
        if (currIssues.length === 0) continue;
        siteFollowUps += 1;
        const recurred = currIssues.filter(i => nextIssues.includes(i));
        if (recurred.length > 0) {
          siteRecurred += 1;
          for (const iss of recurred) {
            persistentIssues[iss] = (persistentIssues[iss] || 0) + 1;
          }
        }
      }

      totalFollowUps += siteFollowUps;
      totalRecurredAtFollowUp += siteRecurred;

      if (siteFollowUps > 0) {
        const recurrenceRate = Math.round((siteRecurred / siteFollowUps) * 100);
        const topPersistent = Object.entries(persistentIssues)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([issue, times]) => ({ issue, times }));
        siteResults.push({ site, followUps: siteFollowUps, recurred: siteRecurred, recurrenceRate, topPersistent });
      }
    }

    siteResults.sort((a, b) => b.recurrenceRate - a.recurrenceRate);
    const globalRecurrenceRate = totalFollowUps > 0
      ? Math.round((totalRecurredAtFollowUp / totalFollowUps) * 100) : 0;

    // Sites with the worst unresolved issue rates
    const problemSites = siteResults.filter(s => s.recurrenceRate >= 50 && s.followUps >= 2);

    return { siteResults: siteResults.slice(0, 8), problemSites, globalRecurrenceRate, totalFollowUps };
  },
};

/* ══════════════════════════════════════════════════════════════════
   HealthInspectorModel  — domain intelligence based on how real
   health inspectors think and act.

   Inspectors follow a mental model built around risk categories:
   1. Temperature Control   — danger zone (41–135°F), cooling, cold-hold
   2. Cross-Contamination   — raw vs ready-to-eat, storage order, color codes
   3. Personal Hygiene      — handwashing, glove use, illness policy
   4. Food Source & Dating  — FIFO, date labels, approved sources
   5. Facility Sanitation   — surfaces, equipment cleanliness, pest control
   6. Equipment Function    — calibrated thermometers, sanitizer concentration

   This module analyses history through that lens and surfaces risk
   signals that standard pass/fail analysis misses.
══════════════════════════════════════════════════════════════════ */
const HealthInspectorModel = {
  // FDA food code risk categories mapped to the app's issue text patterns
  RISK_CATEGORIES: {
    tempControl: {
      label: "Temperature Control",
      icon: "🌡️",
      patterns: [/temp/i, /°f/i, /danger zone/i, /cool/i, /cold.?hold/i, /hot.?hold/i, /thaw/i, /refrigerat/i, /freezer/i, /warmer/i],
      fdaRisk: "Priority (FDA Risk Factor)",
    },
    crossContam: {
      label: "Cross-Contamination",
      icon: "⚠️",
      patterns: [/cross.?contam/i, /raw/i, /ready.?to.?eat/i, /rte/i, /storage order/i, /color code/i, /cutting board/i, /separate/i, /above/i],
      fdaRisk: "Priority (FDA Risk Factor)",
    },
    hygiene: {
      label: "Personal Hygiene",
      icon: "🧼",
      patterns: [/handwash/i, /hand wash/i, /glove/i, /bare hand/i, /illness/i, /sick/i, /hair/i, /jewelry/i, /nail/i, /hygiene/i],
      fdaRisk: "Priority Foundation (FDA)",
    },
    foodSource: {
      label: "Food Source & Dating",
      icon: "📦",
      patterns: [/date label/i, /date mark/i, /fifo/i, /first in/i, /expir/i, /approved source/i, /undated/i, /unlabeled/i, /shelf life/i],
      fdaRisk: "Priority Foundation (FDA)",
    },
    sanitation: {
      label: "Facility & Equipment Sanitation",
      icon: "🧹",
      patterns: [/clean/i, /sanitiz/i, /grease/i, /residue/i, /mold/i, /pest/i, /rodent/i, /insect/i, /floor/i, /wall/i, /ceiling/i, /drain/i],
      fdaRisk: "Good Retail Practice",
    },
    equipment: {
      label: "Equipment Function",
      icon: "🔧",
      patterns: [/broken/i, /not work/i, /malfunction/i, /calibrat/i, /thermometer/i, /sanitizer concentration/i, /ecolab/i, /repair/i, /replace/i],
      fdaRisk: "Good Retail Practice",
    },
  },

  // Analyse a set of inspection records through the health inspector lens
  analyse(history) {
    if (!history || history.length < 2) return null;

    const catCounts = {};
    for (const key of Object.keys(this.RISK_CATEGORIES)) catCounts[key] = { count: 0, sites: new Set(), issues: [] };

    let priorityViolations = 0;
    let totalIssues = 0;

    for (const rec of history) {
      for (const item of (rec.actionItems || [])) {
        const issueText = item.issue || "";
        totalIssues++;
        for (const [key, cat] of Object.entries(this.RISK_CATEGORIES)) {
          if (cat.patterns.some(p => p.test(issueText))) {
            catCounts[key].count++;
            catCounts[key].sites.add(siteKey(rec));
            catCounts[key].issues.push(issueText);
            if (cat.fdaRisk.startsWith("Priority")) priorityViolations++;
            break; // assign to first matching category only
          }
        }
      }
    }

    const breakdown = Object.entries(catCounts)
      .map(([key, v]) => ({
        key,
        label: this.RISK_CATEGORIES[key].label,
        icon: this.RISK_CATEGORIES[key].icon,
        fdaRisk: this.RISK_CATEGORIES[key].fdaRisk,
        count: v.count,
        siteCount: v.sites.size,
        rate: totalIssues > 0 ? Math.round((v.count / totalIssues) * 100) : 0,
        // Top 3 specific issues in this category
        topIssues: (() => {
          const cnt = {};
          for (const iss of v.issues) { cnt[iss] = (cnt[iss] || 0) + 1; }
          return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([i,c])=>({issue:i,count:c}));
        })(),
      }))
      .sort((a, b) => b.count - a.count);

    // Priority Violations Ratio: what % of all issues are FDA Priority (highest risk)?
    const priorityRatio = totalIssues > 0 ? Math.round((priorityViolations / totalIssues) * 100) : 0;

    // Walkthrough coverage: which FDA risk categories are never flagged (possible blind spots)?
    const neverFlagged = breakdown.filter(b => b.count === 0 && b.fdaRisk.startsWith("Priority"));

    return {
      breakdown,
      priorityViolations,
      priorityRatio,
      totalIssues,
      neverFlagged,
      topCategory: breakdown[0] || null,
    };
  },

  // Evaluate a single inspection record for immediate risk signals
  evaluateRecord(record) {
    if (!record) return null;
    const signals = [];
    const items = record.actionItems || [];

    // Temperature danger zone detection
    const tempItems = items.filter(i => this.RISK_CATEGORIES.tempControl.patterns.some(p => p.test(i.issue || "")));
    if (tempItems.length >= 2) {
      signals.push({ type: "tempControl", severity: "critical", message: `${tempItems.length} temperature-related issues on this inspection` });
    }

    // Cross-contamination red flags
    const contamItems = items.filter(i => this.RISK_CATEGORIES.crossContam.patterns.some(p => p.test(i.issue || "")));
    if (contamItems.length > 0) {
      signals.push({ type: "crossContam", severity: "critical", message: `Cross-contamination risk flagged` });
    }

    // Priority violation density
    let priorityCount = 0;
    for (const item of items) {
      for (const cat of Object.values(this.RISK_CATEGORIES)) {
        if (cat.fdaRisk.startsWith("Priority") && cat.patterns.some(p => p.test(item.issue || ""))) {
          priorityCount++;
          break;
        }
      }
    }
    if (priorityCount >= 3) {
      signals.push({ type: "highPriority", severity: "high", message: `${priorityCount} FDA Priority violations in one inspection` });
    }

    return signals.length > 0 ? signals : null;
  },
};

/* ══════════════════════════════════════════════════════════════════
   InspectionWorkflowTracker  — tracks how inspectors actually move
   through the form: which sections they engage, in what order,
   how many fields they complete vs skip.

   This feeds a "thoroughness score" and "section gap" signal into
   the AI engine, so suggestions can improve over time based on
   actual inspector behavior patterns.
══════════════════════════════════════════════════════════════════ */
let WORKFLOW_KEY = "sdx_ai_workflow_v1";

const InspectionWorkflowTracker = {
  // The canonical section order a health inspector should follow
  SECTION_ORDER: [
    "temps",          // 1. Temperature checks (highest risk — do first)
    "equipment",      // 2. Equipment status
    "foodStorage",    // 3. Food storage / FIFO
    "hygiene",        // 4. Personal hygiene observation
    "sanitation",     // 5. Surface / facility cleanliness
    "documentation",  // 6. Labels, records, certifications
  ],

  // Record which sections were touched in a saved inspection
  recordCoverage(record) {
    if (!record) return;
    const data = loadJSON(WORKFLOW_KEY, { sessions: [] });

    const temps  = record.temps && Object.values(record.temps).some(v => v && String(v).trim() !== "");
    // Equipment lives at record.inspection.equipment (saved records) or record.equipment (legacy)
    const equipObj = record.inspection?.equipment || record.equipment || {};
    const equip  = Object.values(equipObj).some(e => e?.status && e.status !== "");
    const notes  = (record.rawNotes || "").trim().length > 30;
    const items  = (record.actionItems || []).length;
    const hasFoodTemps = record.foodTemps && Object.values(record.foodTemps).some(v => v && Number(v) > 0);
    const photos = Number(record.photoCount) || 0;

    // Compute a simple thoroughness score (0-100)
    // temps(20) + equip(20) + notes(15) + supervisorName(10) + floor(10) + items(5)
    // + foodTemps(10) + photos(10) = 100 max
    let score = 0;
    if (temps)  score += 20;
    if (equip)  score += 20;
    if (notes)  score += 15;
    if (record.supervisorName?.trim()) score += 10;
    if (record.floor?.trim()) score += 10;
    if (items > 0) score += 5;
    if (hasFoodTemps) score += 10;
    if (photos >= 1) score += 5;
    if (photos >= 3) score += 5; // extra 5 for 3+ photos (total 10 photo points)

    data.sessions.push({
      date: record.inspectionDate || todayKey(),
      site: record.siteName || "Unknown",
      inspector: record.inspectorName || "Unknown",
      hasTemps: temps,
      hasEquip: equip,
      hasNotes: notes,
      hasFoodTemps: !!hasFoodTemps,
      hasActionItems: items > 0,
      actionItemCount: items,
      photoCount: photos,
      thoroughnessScore: score,
      savedAt: nowISO(),
    });

    // Keep last 200 sessions
    if (data.sessions.length > 200) data.sessions = data.sessions.slice(-200);
    saveJSON(WORKFLOW_KEY, data);
  },

  // Aggregate workflow data for suggestions
  analyse() {
    const data = loadJSON(WORKFLOW_KEY, { sessions: [] });
    const s = data.sessions;
    if (s.length < 3) return null;

    const total = s.length;
    const noTemps      = s.filter(x => !x.hasTemps).length;
    const noEquip      = s.filter(x => !x.hasEquip).length;
    const noNotes      = s.filter(x => !x.hasNotes).length;
    const noItems      = s.filter(x => !x.hasActionItems).length;
    const noFoodTemps  = s.filter(x => !x.hasFoodTemps).length;
    const noPhotos     = s.filter(x => !x.photoCount).length;
    const avgScore = Math.round(s.reduce((sum, x) => sum + (x.thoroughnessScore || 0), 0) / total);

    // Per-inspector thoroughness (last 20 sessions per inspector)
    const byInspector = {};
    for (const sess of s) {
      const insp = sess.inspector || "Unknown";
      if (!byInspector[insp]) byInspector[insp] = { scores: [], noTempsCount: 0, total: 0 };
      byInspector[insp].scores.push(sess.thoroughnessScore || 0);
      if (!sess.hasTemps) byInspector[insp].noTempsCount++;
      byInspector[insp].total++;
    }
    const inspectorWorkflow = Object.entries(byInspector)
      .filter(([, v]) => v.total >= 3)
      .map(([name, v]) => ({
        name,
        avgScore: Math.round(v.scores.reduce((a,b)=>a+b,0) / v.scores.length),
        noTempsRate: Math.round((v.noTempsCount / v.total) * 100),
        total: v.total,
      }))
      .sort((a, b) => a.avgScore - b.avgScore); // worst first

    return {
      total,
      avgThoroughnessScore: avgScore,
      noTempsRate:     Math.round((noTemps     / total) * 100),
      noEquipRate:     Math.round((noEquip     / total) * 100),
      noNotesRate:     Math.round((noNotes     / total) * 100),
      noItemsRate:     Math.round((noItems     / total) * 100),
      noFoodTempsRate: Math.round((noFoodTemps / total) * 100),
      noPhotosRate:    Math.round((noPhotos    / total) * 100),
      inspectorWorkflow,
      // Trend: last 5 vs prior 5 thoroughness scores
      recentTrend: (() => {
        if (s.length < 10) return null;
        const recent = s.slice(-5).reduce((a, b) => a + (b.thoroughnessScore || 0), 0) / 5;
        const prior  = s.slice(-10, -5).reduce((a, b) => a + (b.thoroughnessScore || 0), 0) / 5;
        return Math.round(recent - prior);
      })(),
    };
  },
};

/* ══════════════════════════════════════════════════════════════════
   PatternMiner  — scans inspection history to extract new patterns
══════════════════════════════════════════════════════════════════ */
const PatternMiner = {
  mine(history) {
    if (!history || history.length < 1) return {};

    const patterns = {
      minedAt: nowISO(),
      totalRecords: history.length,
      passRate: 0,
      failRate: 0,
      topIssues: [],
      weakLocations: [],
      scheduleGaps: [],
      tempAlerts: [],
      foodTempAlerts: [],
      inspectorStats: [],
      monthlyTrend: [],
      avgIssuesPerReport: 0,
      topSupplies: [],
      noteTypeBreakdown: [],
      // deep profiles
      inspectorProfiles: [],
      supervisorProfiles: [],
      locationProfile: { byFloor: [], byType: [], bySite: [] },
      behavior: {},
    };

    const sorted = [...history].sort((a, b) =>
      (a.inspectionDate || "").localeCompare(b.inspectionDate || "")
    );

    // ── Pass / Fail rates ──────────────────────────────────
    const passes = sorted.filter(r => r.overallStatus === "Pass").length;
    patterns.passRate = Math.round((passes / sorted.length) * 100);
    patterns.failRate = 100 - patterns.passRate;

    // ── Issue category totals ──────────────────────────────
    const catMap = {};
    let totalIssues = 0;
    for (const rec of sorted) {
      const loc = rec.siteName || rec.location || "Unknown";
      for (const item of (rec.actionItems || [])) {
        const cat = (item.issue || "").split(":")[0].trim() || "Other";
        if (!catMap[cat]) catMap[cat] = { count: 0, locations: new Set() };
        catMap[cat].count += 1;
        catMap[cat].locations.add(loc);
        totalIssues += 1;
      }
    }
    patterns.avgIssuesPerReport = sorted.length
      ? parseFloat((totalIssues / sorted.length).toFixed(1)) : 0;
    patterns.topIssues = Object.entries(catMap)
      .map(([cat, v]) => ({
        category: cat,
        count: v.count,
        rate: Math.round((v.count / sorted.length) * 100),
        locationCount: v.locations.size,
        locations: [...v.locations].slice(0, 4),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Weak locations (fail rate ≥ 40%) ──────────────────
    const locMap = {};
    for (const rec of sorted) {
      const loc = `${siteKey(rec)}${rec.floor ? ` (${rec.floor})` : ""}`;
      if (!locMap[loc]) locMap[loc] = { total: 0, fails: 0, issueCats: {} };
      locMap[loc].total += 1;
      if (rec.overallStatus !== "Pass") locMap[loc].fails += 1;
      for (const item of (rec.actionItems || [])) {
        const cat = (item.issue || "").split(":")[0].trim() || "Other";
        locMap[loc].issueCats[cat] = (locMap[loc].issueCats[cat] || 0) + 1;
      }
    }
    patterns.weakLocations = Object.entries(locMap)
      .filter(([, v]) => v.total >= 2 && v.fails / v.total >= 0.4)
      .map(([loc, v]) => {
        const topIssue = Object.entries(v.issueCats).sort((a, b) => b[1] - a[1])[0];
        return {
          location: loc,
          failCount: v.fails,
          total: v.total,
          failRate: Math.round((v.fails / v.total) * 100),
          topIssue: topIssue ? topIssue[0] : null,
        };
      })
      .sort((a, b) => b.failRate - a.failRate)
      .slice(0, 6);

    // ── Schedule gaps ──────────────────────────────────────
    const now = new Date();
    for (const [loc, v] of Object.entries(locMap)) {
      const recsForLoc = sorted.filter(r =>
        (`${r.siteName || r.location || "Unknown"}${r.floor ? ` (${r.floor})` : ""}`) === loc
      );
      if (!recsForLoc.length) continue;
      const lastRec = recsForLoc[recsForLoc.length - 1];
      const lastDate = new Date(lastRec.inspectionDate || 0);
      const daysSince = Math.floor((now - lastDate) / 86400000);
      if (daysSince >= 21) {
        patterns.scheduleGaps.push({
          location: loc,
          daysSince,
          hadIssues: (lastRec.actionItems || []).length > 0,
          severity: daysSince >= 60 ? "critical" : daysSince >= 40 ? "high" : "watch",
        });
      }
    }
    patterns.scheduleGaps.sort((a, b) => b.daysSince - a.daysSince);

    // ── Temperature alerts ─────────────────────────────────
    const TEMP_CHECKS = [
      { path: r => Number(r.temps?.handSinkTempF || 0), label: "Hand Sink", min: 95, direction: "down" },
      { path: r => Number(r.temps?.threeCompSinkTempF || 0), label: "3-Comp Sink", min: 110, direction: "down" },
    ];
    for (const [loc,] of Object.entries(locMap)) {
      const recsForLoc = sorted.filter(r =>
        (`${r.siteName || r.location || "Unknown"}${r.floor ? ` (${r.floor})` : ""}`) === loc
      );
      for (const check of TEMP_CHECKS) {
        const vals = recsForLoc.map(r => check.path(r)).filter(v => v > 0);
        if (vals.length < 3) continue;
        const last3 = vals.slice(-3);
        const trending = last3[0] > last3[1] && last3[1] > last3[2];
        if (!trending) continue;
        const gap = last3[2] - check.min;
        if (gap > 15) continue;
        patterns.tempAlerts.push({
          location: loc,
          metric: check.label,
          currentVal: last3[2],
          threshold: check.min,
          trend: `${last3[0]}→${last3[1]}→${last3[2]}°F`,
          gapToLimit: Math.abs(gap).toFixed(1),
          severity: gap <= 5 ? "critical" : "warning",
        });
      }
    }

    // ── Food temperature alerts (cold holding >41°F, hot holding <135°F) ──
    // foodTemps is an object: { slot1: tempValue, slot2: tempValue, ... }
    // foodTempNames is: { slot1: "Chicken", slot2: "Rice", ... }
    const COLD_MAX = 41;  // °F — FDA cold holding limit
    const HOT_MIN  = 135; // °F — FDA hot holding minimum
    const foodTempViolationMap = {}; // { [site]: { violations: [], dates: [] } }
    for (const rec of sorted) {
      const ft    = rec.foodTemps    || {};
      const ftNames = rec.foodTempNames || {};
      const site  = siteKey(rec);
      const date  = rec.inspectionDate || rec.savedAt || "";
      for (const [slot, rawVal] of Object.entries(ft)) {
        const val = Number(rawVal);
        if (!val || isNaN(val)) continue;
        const itemName = ftNames[slot] || slot;
        // Determine if cold or hot holding based on value range heuristic:
        //   <50°F likely cold holding, >100°F likely hot holding
        let violation = false;
        let type = "";
        if (val < 50 && val > COLD_MAX) { violation = true; type = "cold"; }
        else if (val > 100 && val < HOT_MIN) { violation = true; type = "hot"; }
        if (!violation) continue;
        if (!foodTempViolationMap[site]) foodTempViolationMap[site] = [];
        foodTempViolationMap[site].push({ item: itemName, val, type, date });
      }
    }
    // Summarize top sites by food temp violation frequency
    patterns.foodTempAlerts = Object.entries(foodTempViolationMap)
      .map(([site, viols]) => {
        const coldViols = viols.filter(v => v.type === "cold");
        const hotViols  = viols.filter(v => v.type === "hot");
        const lastDate  = viols.map(v => v.date).sort().reverse()[0] || "";
        return {
          site,
          violationCount: viols.length,
          coldViolations: coldViols.length,
          hotViolations:  hotViols.length,
          lastDate,
          severity: viols.length >= 5 ? "critical" : viols.length >= 2 ? "warning" : "watch",
          recentItems: viols.slice(-3).map(v => `${v.item}: ${v.val}°F (${v.type})`),
        };
      })
      .sort((a, b) => b.violationCount - a.violationCount)
      .slice(0, 10);

    // ── Supplies needed aggregation ────────────────────────
    // suppliesNeeded is an array of { item: string } objects
    const supplyMap = {};
    for (const rec of sorted) {
      const supplies = rec.suppliesNeeded || [];
      for (const s of supplies) {
        const item = (s.item || "").trim();
        if (!item) continue;
        const key = item.toLowerCase();
        if (!supplyMap[key]) supplyMap[key] = { label: item, count: 0, sites: new Set() };
        supplyMap[key].count++;
        supplyMap[key].sites.add(siteKey(rec));
      }
    }
    patterns.topSupplies = Object.values(supplyMap)
      .map(v => ({ item: v.label, count: v.count, siteCount: v.sites.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // ── Note type breakdown (from behavior, re-exposed for SuggestionGen) ──
    const ntFreq = {};
    for (const rec of sorted) {
      if (rec.noteType) ntFreq[rec.noteType] = (ntFreq[rec.noteType] || 0) + 1;
    }
    patterns.noteTypeBreakdown = Object.entries(ntFreq)
      .map(([type, count]) => ({ type, count, pct: Math.round((count / sorted.length) * 100) }))
      .sort((a, b) => b.count - a.count);

    // ── Inspector stats (basic) ────────────────────────────
    const inspMap = {};
    for (const rec of sorted) {
      const name = rec.inspectorName || "Unknown";
      if (!inspMap[name]) inspMap[name] = { count: 0, passes: 0 };
      inspMap[name].count += 1;
      if (rec.overallStatus === "Pass") inspMap[name].passes += 1;
    }
    patterns.inspectorStats = Object.entries(inspMap)
      .map(([name, v]) => ({
        name,
        count: v.count,
        passRate: Math.round((v.passes / v.count) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ── Monthly trend ──────────────────────────────────────
    const monthMap = {};
    for (const rec of sorted) {
      const m = (rec.inspectionDate || "").slice(0, 7);
      if (!m) continue;
      if (!monthMap[m]) monthMap[m] = { passCount: 0, failCount: 0, total: 0 };
      monthMap[m].total += 1;
      if (rec.overallStatus === "Pass") monthMap[m].passCount += 1;
      else monthMap[m].failCount += 1;
    }
    patterns.monthlyTrend = Object.entries(monthMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, v]) => ({
        month,
        passCount: v.passCount,
        failCount: v.failCount,
        total: v.total,
        passRate: Math.round((v.passCount / v.total) * 100),
      }));

    // ── Weekly trend (last 8 weeks) ────────────────────────
    const weekMap = {};
    for (const rec of sorted) {
      const d = new Date(rec.inspectionDate || 0);
      if (isNaN(d)) continue;
      // ISO week key: year + week number
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
      const wk = `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
      if (!weekMap[wk]) weekMap[wk] = { passCount: 0, total: 0 };
      weekMap[wk].total += 1;
      if (rec.overallStatus === "Pass") weekMap[wk].passCount += 1;
    }
    patterns.weeklyTrend = Object.entries(weekMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([week, v]) => ({
        week,
        passCount: v.passCount,
        failCount: v.total - v.passCount,
        total: v.total,
        passRate: Math.round((v.passCount / v.total) * 100),
      }));

    // ── Seasonal pattern (by calendar month across all years) ─
    const seasonMap = {};
    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    for (const rec of sorted) {
      const d = new Date(rec.inspectionDate || 0);
      if (isNaN(d)) continue;
      const mo = d.getMonth(); // 0-11
      if (!seasonMap[mo]) seasonMap[mo] = { passCount: 0, total: 0 };
      seasonMap[mo].total += 1;
      if (rec.overallStatus === "Pass") seasonMap[mo].passCount += 1;
    }
    patterns.seasonalPattern = Object.entries(seasonMap)
      .map(([mo, v]) => ({
        month: MONTH_NAMES[Number(mo)],
        monthIndex: Number(mo),
        total: v.total,
        passRate: Math.round((v.passCount / v.total) * 100),
      }))
      .sort((a, b) => a.monthIndex - b.monthIndex);

    // ── Deep profiles ──────────────────────────────────────
    patterns.inspectorProfiles  = InspectorProfiler.mine(history);
    patterns.supervisorProfiles = SupervisorProfiler.mine(history);
    patterns.locationProfile    = LocationProfiler.mine(history);
    patterns.behavior           = BehaviorTracker.mine(history);
    patterns.crossInspector     = CrossInspectorAnalyzer.mine(history);
    patterns.issueResolution    = IssueResolutionTracker.mine(history);
    patterns.healthInspector    = HealthInspectorModel.analyse(history);
    patterns.workflow           = InspectionWorkflowTracker.analyse();

    // ── Equipment inventory aggregation (temporal / ownership-aware) ──────────
    // Strategy: for each site, only the MOST RECENT inspection counts.
    // This means removed equipment falls off naturally — if a white freezer was
    // at a site for one event but is gone now, the latest inspection won't have it.
    // equipSource tracks: "Facility" | "Subcontractor" | "Stadium" | "Event"
    // result: { [equipKey]: { label, fleetTotal, siteCount, avgPerSite,
    //           siteBreakdown: [{site, count, source, lastSeen}],
    //           sources: {Facility:n, Subcontractor:n, Stadium:n, Event:n} } }
    const EQUIP_LABEL_MAP = {
      doubleDoorCooler:  "Double-Door Cooler",
      doubleDoorFreezer: "Double-Door Freezer",
      walkInCooler:      "Walk-In Cooler",
      walkInFreezer:     "Walk-In Freezer",
      prepCooler:        "Prep Cooler",
      warmers:           "Warmers",
      ovens:             "Ovens",
      threeCompSink:     "3-Comp Sink",
      ecolab:            "Ecolab / Sanitizer",
    };

    // Normalize a user-entered equipment label to a canonical EQUIP_LABEL_MAP key.
    // Strips brand names so "Delfield Double Door Cooler" → "doubleDoorCooler".
    // Returns null if no canonical type can be determined.
    function normalizeEquipKey(rawLabel) {
      const l = (rawLabel || "").toLowerCase();
      if (/walk.?in.*freezer|walk.?in.*frz|wif\b/.test(l)) return "walkInFreezer";
      if (/walk.?in.*cool|walk.?in.*ref|wic\b|w\.i\.c/.test(l))  return "walkInCooler";
      if (/prep.*freezer|freezer.*prep/.test(l))                  return "doubleDoorFreezer";
      if (/prep.*cool|cool.*prep/.test(l))                        return "prepCooler";
      if (/double.?door.*freezer|two.?door.*freezer|2.?door.*freezer|freezer.*double|reach.?in.*freezer/.test(l)) return "doubleDoorFreezer";
      if (/double.?door.*cool|two.?door.*cool|2.?door.*cool|cool.*double|reach.?in.*cool|reach.?in.*ref/.test(l)) return "doubleDoorCooler";
      if (/freezer|freez/.test(l)) return "doubleDoorFreezer";
      if (/cooler|refrig|cool/.test(l)) return "doubleDoorCooler";
      if (/warmer|warming/.test(l)) return "warmers";
      if (/oven|convect/.test(l)) return "ovens";
      if (/3.?comp|three.?comp|3 comp/.test(l)) return "threeCompSink";
      if (/ecolab|sanitiz|chemical dispens/.test(l)) return "ecolab";
      return null;
    }

    // Step 1 — Build a map of site → latestDate so we know which record to use per site.
    // sorted is already chronological (oldest→newest), so we iterate and keep overwriting.
    // siteLatest: { [site]: { date, equipment } }
    const siteLatest = {};
    for (const rec of sorted) {
      const site = siteKey(rec);
      const recDate = rec.inspectionDate || rec.savedAt || "";
      const equipment = rec.inspection?.equipment || rec.equipment || {};
      // Only update if this record is newer than what we have for this site
      const prev = siteLatest[site];
      if (!prev || recDate >= prev.date) {
        siteLatest[site] = { date: recDate, equipment };
      }
    }

    // Step 2 — Aggregate across sites using only the latest snapshot per site.
    // equipMap: { [key]: { label, sites: { [site]: {count, source, lastSeen} } } }
    const equipMap = {};
    for (const [site, { date, equipment }] of Object.entries(siteLatest)) {
      for (const [key, item] of Object.entries(equipment)) {
        // skip items marked as N/A — equipment is not present at this site
        if (item?.notApplicable === true) continue;

        // Determine count — explicit value wins; if blank but the item was
        // actually used (has a status, temp reading, or notes) default to 1
        const countVal = item?.count ?? "";
        let n;
        if (countVal !== "" && countVal !== null && countVal !== undefined) {
          n = Number(countVal);
          if (isNaN(n) || n <= 0) continue;
        } else {
          const hasStatus = item?.status && item.status !== "";
          const hasTemp   = item?.tempF  && item.tempF  !== "";
          const hasNotes  = item?.notes  && item.notes  !== "";
          const hasName   = item?.label  && item.label  !== "";
          if (!hasStatus && !hasTemp && !hasNotes && !hasName) continue;
          n = 1;
        }

        // Key by specific label — matching PerformanceDashboard "latest inspection wins".
        // If the item has a user-entered label (e.g. "Prep Cooler", "Walk-In Freezer"),
        // use that as the key so distinct equipment names stay as separate rows.
        // Fall back to the canonical key only when no label is present.
        const rawLabel = (item?.label || "").trim();
        const equipKey = rawLabel || key;
        const label    = rawLabel || EQUIP_LABEL_MAP[key] || key;
        const source   = item?.equipSource || "Facility";
        if (!equipMap[equipKey]) equipMap[equipKey] = { label, sites: {} };
        const prev = equipMap[equipKey].sites[site];
        equipMap[equipKey].sites[site] = {
          count: (prev?.count || 0) + n,
          source,
          lastSeen: date,
        };
      }
    }

    patterns.equipmentInventory = Object.entries(equipMap).map(([key, v]) => {
      const siteBreakdown = Object.entries(v.sites)
        .map(([site, s]) => ({ site, count: s.count, source: s.source, lastSeen: s.lastSeen }))
        .sort((a, b) => b.count - a.count);
      const siteCount = siteBreakdown.length;
      const fleetTotal = siteBreakdown.reduce((sum, s) => sum + s.count, 0);
      // Tally counts by ownership source
      const sources = { Facility: 0, Subcontractor: 0, Stadium: 0, Event: 0 };
      for (const s of siteBreakdown) {
        const src = s.source || "Facility";
        sources[src] = (sources[src] || 0) + s.count;
      }
      const temporaryUnits = (sources.Subcontractor || 0) + (sources.Stadium || 0) + (sources.Event || 0);
      return {
        key,
        label: v.label,
        fleetTotal,
        siteCount,
        avgPerSite: siteCount ? parseFloat((fleetTotal / siteCount).toFixed(1)) : 0,
        siteBreakdown: siteBreakdown.slice(0, 10),
        sources,
        temporaryUnits, // non-facility units that may come and go
      };
    }).sort((a, b) => b.fleetTotal - a.fleetTotal);

    // ── Equipment absence detection ────────────────────────────────────────────
    // Build historical roster per site (across ALL records, not just the latest).
    // If a piece of equipment appeared ≥2 times historically at a site but is
    // completely absent from the most recent inspection, flag it as possibly removed.
    const siteHistorical = {};  // { [site]: { [equipKey]: { count, lastSeen, label } } }
    for (const rec of sorted) {
      const site = siteKey(rec);
      const equipment = rec.inspection?.equipment || rec.equipment || {};
      if (!siteHistorical[site]) siteHistorical[site] = {};
      for (const [key, item] of Object.entries(equipment)) {
        if (item?.notApplicable === true) continue;
        const countVal = item?.count ?? "";
        let n;
        if (countVal !== "" && countVal !== null && countVal !== undefined) {
          n = Number(countVal);
          if (isNaN(n) || n <= 0) continue;
        } else {
          const hasStatus = item?.status && item.status !== "";
          const hasTemp   = item?.tempF  && item.tempF  !== "";
          const hasNotes  = item?.notes  && item.notes  !== "";
          const hasName   = item?.label  && item.label  !== "";
          if (!hasStatus && !hasTemp && !hasNotes && !hasName) continue;
          n = 1;
        }
        const recDate = rec.inspectionDate || rec.savedAt || "";
        const label = EQUIP_LABEL_MAP[key] || item?.label || key;
        if (!siteHistorical[site][key]) siteHistorical[site][key] = { count: 0, lastSeen: "", label };
        siteHistorical[site][key].count += n;
        if (recDate > siteHistorical[site][key].lastSeen) siteHistorical[site][key].lastSeen = recDate;
      }
    }

    // Cross-reference with siteLatest: flag equipment absent from the latest snapshot
    const equipAbsence = [];
    for (const [site, equipHist] of Object.entries(siteHistorical)) {
      const latestEquip = siteLatest[site]?.equipment || {};
      const latestDate  = siteLatest[site]?.date || "";
      for (const [key, hist] of Object.entries(equipHist)) {
        if (hist.count < 2) continue; // need ≥2 historical occurrences to be confident
        const latestItem = latestEquip[key];
        const latestNA   = latestItem?.notApplicable === true;
        // Absent = either not present in latest OR explicitly marked N/A
        const latestCount = latestItem ? (() => {
          const cv = latestItem.count ?? "";
          if (cv !== "" && cv !== null) { const n = Number(cv); return isNaN(n) ? 0 : n; }
          const has = (latestItem.status || latestItem.tempF || latestItem.notes || latestItem.label);
          return has ? 1 : 0;
        })() : 0;
        if (!latestNA && latestCount > 0) continue; // still present in latest — no issue
        equipAbsence.push({
          site,
          equipKey: key,
          label: hist.label,
          historicalCount: hist.count,
          lastSeenDate: hist.lastSeen,
          latestInspDate: latestDate,
          markedNA: latestNA,
        });
      }
    }
    patterns.equipmentAbsence = equipAbsence;

    // ── Equipment Health Scores ──────────────────────────────────────────────
    // Compute flag rates per category (coolers/freezers/sinks/other) from actionItems
    const EQUIP_CAT_KW = {
      coolers:  ["cooler"],
      freezers: ["freezer"],
      sinks:    ["sink"],
      other:    ["warmer", "oven", "grill", "prep", "shelf", "rack", "hood", "fryer", "refriger"],
    };
    const equipSeen = { coolers: 0, freezers: 0, sinks: 0, other: 0 };
    const equipFlagged = { coolers: 0, freezers: 0, sinks: 0, other: 0 };
    const nowMs = Date.now();
    const recent30 = sorted.filter(r => (nowMs - new Date(r.inspectionDate || 0).getTime()) < 30 * 86400000);
    const prior30  = sorted.filter(r => { const ms = nowMs - new Date(r.inspectionDate || 0).getTime(); return ms >= 30 * 86400000 && ms < 60 * 86400000; });
    for (const rec of sorted) {
      const hasEquip = Object.keys(rec.inspection?.equipment || rec.equipment || {}).length > 0;
      if (!hasEquip) continue;
      const flags = { coolers: false, freezers: false, sinks: false, other: false };
      for (const it of (rec.actionItems || [])) {
        const txt = (it.issue || "").toLowerCase();
        for (const [cat, kws] of Object.entries(EQUIP_CAT_KW)) {
          if (kws.some(kw => txt.includes(kw))) flags[cat] = true;
        }
      }
      for (const cat of Object.keys(equipSeen)) {
        equipSeen[cat]++;
        if (flags[cat]) equipFlagged[cat]++;
      }
    }
    const equipHealthScores = {};
    for (const cat of Object.keys(equipSeen)) {
      const total = equipSeen[cat];
      if (!total) { equipHealthScores[cat] = null; continue; }
      const flagCount = equipFlagged[cat];
      const kws = EQUIP_CAT_KW[cat];
      const recentFl = recent30.filter(r => (r.actionItems || []).some(it => kws.some(kw => (it.issue || "").toLowerCase().includes(kw)))).length;
      const priorFl  = prior30.filter(r =>  (r.actionItems || []).some(it => kws.some(kw => (it.issue || "").toLowerCase().includes(kw)))).length;
      const recentRate = recent30.length ? recentFl / recent30.length : 0;
      const priorRate  = prior30.length  ? priorFl  / prior30.length  : 0;
      equipHealthScores[cat] = {
        healthPct: Math.round(100 - (flagCount / total * 100)),
        flagCount,
        total,
        trend: prior30.length > 0 ? Math.round((priorRate - recentRate) * 100) : 0,
      };
    }
    patterns.equipHealthScores = equipHealthScores;

    // ── Maintenance Priority ─────────────────────────────────────────────────
    // Most-flagged equipment issues across all sites, ranked by total flag count
    const maintMap = {};
    for (const rec of sorted) {
      const site = rec.siteName || rec.location || "Unknown";
      const date = rec.inspectionDate || rec.savedAt || "";
      for (const it of (rec.actionItems || [])) {
        const full = it.issue || "";
        const label = full.includes(":") ? full.split(":").slice(1).join(":").trim() : full;
        if (!label) continue;
        const txt = full.toLowerCase();
        const cat = txt.includes("cooler") ? "coolers" : txt.includes("freezer") ? "freezers" : txt.includes("sink") ? "sinks" : "other";
        if (!maintMap[label]) maintMap[label] = { count: 0, sites: {}, lastSeen: "", category: cat };
        maintMap[label].count++;
        maintMap[label].sites[site] = (maintMap[label].sites[site] || 0) + 1;
        if (date > maintMap[label].lastSeen) maintMap[label].lastSeen = date;
      }
    }
    patterns.maintenancePriority = Object.entries(maintMap)
      .map(([label, v], i) => ({
        rank: i + 1,
        label,
        totalFlags: v.count,
        category: v.category,
        sites: Object.entries(v.sites).map(([site, count]) => ({ site, count })).sort((a, b) => b.count - a.count),
        lastSeen: v.lastSeen,
        urgency: v.count > 10 ? "critical" : v.count >= 5 ? "high" : v.count >= 2 ? "medium" : "low",
      }))
      .sort((a, b) => b.totalFlags - a.totalFlags)
      .slice(0, 10)
      .map((item, i) => ({ ...item, rank: i + 1 }));

    // ── Equipment Anomalies (3+ consecutive flags at same site) ─────────────
    const siteRecs = {};
    for (const rec of sorted) {
      const site = rec.siteName || rec.location || "Unknown";
      if (!siteRecs[site]) siteRecs[site] = [];
      siteRecs[site].push(rec);
    }
    const anomalyList = [];
    for (const [site, recs] of Object.entries(siteRecs)) {
      if (recs.length < 3) continue;
      const issueSet = new Set(recs.flatMap(r => (r.actionItems || []).map(it => (it.issue || "").split(":")[0].trim())));
      for (const issueLabel of issueSet) {
        if (!issueLabel) continue;
        let run = 0, maxRun = 0, lastSeen = "";
        for (const rec of recs) {
          const has = (rec.actionItems || []).some(it => (it.issue || "").split(":")[0].trim() === issueLabel);
          if (has) { run++; const d = rec.inspectionDate || rec.savedAt || ""; if (d > lastSeen) lastSeen = d; }
          else run = 0;
          if (run > maxRun) maxRun = run;
        }
        if (maxRun >= 3) {
          const txt = issueLabel.toLowerCase();
          const cat = txt.includes("cooler") ? "coolers" : txt.includes("freezer") ? "freezers" : txt.includes("sink") ? "sinks" : "other";
          anomalyList.push({ site, label: issueLabel, consecutiveFlags: maxRun, lastSeen, category: cat });
        }
      }
    }
    patterns.equipAnomalies = anomalyList.sort((a, b) => b.consecutiveFlags - a.consecutiveFlags).slice(0, 8);

    saveJSON(PATTERNS_KEY, patterns);
    return patterns;
  },

  get() { return loadJSON(PATTERNS_KEY, null); },
};

/* ══════════════════════════════════════════════════════════════════
   SuggestionGen  — turns ALL patterns into improvement suggestions
══════════════════════════════════════════════════════════════════ */
const SuggestionGen = {
  generate(patterns, usageReport) {
    if (!patterns) return [];
    const suggestions = [];

    // ── 1. High-fail locations ─────────────────────────────
    for (const loc of (patterns.weakLocations || []).slice(0, 3)) {
      if (loc.failRate >= 60) {
        suggestions.push({
          id: `weak-loc-${loc.location}`,
          type: "quality",
          priority: loc.failRate >= 80 ? "critical" : "high",
          icon: "📍",
          title: `${loc.location} needs attention`,
          body: `This spot has failed ${loc.failRate}% of its inspections — that's ${loc.failCount} out of ${loc.total} visits. `
              + (loc.topIssue ? `The most common problem found there is "${loc.topIssue}". ` : "")
              + `Someone needs to go there, find out what's going wrong, and fix it.`,
          action: `Go to Past Reports, filter by "${loc.location}", and check all the flagged items`,
          category: "location",
        });
      }
    }

    // ── 2. Top recurring issue ─────────────────────────────
    if ((patterns.topIssues || []).length > 0) {
      const top = patterns.topIssues[0];
      if (top.rate >= 30) {
        suggestions.push({
          id: `top-issue-${top.category}`,
          type: "pattern",
          priority: top.rate >= 50 ? "high" : "medium",
          icon: "🔁",
          title: `"${top.category}" keeps showing up — it's your biggest problem right now`,
          body: `This issue has shown up in ${top.rate}% of all your inspections, across ${top.locationCount} location(s). `
              + `That means it's happening everywhere, not just in one spot. Something needs to change — whether that's more training, fixing equipment, or changing how things are done.`,
          action: `Find out why "${top.category}" keeps failing and fix the root cause — don't just note it each time`,
          category: "issue",
        });
      }
    }

    // ── 3. Schedule gaps ──────────────────────────────────
    const criticalGaps = (patterns.scheduleGaps || []).filter(g => g.severity === "critical");
    const highGaps     = (patterns.scheduleGaps || []).filter(g => g.severity === "high");
    if (criticalGaps.length > 0) {
      const g = criticalGaps[0];
      suggestions.push({
        id: `gap-critical-${g.location}`,
        type: "schedule",
        priority: "critical",
        icon: "⏰",
        title: `${g.location} hasn't been checked in ${g.daysSince} days — that's too long`,
        body: `You should be visiting every location at least once a month. This one has been missed. `
            + (g.hadIssues ? `The last time someone went there, there were problems that were never fully fixed — so it really needs a visit now.` : `Get someone out there soon.`),
        action: `Send an inspector to ${g.location} as soon as possible`,
        category: "schedule",
      });
    } else if (highGaps.length > 0) {
      suggestions.push({
        id: "gap-high-batch",
        type: "schedule",
        priority: "high",
        icon: "📅",
        title: `${highGaps.length} location${highGaps.length !== 1 ? "s" : ""} haven't been visited in over 40 days`,
        body: `These spots are overdue: ${highGaps.map(g => g.location).join(", ")}. Every location should be checked at least once a month — the longer you wait, the more problems can build up without anyone knowing.`,
        action: "Look at your schedule and make sure every location gets a visit this month",
        category: "schedule",
      });
    }

    // ── 4. Low overall pass rate ─────────────────────────
    if (patterns.passRate < 70 && patterns.totalRecords >= 5) {
      suggestions.push({
        id: "low-pass-rate",
        type: "quality",
        priority: patterns.passRate < 50 ? "critical" : "high",
        icon: "📉",
        title: `Only ${patterns.passRate}% of inspections are passing — that needs to improve`,
        body: `Out of ${patterns.totalRecords} inspections, only ${Math.round(patterns.totalRecords * patterns.passRate / 100)} passed. That's not good enough. `
            + `Look at which locations keep failing and what problems keep coming up — those are the things you need to fix first.`,
        action: "Open Analytics and look at Recurring Issues to see what's going wrong most often",
        category: "quality",
      });
    }

    // ── 5. Temp alerts ────────────────────────────────────
    for (const alert of (patterns.tempAlerts || []).slice(0, 2)) {
      suggestions.push({
        id: `temp-${alert.location}-${alert.metric}`,
        type: "temperature",
        priority: alert.severity === "critical" ? "critical" : "high",
        icon: "🌡️",
        title: `Temperature is creeping up at ${alert.location} — check it now`,
        body: `The ${alert.metric} readings have been going up lately: ${alert.trend}. It's only ${alert.gapToLimit}°F away from the limit of ${alert.threshold}°F. If it keeps rising, you'll have a violation. Don't wait.`,
        action: `Go check the equipment at ${alert.location} and find out why the temperature is climbing`,
        category: "temperature",
      });
    }

    // ── 6. Inspector coaching tips (NEW) ─────────────────
    const inspProfiles = patterns.inspectorProfiles || [];
    for (const insp of inspProfiles.slice(0, 3)) {
      // Inspector with declining pass rate
      if (insp.trendLabel === "declining" && insp.total >= 4) {
        suggestions.push({
          id: `insp-declining-${insp.name}`,
          type: "inspector",
          priority: "high",
          icon: "👤",
          title: `${insp.name} is struggling — their results have been getting worse`,
          body: `Their pass rate went from ${insp.firstPassRate}% down to ${insp.secondPassRate}% over their last ${insp.total} inspections. `
              + (insp.topIssues.length ? `The issue they miss most often is "${insp.topIssues[0].cat}". ` : "")
              + `This person probably needs some extra support or a refresher — not blame, just help.`,
          action: `Look at ${insp.name}'s recent reports and have a one-on-one conversation to find out what's going on`,
          category: "inspector",
        });
      }
      // Inspector with very low pass rate
      if (insp.passRate < 60 && insp.total >= 3) {
        suggestions.push({
          id: `insp-low-${insp.name}`,
          type: "inspector",
          priority: "medium",
          icon: "🎯",
          title: `${insp.name} is only passing ${insp.passRate}% of their inspections`,
          body: `Over ${insp.total} inspections at ${insp.siteCount} location(s), they're finding an average of ${insp.avgIssues} problems per visit. `
              + (insp.topIssues.length ? `The things they most often flag as issues are: ${insp.topIssues.slice(0,2).map(i=>i.cat).join(" and ")}.` : "")
              + ` They may need extra training or closer support.`,
          action: `Look over their recent inspection reports and give them honest, helpful feedback`,
          category: "inspector",
        });
      }
      // Inspector who is improving — positive reinforcement
      if (insp.trendLabel === "improving" && insp.total >= 4 && insp.passRate >= 75) {
        suggestions.push({
          id: `insp-improving-${insp.name}`,
          type: "positive",
          priority: "info",
          icon: "📈",
          title: `${insp.name} is doing better — great progress!`,
          body: `Their pass rate went from ${insp.firstPassRate}% up to ${insp.secondPassRate}% over ${insp.total} inspections — that's a ${insp.trend}-point improvement. Whatever they're doing, it's working.`,
          action: "Tell them they're doing great and keep an eye on their progress",
          category: "inspector",
        });
      }
    }

    // ── 7. Supervisor accountability alerts (NEW) ─────────
    const supProfiles = patterns.supervisorProfiles || [];
    for (const sup of supProfiles.slice(0, 3)) {
      if (sup.passRate < 65 && sup.total >= 3) {
        suggestions.push({
          id: `sup-low-${sup.name}`,
          type: "supervisor",
          priority: "high",
          icon: "🏢",
          title: `The locations ${sup.name} oversees are struggling — only ${sup.passRate}% passing`,
          body: `Across ${sup.total} inspections at ${sup.siteCount} location(s), things aren't meeting standards. `
              + (sup.problemSites.length ? `The biggest problem spot is ${sup.problemSites[0].site}, which fails ${sup.problemSites[0].failRate}% of the time.` : "")
              + ` This supervisor may need more support or accountability.`,
          action: `Have a direct conversation with ${sup.name} about what's going wrong and how to fix it`,
          category: "supervisor",
        });
      }
      // Recurring issues under a supervisor that aren't being resolved
      if (sup.hasRecurringIssues && sup.total >= 3) {
        const prob = sup.problemSites.find(s => s.recurringIssues.length > 0);
        if (prob) {
          suggestions.push({
            id: `sup-recurring-${sup.name}-${prob.site}`,
            type: "supervisor",
            priority: "medium",
            icon: "🔄",
            title: `The same problem keeps coming back at ${prob.site} and nobody is fixing it`,
            body: `"${prob.recurringIssues[0].issue}" has been flagged ${prob.recurringIssues[0].times} times at this location. Inspectors keep writing it down, but nobody is going back and actually fixing it. That needs to stop.`,
            action: `Talk to ${sup.name} and find out why the fix at ${prob.site} still hasn't been done`,
            category: "supervisor",
          });
        }
      }
    }

    // ── 8. Location type risk flags (NEW) ─────────────────
    const locProf = patterns.locationProfile || {};
    const byType = locProf.byType || [];
    for (const lt of byType) {
      if (lt.passRate < 60 && lt.total >= 3) {
        suggestions.push({
          id: `loctype-risk-${lt.type}`,
          type: "location",
          priority: "medium",
          icon: "🏪",
          title: `Your ${lt.type} locations are failing a lot — only ${lt.passRate}% passing`,
          body: `Across ${lt.total} inspections of ${lt.type} locations, something is consistently going wrong. `
              + (lt.topIssues.length ? `The most common problems are: ${lt.topIssues.slice(0,2).map(i=>i.cat).join(" and ")}.` : "")
              + ` These types of locations might need their own specific checklist or more frequent visits.`,
          action: `Create a checklist made specifically for ${lt.type} locations and make sure inspectors use it`,
          category: "location",
        });
      }
    }
    // Floor with worst pass rate
    const byFloor = locProf.byFloor || [];
    const worstFloor = byFloor.find(f => f.passRate < 60 && f.total >= 3);
    if (worstFloor) {
      suggestions.push({
        id: `floor-risk-${worstFloor.floor}`,
        type: "location",
        priority: "medium",
        icon: "🏗️",
        title: `${worstFloor.floor} is your most problematic area — only ${worstFloor.passRate}% of inspections pass`,
        body: `Over ${worstFloor.total} visits, inspectors find an average of ${worstFloor.avgIssues} problems per inspection there. `
            + (worstFloor.topIssue ? `The most common thing going wrong is "${worstFloor.topIssue}".` : "")
            + ` This area needs extra attention right now.`,
        action: `Make ${worstFloor.floor} a priority — inspect it more often and follow up on every problem found`,
        category: "location",
      });
    }

    // ── 9. Behavior & completeness warnings (NEW) ─────────
    const beh = patterns.behavior || {};
    if (beh.completeness) {
      const comp = beh.completeness;
      // Missing supervisor names
      if (comp.supervisorName < 80 && patterns.totalRecords >= 5) {
        suggestions.push({
          id: "missing-supervisor",
          type: "data",
          priority: "medium",
          icon: "📝",
          title: `${100 - comp.supervisorName}% of reports don't have a supervisor name — please fix this`,
          body: `${beh.missingFields?.supervisorName || "Several"} inspections were saved without listing who the supervisor was. Without that info, it's impossible to know who's responsible for what. It only takes a second to fill in.`,
          action: "Make sure everyone fills in the Supervisor Name field on every single inspection",
          category: "data",
        });
      }
      // Missing temperatures
      if (comp.temps < 70 && patterns.totalRecords >= 5) {
        suggestions.push({
          id: "missing-temps",
          type: "data",
          priority: "medium",
          icon: "🌡️",
          title: `Temperatures aren't being recorded in ${100 - comp.temps}% of inspections`,
          body: `Temperature readings are one of the most important parts of a food safety inspection. Without them, you can't prove food is being stored safely — and problems can go unnoticed until it's too late.`,
          action: "Record temperatures every time — hand sink, 3-compartment sink, cold and hot holding",
          category: "data",
        });
      }
    }

    // ── 10. Peak usage insight (NEW) ──────────────────────
    if (beh.peakDayLabel && patterns.totalRecords >= 6) {
      suggestions.push({
        id: "peak-day-insight",
        type: "feature",
        priority: "info",
        icon: "📊",
        title: `Most of your inspections are happening on ${beh.peakDayLabel}s`,
        body: `Looking at ${beh.total} inspections, ${beh.peakDayLabel} is by far the busiest day, usually around ${beh.peakHourLabel}. `
            + (beh.topTypes?.[0] ? `The most common type of location being inspected is ${beh.topTypes[0].type} (${beh.topTypes[0].pct}% of all visits). ` : "")
            + `Spreading inspections more evenly through the week means you catch problems faster.`,
        action: "Spread your inspections throughout the week so no location goes too long without a check",
        category: "behavior",
      });
    }

    // ── 11. Site worsening trend alerts (NEW) ─────────────
    const bySite = (locProf.bySite || []).filter(s => s.trendLabel === "worsening" && s.total >= 4);
    if (bySite.length > 0) {
      const worst = bySite[0];
      suggestions.push({
        id: `site-worsening-${worst.site}`,
        type: "location",
        priority: "high",
        icon: "⚠️",
        title: `${worst.site} is getting worse — things there are heading in the wrong direction`,
        body: `The pass rate at ${worst.site} has dropped ${Math.abs(worst.trend)} points recently and is now at ${worst.passRate}%. Inspectors are finding an average of ${worst.avgIssues} problems per visit. If nothing changes, it's going to get worse.`,
        action: `Do a thorough inspection at ${worst.site} right now and make sure every problem gets fixed, not just noted`,
        category: "location",
      });
    }

    // ── 12. Usage-based tips ───────────────────────────────
    if (usageReport) {
      const analyticsVisits = usageReport.topPages.find(p => p.name === "analytics")?.visits || 0;
      if (analyticsVisits === 0 && patterns.totalRecords >= 5) {
        suggestions.push({
          id: "discover-analytics",
          type: "feature",
          priority: "low",
          icon: "💡",
          title: "You haven't tried Analytics yet — there's a lot of useful stuff in there",
          body: `You've done ${patterns.totalRecords} inspections and all that data is being tracked. The Analytics tab turns it into easy-to-read charts and trends — temperature patterns, common problems, inspector performance, and more.`,
          action: "Tap 'Analytics' in Past Reports to see what the data is telling you",
          category: "feature",
        });
      }
    }

    // ── 13. Positive reinforcement (high pass rate) ────────
    if (patterns.passRate >= 90 && patterns.totalRecords >= 5) {
      suggestions.push({
        id: "positive-pass-rate",
        type: "positive",
        priority: "info",
        icon: "🏆",
        title: `Things are looking really good — ${patterns.passRate}% of inspections are passing!`,
        body: `${Math.round(patterns.totalRecords * patterns.passRate / 100)} out of ${patterns.totalRecords} inspections passed. That's excellent. The team is doing great work — just make sure to keep it up and catch any problems early before they become trends.`,
        action: "Keep doing what's working and stay on top of any new issues right away",
        category: "positive",
      });
    }

    // ── 14. Issue resolution failures ─────────────────────
    const resolution = patterns.issueResolution;
    if (resolution && resolution.problemSites.length > 0) {
      const ps = resolution.problemSites[0];
      suggestions.push({
        id: `unresolved-issues-${ps.site}`,
        type: "quality",
        priority: "high",
        icon: "🔓",
        title: `Problems at ${ps.site} keep coming back — they're not being fixed`,
        body: `Inspectors have gone back to ${ps.site} ${ps.followUps} time(s) and found the same issues ${ps.recurred} time(s). `
            + (ps.topPersistent.length ? `The one that keeps coming back most is "${ps.topPersistent[0].issue}" — that's been seen ${ps.topPersistent[0].times} times now. ` : "")
            + `Someone is writing the problems down but nobody is actually going back and fixing them.`,
        action: `Before marking any inspection at ${ps.site} as done, confirm the problems from last time were actually fixed`,
        category: "quality",
      });
    }
    if (resolution && resolution.globalRecurrenceRate >= 50 && resolution.totalFollowUps >= 4) {
      suggestions.push({
        id: "high-global-recurrence",
        type: "pattern",
        priority: "high",
        icon: "♻️",
        title: `${resolution.globalRecurrenceRate}% of flagged problems come back on the next visit`,
        body: `More than half the time, when an inspector returns to a location, the same problems from last time are still there. That means problems are being written down but not actually fixed. This is happening across all your locations, not just one.`,
        action: "Before closing any inspection, someone needs to confirm that the problems from the previous visit were actually taken care of",
        category: "quality",
      });
    }

    // ── 15. Inspector thoroughness / bias alerts ───────────
    const cross = patterns.crossInspector;
    if (cross) {
      for (const rs of (cross.rubberStampers || []).slice(0, 2)) {
        suggestions.push({
          id: `rubber-stamper-${rs.name}`,
          type: "inspector",
          priority: "medium",
          icon: "👁️",
          title: `${rs.name} almost never finds any problems — that might be worth a second look`,
          body: `They report zero issues on ${rs.zeroIssuePct}% of their inspections, averaging only ${rs.avgIssues} problems per visit. The rest of the team averages ${cross.globalAvgIssues}. It's possible everything really is perfect — but it's also possible they're not looking closely enough.`,
          action: `Have ${rs.name} do an inspection alongside another inspector so you can compare what they each notice`,
          category: "inspector",
        });
      }
      for (const th of (cross.thorough || []).slice(0, 1)) {
        suggestions.push({
          id: `thorough-inspector-${th.name}`,
          type: "positive",
          priority: "info",
          icon: "🔍",
          title: `${th.name} is your most detail-oriented inspector — seriously impressive`,
          body: `They catch an average of ${th.avgIssues} issues per visit, which is ${th.deviation} more than the team average of ${cross.globalAvgIssues}. They're not just finding more problems — they're helping keep standards high for everyone.`,
          action: `Look at how ${th.name} does their inspections and use their approach as an example for the whole team`,
          category: "inspector",
        });
      }
      for (const sc of (cross.siteCorrelations || []).slice(0, 2)) {
        suggestions.push({
          id: `inspector-site-bias-${sc.site}`,
          type: "inspector",
          priority: "medium",
          icon: "⚖️",
          title: `At ${sc.site}, two inspectors are getting very different results`,
          body: `${sc.best.insp} passes this location ${sc.best.passRate}% of the time, but ${sc.worst.insp} only passes it ${sc.worst.passRate}% of the time. That's a ${sc.spread}-point difference. Either one of them is missing things, or they're not using the same standards.`,
          action: `Send both ${sc.best.insp} and ${sc.worst.insp} to ${sc.site} at the same time and compare what they find`,
          category: "inspector",
        });
      }
    }

    // ── 16. Weekly trend regression ────────────────────────
    const wt = (patterns.weeklyTrend || []);
    if (wt.length >= 4) {
      const recent2 = wt.slice(-2).reduce((s, w) => s + w.passRate, 0) / 2;
      const prior2  = wt.slice(-4, -2).reduce((s, w) => s + w.passRate, 0) / 2;
      const delta   = Math.round(recent2 - prior2);
      if (delta <= -15) {
        suggestions.push({
          id: "weekly-regression",
          type: "pattern",
          priority: "high",
          icon: "📉",
          title: `Your pass rate dropped ${Math.abs(delta)} points in just the last 2 weeks — something changed`,
          body: `Two weeks ago you were averaging ${Math.round(prior2)}%. Now it's down to ${Math.round(recent2)}%. A drop this fast usually means something specific happened — a new employee, a broken piece of equipment, a procedure that changed. Find out what it is.`,
          action: "Look at the most recent failed inspections and find out what they all have in common",
          category: "trend",
        });
      } else if (delta >= 15) {
        suggestions.push({
          id: "weekly-improvement",
          type: "positive",
          priority: "info",
          icon: "📈",
          title: `Your pass rate went up ${delta} points in the last 2 weeks — keep it up!`,
          body: `You went from ${Math.round(prior2)}% two weeks ago to ${Math.round(recent2)}% now. Whatever the team has been doing differently is clearly working. Don't lose that momentum.`,
          action: "Figure out what changed and make sure everyone on the team knows about it",
          category: "trend",
        });
      }
    }

    // ── 17. Seasonal risk warning ──────────────────────────
    const sp = patterns.seasonalPattern || [];
    if (sp.length >= 6) {
      const curMonth = new Date().getMonth();
      const curSeason = sp.find(s => s.monthIndex === curMonth);
      const worstSeason = [...sp].sort((a, b) => a.passRate - b.passRate)[0];
      if (curSeason && worstSeason && curSeason.monthIndex === worstSeason.monthIndex && worstSeason.total >= 3) {
        suggestions.push({
          id: `seasonal-risk-${worstSeason.month}`,
          type: "pattern",
          priority: "medium",
          icon: "🗓️",
          title: `Heads up — ${worstSeason.month} is historically your worst month`,
          body: `Every year, ${worstSeason.month} has the lowest pass rate of any month — around ${worstSeason.passRate}%. You're in that month right now. This is the time to be extra careful, increase check-ins, and get ahead of problems before they happen.`,
          action: `Look at what went wrong in past ${worstSeason.month} inspections and fix those things now, before they happen again`,
          category: "trend",
        });
      }
    }

    // ── 18. FDA Priority violation concentration ───────────
    const hi = patterns.healthInspector;
    if (hi && hi.totalIssues >= 5) {
      // If Priority violations dominate (>50% of all issues), it's a systemic food safety risk
      if (hi.priorityRatio >= 50) {
        suggestions.push({
          id: "fda-priority-dominant",
          type: "foodSafety",
          priority: "critical",
          icon: "🚨",
          title: `${hi.priorityRatio}% of your violations are the most serious kind — these can make people sick`,
          body: `The violations you're recording most often — things like food stored at wrong temperatures, cross-contamination, and hygiene issues — are the ones that directly cause foodborne illness. `
              + (hi.topCategory ? `The biggest one right now is "${hi.topCategory.label}", which has come up ${hi.topCategory.count} times. ` : "")
              + `These need to be fixed immediately, before anything else.`,
          action: "Stop everything else and fix the temperature, cross-contamination, and hygiene problems first — these are the most dangerous",
          category: "foodSafety",
        });
      }

      // If a Priority category is never flagged, it may be a blind spot
      for (const nf of (hi.neverFlagged || []).slice(0, 1)) {
        suggestions.push({
          id: `blind-spot-${nf.key}`,
          type: "inspector",
          priority: "medium",
          icon: "👁️",
          title: `Nobody has ever flagged a problem with "${nf.label}" — is anyone actually checking?`,
          body: `"${nf.label}" is a category where health inspectors find issues all the time. The fact that it's never been flagged here is unusual. It might mean everything is truly perfect — or it might mean inspectors aren't looking closely enough at this area.`,
          action: `On the next inspection, specifically and carefully check "${nf.label}" — don't just glance at it`,
          category: "inspector",
        });
      }

      // Cross-contamination specific alert if it's a top category
      const contamCat = hi.breakdown.find(b => b.key === "crossContam");
      if (contamCat && contamCat.count >= 3) {
        suggestions.push({
          id: "cross-contam-pattern",
          type: "foodSafety",
          priority: "high",
          icon: "⚠️",
          title: `Cross-contamination has been flagged ${contamCat.count} times — this is a serious food safety risk`,
          body: `Cross-contamination — like storing raw meat above ready-to-eat food, or using the same cutting board for different foods — is one of the main ways people get sick from food. It's showing up at ${contamCat.siteCount} location(s). `
              + (contamCat.topIssues.length ? `The most common specific problem is "${contamCat.topIssues[0].issue}".` : "")
              + ` This needs to be fixed everywhere, not just noted.`,
          action: "Check every location: raw proteins must always be stored below ready-to-eat food, and color-coded tools must be used correctly",
          category: "foodSafety",
        });
      }
    }

    // ── 19. Inspection thoroughness score ─────────────────
    const wf = patterns.workflow;
    if (wf && wf.total >= 5) {
      // Low average thoroughness score across all inspections
      if (wf.avgThoroughnessScore < 60) {
        suggestions.push({
          id: "low-thoroughness",
          type: "data",
          priority: "medium",
          icon: "📋",
          title: `Inspections are only ${wf.avgThoroughnessScore}% complete on average — too much is being skipped`,
          body: `A good inspection covers temperatures, equipment, supervisor info, notes, and more. Right now, a lot of those sections are being left blank. `
              + (wf.noTempsRate > 30 ? `Temperatures are being skipped ${wf.noTempsRate}% of the time. ` : "")
              + (wf.noEquipRate > 30 ? `Equipment isn't being checked ${wf.noEquipRate}% of the time. ` : "")
              + `Incomplete inspections make it harder to catch problems and harder to prove compliance.`,
          action: "Fill in every section on every inspection — temps, equipment, supervisor name, floor, and notes all matter",
          category: "data",
        });
      }
      // Thoroughness trending down
      if (wf.recentTrend !== null && wf.recentTrend <= -10) {
        suggestions.push({
          id: "thoroughness-declining",
          type: "pattern",
          priority: "medium",
          icon: "📉",
          title: `Inspections have been getting less and less thorough lately`,
          body: `Compared to a few weeks ago, recent inspections are missing a lot more sections. This can happen when people are busy or tired — but skipping sections means problems can slip through without anyone noticing.`,
          action: "Look at the most recent inspections and figure out which parts are being skipped — then make sure they get filled in",
          category: "behavior",
        });
      }
      // Inspector with consistently low thoroughness
      const lowThoroughInspector = (wf.inspectorWorkflow || []).find(i => i.avgScore < 50 && i.total >= 3);
      if (lowThoroughInspector) {
        suggestions.push({
          id: `low-thoroughness-insp-${lowThoroughInspector.name}`,
          type: "inspector",
          priority: "medium",
          icon: "📋",
          title: `${lowThoroughInspector.name} is leaving a lot of the inspection form blank`,
          body: `Their inspections are only ${lowThoroughInspector.avgScore}% complete on average. Temperatures are being skipped ${lowThoroughInspector.noTempsRate}% of the time. An inspection that's half-empty doesn't give you the full picture — it's hard to catch problems if they're not written down.`,
          action: `Walk through the inspection form with ${lowThoroughInspector.name} and make sure they know every section needs to be filled in, especially temperature readings`,
          category: "inspector",
        });
      }
    }

    // ── 20. Temperature danger zone analysis ──────────────
    if (hi && hi.totalIssues >= 3) {
      const tempCat = hi.breakdown.find(b => b.key === "tempControl");
      if (tempCat && tempCat.rate >= 30) {
        suggestions.push({
          id: "temp-danger-zone-dominant",
          type: "temperature",
          priority: tempCat.rate >= 50 ? "high" : "medium",
          icon: "🌡️",
          title: `Temperature problems make up ${tempCat.rate}% of all violations — food safety risk is high`,
          body: `Food that's not kept cold enough (below 41°F) or hot enough (above 135°F) can make people seriously sick. This is showing up at ${tempCat.siteCount} location(s). `
              + (tempCat.topIssues.length ? `The most common specific problem is "${tempCat.topIssues[0].issue}".` : "")
              + ` Every inspector needs to be checking and recording temperatures every single visit.`,
          action: "Check that all cold food is at 41°F or below and all hot food is at 135°F or above — and make sure thermometers are working correctly",
          category: "temperature",
        });
      }
    }

    // ── 21. FIFO / food dating compliance ─────────────────
    if (hi && hi.totalIssues >= 3) {
      const foodCat = hi.breakdown.find(b => b.key === "foodSource");
      if (foodCat && foodCat.count >= 2) {
        suggestions.push({
          id: "fifo-dating-pattern",
          type: "foodSafety",
          priority: "medium",
          icon: "📦",
          title: `Food labeling and dating problems found ${foodCat.count} times across ${foodCat.siteCount} location(s)`,
          body: `Food that doesn't have a date label — or that's past its date — is a health risk and a violation. Every open item needs to be labeled with when it was prepared or when it expires. `
              + (foodCat.topIssues.length ? `The most common problem found is "${foodCat.topIssues[0].issue}".` : "")
              + ` Staff also need to use the oldest food first (FIFO — first in, first out) so nothing sits around too long.`,
          action: "Check date labels on every open product and make sure staff know to use older food first before opening new items",
          category: "foodSafety",
        });
      }
    }

    // ── 22. Equipment absence — item historically at a site now missing ────────
    if (patterns.equipmentAbsence && patterns.equipmentAbsence.length > 0) {
      for (const item of patterns.equipmentAbsence) {
        const lastSeenFormatted = item.lastSeenDate ? item.lastSeenDate.slice(0, 10) : "unknown date";
        const latestFormatted   = item.latestInspDate ? item.latestInspDate.slice(0, 10) : "most recent inspection";
        suggestions.push({
          id: `equip-absent-${item.site.replace(/\s+/g, "-")}-${item.equipKey}`,
          type: "equipmentAbsence",
          priority: "medium",
          icon: "⚠️",
          title: `${item.label} is missing from ${item.site} — was it removed or just skipped?`,
          body: `This piece of equipment was checked ${item.historicalCount} times at ${item.site} — last seen on ${lastSeenFormatted} — but it was ${item.markedNA ? "marked as N/A" : "not found"} on the most recent inspection on ${latestFormatted}. `
              + `Either it was taken away, or the inspector missed it. Either way, someone needs to check.`,
          action: `Go to ${item.site} and confirm: is ${item.label} still there? If it was removed, update the equipment list so this alert doesn't keep coming up`,
          category: "equipment",
          site: item.site,
          equipKey: item.equipKey,
        });
      }
    }

    // ── 23. Food temperature violations (cold/hot holding) ────
    const foodTempAlerts = patterns.foodTempAlerts || [];
    for (const fta of foodTempAlerts.slice(0, 3)) {
      suggestions.push({
        id: `food-temp-violation-${fta.site.replace(/\s+/g, "-")}`,
        type: "foodSafety",
        priority: fta.severity === "critical" ? "critical" : fta.severity === "warning" ? "high" : "medium",
        icon: "🌡️",
        title: `Food temperature violations at ${fta.site} — ${fta.violationCount} out-of-range readings recorded`,
        body: `Cold food must stay at or below 41°F; hot food must stay at or above 135°F. At ${fta.site}, `
            + (fta.coldViolations > 0 ? `${fta.coldViolations} cold-holding reading(s) were too warm` : "")
            + (fta.coldViolations > 0 && fta.hotViolations > 0 ? " and " : "")
            + (fta.hotViolations > 0 ? `${fta.hotViolations} hot-holding reading(s) were too cold` : "")
            + `. ${fta.recentItems.length ? `Recent examples: ${fta.recentItems.join(", ")}.` : ""} Food in the temperature danger zone (41–135°F) can cause serious illness.`,
        action: `Check every cooler and hot-hold unit at ${fta.site}, calibrate thermometers, and verify all food items are within safe temperature range`,
        category: "temperature",
      });
    }

    // ── 24. Recurring supply shortages ─────────────────────
    const topSupplies = patterns.topSupplies || [];
    const frequentSupplies = topSupplies.filter(s => s.count >= 3);
    if (frequentSupplies.length >= 2) {
      const topItems = frequentSupplies.slice(0, 3).map(s => `${s.item} (${s.count}×)`).join(", ");
      suggestions.push({
        id: "recurring-supply-shortages",
        type: "quality",
        priority: "medium",
        icon: "📦",
        title: `The same supplies keep running out — ${frequentSupplies.length} items are needed repeatedly`,
        body: `Inspectors have been requesting the same items over and over: ${topItems}. These recurring requests point to a stocking or ordering problem. If inspectors keep having to ask for the same things, it means they're not consistently available, which can slow down operations and compromise food safety.`,
        action: `Add ${frequentSupplies.slice(0, 2).map(s => s.item).join(" and ")} to your standard restocking checklist so they're always on hand`,
        category: "quality",
      });
    } else if (frequentSupplies.length === 1) {
      const s = frequentSupplies[0];
      suggestions.push({
        id: `supply-shortage-${s.item.replace(/\s+/g, "-")}`,
        type: "quality",
        priority: "low",
        icon: "📦",
        title: `"${s.item}" has been requested ${s.count} times — it keeps running out`,
        body: `This item has been flagged as needed across ${s.siteCount} location(s). If it keeps running out, it should be added to the standard restocking process so inspectors always have it available.`,
        action: `Make sure "${s.item}" is part of the regular supply order and that ${s.siteCount > 1 ? "all affected locations are" : "this location is"} properly stocked`,
        category: "quality",
      });
    }

    // ── 25. Food temperature completeness warning ──────────
    if (beh.completeness && beh.completeness.foodTemps < 60 && patterns.totalRecords >= 5) {
      suggestions.push({
        id: "missing-food-temps",
        type: "data",
        priority: "medium",
        icon: "🌡️",
        title: `Food temperatures aren't being recorded in ${100 - beh.completeness.foodTemps}% of inspections`,
        body: `Cold and hot holding temperatures for actual food items are the most direct indicator of food safety. Right now, ${beh.missingFields?.foodTemps || "many"} inspections were completed without recording any food temperatures. This makes it impossible to verify food is being stored safely.`,
        action: "Record the temperature of at least one cold-hold and one hot-hold item on every inspection — use a calibrated probe thermometer",
        category: "data",
      });
    }

    // ── 26. No photos warning ──────────────────────────────
    if (wf && wf.noPhotosRate >= 70 && wf.total >= 5) {
      suggestions.push({
        id: "no-photos-pattern",
        type: "data",
        priority: "low",
        icon: "📷",
        title: `${wf.noPhotosRate}% of inspections have no photos — photos help document violations`,
        body: `Photos are one of the best ways to document what an inspector actually found. They provide proof for follow-ups, help supervisors understand severity, and can be critical if there's a dispute. Right now, most inspections are being submitted without any photos attached.`,
        action: "Encourage inspectors to take at least one photo of any problem they find during an inspection",
        category: "data",
      });
    }

    // Sort: critical → high → medium → low → info
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    suggestions.sort((a, b) => (order[a.priority] ?? 5) - (order[b.priority] ?? 5));

    saveJSON(SUGGESTIONS_KEY, { generatedAt: nowISO(), items: suggestions });
    return suggestions;
  },

  get() {
    const data = loadJSON(SUGGESTIONS_KEY, null);
    return data ? data.items : [];
  },

  getGeneratedAt() {
    const data = loadJSON(SUGGESTIONS_KEY, null);
    return data ? data.generatedAt : null;
  },
};

/* ══════════════════════════════════════════════════════════════════
   PerformanceWatchdog  — browser Web Vitals + paint timing
══════════════════════════════════════════════════════════════════ */
const PerformanceWatchdog = {
  _metrics: {},

  start() {
    if (typeof window === "undefined" || !window.PerformanceObserver) return;
    const record = (name, value) => {
      const data = loadJSON(PERF_KEY, {});
      if (!data[name]) data[name] = { readings: [], baseline: null };
      data[name].readings.push({ value: Math.round(value), ts: nowISO() });
      if (data[name].readings.length > 20) data[name].readings = data[name].readings.slice(-20);
      if (!data[name].baseline && data[name].readings.length >= 3) {
        const avg = data[name].readings.slice(0, 3).reduce((s, r) => s + r.value, 0) / 3;
        data[name].baseline = Math.round(avg);
      }
      saveJSON(PERF_KEY, data);
      this._metrics[name] = Math.round(value);
    };

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lcp = entries[entries.length - 1];
        if (lcp) record("LCP", lcp.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          record("FID", entry.processingStart - entry.startTime);
        }
      }).observe({ type: "first-input", buffered: true });
    } catch {}

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "event") record("INP", entry.duration);
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    } catch {}

    if (window.performance?.timing) {
      window.addEventListener("load", () => {
        const t = window.performance.timing;
        record("pageLoad", t.loadEventEnd - t.navigationStart);
        record("domReady", t.domContentLoadedEventEnd - t.navigationStart);
      }, { once: true });
    }
  },

  getReport() {
    const data = loadJSON(PERF_KEY, {});
    const THRESHOLDS = {
      LCP:      { good: 2500, poor: 4000, unit: "ms", label: "Largest Contentful Paint" },
      FID:      { good: 100,  poor: 300,  unit: "ms", label: "First Input Delay" },
      INP:      { good: 200,  poor: 500,  unit: "ms", label: "Interaction to Next Paint" },
      pageLoad: { good: 3000, poor: 6000, unit: "ms", label: "Page Load Time" },
      domReady: { good: 1500, poor: 3000, unit: "ms", label: "DOM Ready Time" },
    };
    return Object.entries(THRESHOLDS).map(([key, thresh]) => {
      const entry = data[key];
      if (!entry || entry.readings.length === 0) return { key, label: thresh.label, status: "no data", value: null, baseline: null };
      const latest = entry.readings[entry.readings.length - 1].value;
      const status = latest <= thresh.good ? "good" : latest <= thresh.poor ? "needs improvement" : "poor";
      const regression = entry.baseline && latest > entry.baseline * 1.3
        ? Math.round(((latest - entry.baseline) / entry.baseline) * 100) : null;
      return {
        key,
        label: thresh.label,
        value: latest,
        baseline: entry.baseline,
        unit: thresh.unit,
        status,
        regression,
        readings: entry.readings.slice(-5),
        thresholds: { good: thresh.good, poor: thresh.poor },
      };
    }).filter(m => m.value !== null);
  },
};

/* ══════════════════════════════════════════════════════════════════
   AIEngine  — main orchestrator
══════════════════════════════════════════════════════════════════ */
const AIEngine = {
  _booted: false,
  _listeners: [],

  boot(venueId) {
    if (this._booted) return;
    this._booted = true;

    // Namespace all storage keys by venue so each venue's AI data is
    // completely isolated. Falls back to "default" if no venue supplied.
    const vid = (venueId || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "default";
    if (vid !== "default") {
      MEM_KEY         = `sdx_ai_memory_v2_${vid}`;
      USAGE_KEY       = `sdx_ai_usage_v2_${vid}`;
      PATTERNS_KEY    = `sdx_ai_patterns_v2_${vid}`;
      PERF_KEY        = `sdx_ai_perf_v2_${vid}`;
      SUGGESTIONS_KEY = `sdx_ai_suggestions_v2_${vid}`;
      PROFILES_KEY    = `sdx_ai_profiles_v3_${vid}`;
      BEHAVIOR_KEY    = `sdx_ai_behavior_v3_${vid}`;
      WORKFLOW_KEY    = `sdx_ai_workflow_v1_${vid}`;
    }

    UsageTracker.startSession();
    PerformanceWatchdog.start();
  },

  trackPage(pageName) {
    UsageTracker.trackPage(pageName);
  },

  trackAction(actionName, metadata = {}) {
    UsageTracker.trackAction(actionName, metadata);
  },

  learnFromHistory(history) {
    if (!history || history.length === 0) return;
    const patterns = PatternMiner.mine(history);
    const usageReport = UsageTracker.getReport();
    const suggestions = SuggestionGen.generate(patterns, usageReport);
    this._notify({ type: "update", patterns, suggestions });
    return { patterns, suggestions };
  },

  // Called on every inspection save — records workflow coverage and
  // enriches the AI with behavioral signals for continuous improvement.
  // This is the "always learning" hook: the more you use the app,
  // the smarter the AI's suggestions become.
  learnFromInspection(record, allHistory) {
    if (!record) return;

    // 1. Record workflow coverage (thoroughness signals)
    InspectionWorkflowTracker.recordCoverage(record);

    // 2. Evaluate immediate risk signals for the just-saved record
    const immediateRisks = HealthInspectorModel.evaluateRecord(record);
    if (immediateRisks && immediateRisks.length > 0) {
      AIMemory.set("lastInspectionRisks", { signals: immediateRisks, savedAt: nowISO() });
    }

    // 3. Track domain-specific action signals
    const items = record.actionItems || [];
    if (items.length > 0) {
      // Classify every action item into FDA risk categories
      let priorityCount = 0;
      for (const item of items) {
        for (const cat of Object.values(HealthInspectorModel.RISK_CATEGORIES)) {
          if (cat.fdaRisk.startsWith("Priority") && cat.patterns.some(p => p.test(item.issue || ""))) {
            priorityCount++;
            break;
          }
        }
      }
      UsageTracker.trackAction("fdaPriorityViolations", { count: String(priorityCount), site: record.siteName || "unknown" });
    }

    // 4. Full pattern re-mine with all history (triggers suggestion refresh)
    if (allHistory && allHistory.length > 0) {
      return this.learnFromHistory(allHistory);
    }
  },

  subscribe(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(f => f !== fn); };
  },

  _notify(event) {
    for (const fn of this._listeners) {
      try { fn(event); } catch {}
    }
  },

  getSnapshot() {
    return {
      patterns:    PatternMiner.get(),
      suggestions: SuggestionGen.get(),
      usageReport: UsageTracker.getReport(),
      perfReport:  PerformanceWatchdog.getReport(),
      generatedAt: SuggestionGen.getGeneratedAt(),
      memory:      AIMemory.getAll(),
    };
  },

  // Returns inspector profiles sorted by performanceScore descending (best first)
  getInspectorRanking(history) {
    if (!history || history.length === 0) return [];
    const profiles = InspectorProfiler.mine(history);
    return [...profiles].sort((a, b) => b.performanceScore - a.performanceScore);
  },
};

export default AIEngine;
export {
  UsageTracker,
  PatternMiner,
  SuggestionGen,
  PerformanceWatchdog,
  AIMemory,
  InspectorProfiler,
  SupervisorProfiler,
  LocationProfiler,
  BehaviorTracker,
  CrossInspectorAnalyzer,
  IssueResolutionTracker,
};
