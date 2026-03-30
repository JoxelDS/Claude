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
      const name = (rec.inspectorName || "").trim() || "Unknown";
      if (!map[name]) map[name] = { records: [], passes: 0, issues: 0, cats: {}, sites: new Set() };
      map[name].records.push(rec);
      if (rec.overallStatus === "Pass") map[name].passes += 1;
      const items = rec.actionItems || [];
      map[name].issues += items.length;
      if (rec.siteName) map[name].sites.add(rec.siteName);
      for (const item of items) {
        const cat = (item.issue || "").split(":")[0].trim() || "Other";
        map[name].cats[cat] = (map[name].cats[cat] || 0) + 1;
      }
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
          site: r.siteName || "?",
          issues: (r.actionItems || []).length,
        }));

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
      if (rec.siteName) {
        map[sup].sites.add(rec.siteName);
        const siteKey = rec.siteName;
        if (!map[sup].problematicSites[siteKey]) map[sup].problematicSites[siteKey] = { total: 0, fails: 0, issues: [] };
        map[sup].problematicSites[siteKey].total += 1;
        if (rec.overallStatus !== "Pass") map[sup].problematicSites[siteKey].fails += 1;
        for (const item of (rec.actionItems || [])) {
          map[sup].problematicSites[siteKey].issues.push(item.issue || "");
        }
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
      const site = rec.siteName || "Unknown";
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
      const site = rec.siteName || rec.location || "Unknown";
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
      const site = rec.siteName || rec.location || "Unknown";
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
      const site = rec.siteName || rec.location || "Unknown";
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
            if (rec.siteName) catCounts[key].sites.add(rec.siteName);
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

    // Compute a simple thoroughness score (0-100)
    let score = 0;
    if (temps)  score += 25;
    if (equip)  score += 25;
    if (notes)  score += 20;
    if (record.supervisorName?.trim()) score += 15;
    if (record.floor?.trim()) score += 10;
    if (items > 0) score += 5;

    data.sessions.push({
      date: record.inspectionDate || todayKey(),
      site: record.siteName || "Unknown",
      inspector: record.inspectorName || "Unknown",
      hasTemps: temps,
      hasEquip: equip,
      hasNotes: notes,
      hasActionItems: items > 0,
      actionItemCount: items,
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
    const noTemps  = s.filter(x => !x.hasTemps).length;
    const noEquip  = s.filter(x => !x.hasEquip).length;
    const noNotes  = s.filter(x => !x.hasNotes).length;
    const noItems  = s.filter(x => !x.hasActionItems).length;
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
      noTempsRate:  Math.round((noTemps  / total) * 100),
      noEquipRate:  Math.round((noEquip  / total) * 100),
      noNotesRate:  Math.round((noNotes  / total) * 100),
      noItemsRate:  Math.round((noItems  / total) * 100),
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
      inspectorStats: [],
      monthlyTrend: [],
      avgIssuesPerReport: 0,
      // NEW: deep profiles
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
      const loc = `${rec.siteName || rec.location || "Unknown"}${rec.floor ? ` (${rec.floor})` : ""}`;
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

    // Step 1 — Build a map of site → latestDate so we know which record to use per site.
    // sorted is already chronological (oldest→newest), so we iterate and keep overwriting.
    // siteLatest: { [site]: { date, equipment } }
    const siteLatest = {};
    for (const rec of sorted) {
      const site = rec.siteName || rec.location || "Unknown";
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

        const label  = EQUIP_LABEL_MAP[key] || item?.label || key;
        const source = item?.equipSource || "Facility";
        if (!equipMap[key]) equipMap[key] = { label, sites: {} };
        equipMap[key].sites[site] = { count: n, source, lastSeen: date };
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
          title: `Focus attention on ${loc.location}`,
          body: `This location has failed ${loc.failRate}% of inspections (${loc.failCount}/${loc.total}). `
              + (loc.topIssue ? `Top recurring issue: "${loc.topIssue}". ` : "")
              + `Consider a dedicated corrective action plan or more frequent visits.`,
          action: `Filter Past Reports to "${loc.location}" and review all action items`,
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
          title: `"${top.category}" is your most frequent issue (${top.rate}% of reports)`,
          body: `Appears across ${top.locationCount} location(s). This systemic issue likely has a fixable root cause `
              + `(training gap, equipment, or process). Addressing it could improve your pass rate significantly.`,
          action: "Run a root-cause analysis across all flagged sites",
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
        title: `${g.location} has not been inspected in ${g.daysSince} days`,
        body: `This is well past the recommended 30-day cycle. `
            + (g.hadIssues ? "The last visit had unresolved issues — extended gaps increase compliance risk." : "Schedule a visit soon."),
        action: `Schedule an inspection at ${g.location} immediately`,
        category: "schedule",
      });
    } else if (highGaps.length > 0) {
      suggestions.push({
        id: "gap-high-batch",
        type: "schedule",
        priority: "high",
        icon: "📅",
        title: `${highGaps.length} location(s) overdue for inspection (40+ days)`,
        body: `Locations: ${highGaps.map(g => g.location).join(", ")}. Consider adjusting your inspection schedule to cover all sites monthly.`,
        action: "Review schedule and add upcoming inspection dates",
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
        title: `Overall pass rate is ${patterns.passRate}% — below the 70% target`,
        body: `Out of ${patterns.totalRecords} inspections, only ${Math.round(patterns.totalRecords * patterns.passRate / 100)} passed. `
            + `Review your top issues and weak locations for targeted improvement.`,
        action: "Open Analytics → Recurring Issues for a full breakdown",
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
        title: `${alert.metric} trending toward limit at ${alert.location}`,
        body: `Recent readings: ${alert.trend}. Currently ${alert.gapToLimit}°F from the ${alert.threshold}°F threshold. Action needed.`,
        action: `Inspect water heater / equipment at ${alert.location}`,
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
          title: `${insp.name}'s pass rate is declining`,
          body: `Pass rate dropped from ${insp.firstPassRate}% to ${insp.secondPassRate}% across their last ${insp.total} inspections. `
              + (insp.topIssues.length ? `Most flagged category: "${insp.topIssues[0].cat}". ` : "")
              + `Consider a coaching session or refresher on recurring issue categories.`,
          action: `Review ${insp.name}'s recent reports in Past Reports`,
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
          title: `${insp.name} has a ${insp.passRate}% pass rate across ${insp.total} inspections`,
          body: `They visit ${insp.siteCount} site(s). Average ${insp.avgIssues} issues per report. `
              + (insp.topIssues.length ? `Most common flags: ${insp.topIssues.slice(0,2).map(i=>i.cat).join(", ")}.` : ""),
          action: `Review inspection reports and provide targeted feedback`,
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
          title: `${insp.name} is showing consistent improvement`,
          body: `Pass rate improved from ${insp.firstPassRate}% to ${insp.secondPassRate}% — a ${insp.trend}pt gain across ${insp.total} inspections.`,
          action: "Recognize the improvement and keep monitoring",
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
          title: `Sites under ${sup.name} have a ${sup.passRate}% pass rate`,
          body: `Across ${sup.siteCount} site(s) and ${sup.total} inspections, compliance is below target. `
              + (sup.problemSites.length ? `Most problematic site: ${sup.problemSites[0].site} (${sup.problemSites[0].failRate}% fail rate).` : ""),
          action: `Schedule a compliance review with ${sup.name}`,
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
            title: `Recurring unresolved issues at ${prob.site} (${sup.name})`,
            body: `Issue "${prob.recurringIssues[0].issue}" has appeared ${prob.recurringIssues[0].times}x. This suggests corrective actions are not being completed. Follow up required.`,
            action: `Review corrective action status for ${prob.site} with ${sup.name}`,
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
          title: `${lt.type} locations have a ${lt.passRate}% pass rate`,
          body: `Across ${lt.total} inspections of ${lt.type} units, compliance is low. `
              + (lt.topIssues.length ? `Top issues: ${lt.topIssues.slice(0,2).map(i=>i.cat).join(", ")}.` : "")
              + ` These unit types may need targeted SOPs or more frequent checks.`,
          action: `Create a ${lt.type}-specific checklist or SOP`,
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
        title: `${worstFloor.floor} has the lowest compliance (${worstFloor.passRate}% pass rate)`,
        body: `${worstFloor.total} inspections show avg ${worstFloor.avgIssues} issues per visit. `
            + (worstFloor.topIssue ? `Most common issue: "${worstFloor.topIssue}".` : ""),
        action: `Prioritize inspections and corrective actions on ${worstFloor.floor}`,
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
          title: `Supervisor name missing in ${100 - comp.supervisorName}% of reports`,
          body: `${beh.missingFields?.supervisorName || "Several"} report(s) don't have a supervisor recorded. This limits accountability tracking and the supervisor pattern analysis.`,
          action: "Ensure Supervisor Name is filled in on every inspection",
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
          title: `Temperature data missing in ${100 - comp.temps}% of reports`,
          body: `Temperatures are required for compliance and enable the AI to detect cooling trends before they become violations.`,
          action: "Record hand sink & 3-comp temperatures on every inspection",
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
        title: `Most inspections happen on ${beh.peakDayLabel}s`,
        body: `${beh.total} inspections show ${beh.peakDayLabel} as your peak inspection day. Peak hour: ${beh.peakHourLabel}. `
            + (beh.topTypes?.[0] ? `Most common type: ${beh.topTypes[0].type} (${beh.topTypes[0].pct}%).` : ""),
        action: "Review scheduling to spread inspections evenly through the week",
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
        title: `${worst.site} is getting worse over time`,
        body: `Pass rate dropped ${Math.abs(worst.trend)}pts in recent inspections (now ${worst.passRate}%). `
            + `Avg ${worst.avgIssues} issues per visit. Early intervention recommended.`,
        action: `Conduct a deep-dive inspection at ${worst.site} and review corrective actions`,
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
          title: "Discover the Analytics tab",
          body: `You have ${patterns.totalRecords} saved inspections. The Analytics tab shows temperature trends, recurring issues, inspector stats, and AI-powered insights — updated automatically.`,
          action: "Tap 'Analytics' in Past Reports",
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
        title: `Excellent compliance — ${patterns.passRate}% pass rate`,
        body: `${Math.round(patterns.totalRecords * patterns.passRate / 100)} out of ${patterns.totalRecords} inspections passed. Keep up the great work.`,
        action: "Continue current practices and monitor for regressions",
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
        title: `Action items at ${ps.site} keep recurring (${ps.recurrenceRate}% unresolved)`,
        body: `In ${ps.followUps} follow-up visit(s), the same issues reappeared ${ps.recurred} time(s). `
            + (ps.topPersistent.length ? `Most persistent: "${ps.topPersistent[0].issue}" (seen ${ps.topPersistent[0].times}x). ` : "")
            + `Corrective actions are not being completed between visits.`,
        action: `Verify corrective actions are completed before closing each inspection at ${ps.site}`,
        category: "quality",
      });
    }
    if (resolution && resolution.globalRecurrenceRate >= 50 && resolution.totalFollowUps >= 4) {
      suggestions.push({
        id: "high-global-recurrence",
        type: "pattern",
        priority: "high",
        icon: "♻️",
        title: `${resolution.globalRecurrenceRate}% of issues reappear on the next visit`,
        body: `Across all sites with follow-up inspections, issues are not being resolved between visits more than half the time. This suggests corrective actions are being logged but not executed.`,
        action: "Implement a follow-up verification step to confirm each corrective action is completed",
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
          title: `${rs.name} records zero issues on ${rs.zeroIssuePct}% of inspections`,
          body: `Avg ${rs.avgIssues} issues/visit vs. team average of ${cross.globalAvgIssues}. Consistently zero-issue passes may indicate under-reporting. A calibration visit or joint inspection is recommended.`,
          action: `Schedule a calibration inspection with ${rs.name} alongside another inspector`,
          category: "inspector",
        });
      }
      for (const th of (cross.thorough || []).slice(0, 1)) {
        suggestions.push({
          id: `thorough-inspector-${th.name}`,
          type: "positive",
          priority: "info",
          icon: "🔍",
          title: `${th.name} is your most thorough inspector`,
          body: `Logs ${th.avgIssues} issues/visit on average — ${th.deviation} above the team average of ${cross.globalAvgIssues}. Consider using their inspection style as a benchmark for the team.`,
          action: `Review ${th.name}'s recent inspections to document best practices`,
          category: "inspector",
        });
      }
      for (const sc of (cross.siteCorrelations || []).slice(0, 2)) {
        suggestions.push({
          id: `inspector-site-bias-${sc.site}`,
          type: "inspector",
          priority: "medium",
          icon: "⚖️",
          title: `${sc.site}: ${sc.spread}pt pass rate gap between inspectors`,
          body: `${sc.best.insp} passes this site ${sc.best.passRate}% of the time; ${sc.worst.insp} only ${sc.worst.passRate}%. A ${sc.spread}-point spread may signal inconsistent standards or inspector familiarity bias.`,
          action: `Run a joint inspection at ${sc.site} with both ${sc.best.insp} and ${sc.worst.insp} to calibrate standards`,
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
          title: `Pass rate dropped ${Math.abs(delta)} points over the last 2 weeks`,
          body: `Recent 2-week avg: ${Math.round(recent2)}% vs prior 2-week avg: ${Math.round(prior2)}%. A sharp short-term decline often signals a new operational issue or recent staff change.`,
          action: "Review the most recent failed inspections to identify a common cause",
          category: "trend",
        });
      } else if (delta >= 15) {
        suggestions.push({
          id: "weekly-improvement",
          type: "positive",
          priority: "info",
          icon: "📈",
          title: `Pass rate improved ${delta} points over the last 2 weeks`,
          body: `Recent 2-week avg: ${Math.round(recent2)}% vs prior 2-week avg: ${Math.round(prior2)}%. Recent corrective actions appear to be working.`,
          action: "Document what changed and share the improvement with your team",
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
          title: `${worstSeason.month} is historically your lowest-compliance month`,
          body: `Based on past data, ${worstSeason.month} has a ${worstSeason.passRate}% pass rate — the lowest of any month. You're in this month now. Increase inspection frequency or pre-emptively address known seasonal issues.`,
          action: `Review past ${worstSeason.month} inspections and address recurring issues proactively`,
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
          title: `${hi.priorityRatio}% of all issues are FDA Priority violations`,
          body: `FDA Priority violations (temperature abuse, cross-contamination, hygiene) represent the highest food safety risk. `
              + (hi.topCategory ? `The most common risk category is "${hi.topCategory.label}" (${hi.topCategory.count} occurrences). ` : "")
              + `These directly cause foodborne illness and must be addressed first.`,
          action: "Prioritize corrective actions for temperature control, cross-contamination, and hygiene violations",
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
          title: `"${nf.label}" issues are never recorded — possible blind spot`,
          body: `This is an FDA ${nf.fdaRisk} category that inspectors frequently find issues in. `
              + `If no violations have been recorded, it may indicate this area is being under-inspected or overlooked. Consider reviewing this category explicitly on the next inspection.`,
          action: `Explicitly check ${nf.label} conditions on the next inspection`,
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
          title: `Cross-contamination risk flagged ${contamCat.count} times across ${contamCat.siteCount} site(s)`,
          body: `Cross-contamination (raw vs ready-to-eat, improper storage order, color-coded equipment violations) is one of the leading causes of foodborne illness. `
              + (contamCat.topIssues.length ? `Most common: "${contamCat.topIssues[0].issue}".` : "")
              + ` Ensure all sites are following proper storage hierarchy and using color-coded tools.`,
          action: "Verify raw protein storage is always below ready-to-eat foods; check cutting board color codes",
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
          title: `Average inspection thoroughness is ${wf.avgThoroughnessScore}/100`,
          body: `Health inspectors should complete temperatures, equipment checks, notes, and supervisor info on every visit. `
              + (wf.noTempsRate > 30 ? `Temperatures missing ${wf.noTempsRate}% of the time. ` : "")
              + (wf.noEquipRate > 30 ? `Equipment not checked ${wf.noEquipRate}% of the time. ` : "")
              + `More complete inspections improve AI accuracy and compliance evidence.`,
          action: "Fill in all sections on every inspection: temps, equipment status, supervisor, floor, and notes",
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
          title: `Inspection thoroughness dropped ${Math.abs(wf.recentTrend)} points recently`,
          body: `Recent inspections are less complete than prior ones. This may indicate time pressure, fatigue, or process drift. Incomplete inspections miss violations and weaken compliance records.`,
          action: "Review recent inspections and identify which sections are being skipped",
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
          title: `${lowThoroughInspector.name}'s inspections average ${lowThoroughInspector.avgScore}/100 thoroughness`,
          body: `Temperatures are missing on ${lowThoroughInspector.noTempsRate}% of their inspections. `
              + `Incomplete form submissions reduce the AI's ability to detect patterns and generate useful suggestions.`,
          action: `Coach ${lowThoroughInspector.name} on completing all form sections, especially temperature readings`,
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
          title: `Temperature control issues in ${tempCat.rate}% of all flagged violations`,
          body: `The FDA danger zone is 41–135°F. Food held in this range for over 4 hours poses direct foodborne illness risk. `
              + `Temperature control issues appeared at ${tempCat.siteCount} site(s). `
              + (tempCat.topIssues.length ? `Most frequent: "${tempCat.topIssues[0].issue}".` : "")
              + ` Verify calibrated thermometers are used and temps recorded at every inspection.`,
          action: "Ensure all cold-hold is ≤41°F and hot-hold is ≥135°F; verify equipment calibration",
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
          title: `Food source & dating issues found ${foodCat.count} time(s) across ${foodCat.siteCount} site(s)`,
          body: `Undated or expired products violate FDA labeling requirements and increase cross-contamination risk. FIFO (First In, First Out) rotation prevents product aging. `
              + (foodCat.topIssues.length ? `Most common: "${foodCat.topIssues[0].issue}".` : "")
              + ` Ensure all items have prep/expiry dates and are rotated on each shift.`,
          action: "Verify date labels on all open products; train staff on FIFO rotation during pre-shift",
          category: "foodSafety",
        });
      }
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
