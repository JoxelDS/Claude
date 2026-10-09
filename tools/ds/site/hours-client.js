// CLIENT status logic — inlined into the page (≈1.3 KB minified). No imports; the generator reads this file as text.
// nyNow(date) → {day 0..6, min} in America/New_York wall time (DST handled by Intl).
// hoursStatus(M, date, lang) → {s: 'open'|'closing'|'opening'|'closed'|'next', t: text, today: day} or null.
function nyNow(d) {
  var o = {}, p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(d);
  for (var i = 0; i < p.length; i++) o[p[i].type] = p[i].value;
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday), min: (+o.hour % 24) * 60 + +o.minute };
}
function hoursStatus(M, d, lang) {
  var es = lang === 'es', W = 10080, n = nyNow(d), now = n.day * 1440 + n.min;
  var DN = es ? ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function tm(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mm = m % 60; return (h % 12 || 12) + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + (h < 12 ? ' AM' : ' PM'); }
  function at(m) { return es ? ((Math.floor((((m % 1440) + 1440) % 1440) / 60) % 12 || 12) === 1 ? 'a la ' : 'a las ') + tm(m) : tm(m); }
  function when(abs) {                                  // abs = minutes-of-week of a future moment → "today 6 PM" / "el miércoles a las 6 PM"
    var dd = Math.floor((((abs % W) + W) % W) / 1440), diff = (dd - n.day + 7) % 7;
    if (abs - now >= W - 1440 && diff === 0) diff = 7;
    var day = diff === 0 ? (es ? 'hoy' : 'today') : diff === 1 ? (es ? 'mañana' : 'tomorrow') : (es ? 'el ' + DN[dd] : DN[dd]);
    return day + ' ' + at(abs);
  }
  var pre = '';
  if (M.k === 'hours') {
    var best = null, next = null;
    for (var i = 0; i < M.iv.length; i++) {
      var v = M.iv[i], s = v[0] * 1440 + v[1], e = v[0] * 1440 + v[2];
      for (var sh = -W; sh <= 0; sh += W) if (s + sh <= now && now < e + sh && (!best || e + sh > best.e)) best = { e: e + sh, w: v[3] };
      var delta = ((s - now) % W + W) % W; if (delta > 0 && (!next || delta < next.d)) next = { d: delta, w: v[3] };
    }
    var w = best ? best.w : next ? next.w : undefined;
    if (M.w && w != null) pre = M.w[w] + ': ';
    if (best) {
      var left = best.e - now;
      return left <= 60 ? { s: 'closing', t: pre + (es ? 'Cierra pronto · ' : 'Closes soon · ') + tm(best.e), today: n.day }
                        : { s: 'open', t: pre + (es ? 'Abierto ahora · cierra ' : 'Open now · closes ') + at(best.e), today: n.day };
    }
    if (!next) return null;
    if (next.d <= 60) return { s: 'opening', t: pre + (es ? 'Abre pronto · ' : 'Opens soon · ') + tm(now + next.d), today: n.day };
    return { s: 'closed', t: pre + (es ? 'Cerrado · abre ' : 'Closed · opens ') + when(now + next.d), today: n.day };
  }
  if (M.k === 'classes') {
    var nx = null;
    for (var j = 0; j < M.st.length; j++) {
      var c = M.st[j], dl = ((c[0] * 1440 + c[1] - now) % W + W) % W;
      if (dl > 0 && (!nx || dl < nx.d)) nx = { d: dl, l: c[2] };
    }
    if (!nx) return null;
    var lab = nx.l != null && M.lb ? M.lb[nx.l] + ' · ' : '';
    return { s: 'next', t: (es ? 'Próxima clase · ' : 'Next class · ') + lab + when(now + nx.d), today: n.day };
  }
  if (M.k === 'opens') {                                // only a start time is known ("desde las 7pm"): say the schedule, never "open now"
    var op = M.op || [], td = null, nxo = null;
    for (var q = 0; q < op.length; q++) { if (op[q][0] === n.day) td = op[q];
      var dq = ((op[q][0] * 1440 + op[q][1] - now) % W + W) % W; if (op[q][0] !== n.day && (!nxo || dq < nxo.d)) nxo = { d: dq }; }
    if (td) return { s: 'next', t: (es ? 'Hoy desde ' + at(td[1]).replace(/^a /, '') : 'Today from ' + tm(td[1])), today: n.day };
    if (!nxo) return null;
    return { s: 'closed', t: (es ? 'Cerrado hoy · abre ' : 'Closed today · opens ') + when(now + nxo.d), today: n.day };
  }
  if (M.k === 'days') {                                 // only days are known: say "closed today" (a fact); on open days show no pill
    if ((M.closed || []).indexOf(n.day) < 0) return null;
    for (var k = 1; k <= 7; k++) { var dd2 = (n.day + k) % 7; if ((M.open || []).indexOf(dd2) >= 0)
      return { s: 'closed', t: (es ? 'Cerrado hoy · abre ' : 'Closed today · opens ') + (k === 1 ? (es ? 'mañana' : 'tomorrow') : (es ? 'el ' + DN[dd2] : DN[dd2])), today: n.day }; }
    return { s: 'closed', t: es ? 'Cerrado hoy' : 'Closed today', today: n.day };
  }
  return null;
}
if (typeof module !== 'undefined') module.exports = { nyNow: nyNow, hoursStatus: hoursStatus };
