// node record.mjs <chapter...>  — records each chapter into out/<chapter>/ (frames + timeline.json)
import * as L from './lib.mjs';
import * as S from './seed.mjs';
const { W, jpg } = L;
const APP = 'https://app.local/Claude/';
const PORTAL = APP + '?haccp=1&site=MAGIC+CITY+DOGS&unit=114&loctype=Concession';

const setVal = (a, sel, v) => a.evalApp(([q, t]) => { const el = document.querySelector(q); if (!el) return false; const P = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(P.prototype, 'value').set.call(el, t); el.dispatchEvent(new Event('input', { bubbles: true })); return true; }, [sel, v]);
async function inspectorReady(a, badge = '448800') {
  await a.dev('phone'); await a.open(APP, 2400); await a.signIn(badge, { show: false }); await a.nav('inspector', 1600);
}
async function eventWalk(a) { const ev = await a.find('[data-testid=insp-type-event]'); if (ev) { await ev.click(); await W(900); } }
async function pickStand(a, q = 'magic city', id = 'u:114', show = false) {
  if (show) { await a.type('[data-testid=walk-stand-search]', q, { delay: 90 }); await a.tap(`[data-testid=walk-stand-row][data-id="${id}"]`, null, { settle: 1300 }); }
  else { await setVal(a, '[data-testid=walk-stand-search]', q); await W(400); const r = await a.find(`[data-testid=walk-stand-row][data-id="${id}"]`); if (r) { await r.click(); await W(1300); } }
}
const CH = {};

CH.intro = () => L.chapter('intro', {}, async a => {
  await a.dev('none');
  await a.page.evaluate(() => window.intro(['Getting in', 'Inspection types', 'The quick walk', 'The full checklist', 'Past reports', 'Follow-ups', 'Stands & equipment', 'Stand teams', 'From the stands', 'Crews', 'Analytics & admin']));
  await W(800);
  await a.scene('s01', async () => {});
  await a.page.evaluate(() => { window.unintro(); window.loop(); });
  await a.scene('s02', async a => {
    const on = (id, hot) => a.page.evaluate(([i, h]) => window.loopOn(i, h), [id, !!hot]);
    await a.at(0.08); await on('n_insp', true);
    await a.at(0.22); await on('a_insp_fu'); await on('n_fu');
    await a.at(0.38); await on('a_fu_crew'); await on('n_crew');
    await a.at(0.52); await on('a_crew_after'); await on('n_after', true);
    await a.at(0.70); await on('n_stand');
    await a.at(0.80); await on('a_stand_temps'); await on('n_temps', true);
  }, { minLen: 0 });
  await a.page.evaluate(() => window.unloop()); await W(700);
});

CH.signin = () => L.chapter('signin', { card: [2, 'Getting in', 'One badge for everyone. Each role sees its own screens.'] }, async a => {
  await a.dev('phone'); await a.open(APP, 2600); await a.unchapter(); await W(600);
  await a.scene('s03', async a => {
    await a.at(0.05); await a.type('input', '448800', { delay: 160 }); a.tick(0);
    await a.at(0.28); await a.tap('button', /Sign In/, { settle: 2000 }); a.tick(1);
    const ov = await a.find('div', /Tap here/, 2); await a.unpoint();
    await a.at(0.75); a.tick(2);
  });
  await a.scene('s04', async a => {
    await a.at(0.05); await a.tap('button.hamburgerBtn[aria-label="Menu"]', null, { settle: 1100 }); a.tick(0);
    await a.at(0.45); await a.tap('button.hamburgerBtn[aria-label="Menu"]', null, { settle: 700 });
    await a.evalApp(() => document.documentElement.classList.add('tourLang')); await W(300);
    await a.at(0.55); await a.tap('.langFab', null, { settle: 1200 }); a.tick(1);
    await a.at(0.82); a.tick(2); await a.tap('.langFab', null, { settle: 600 }); await a.unpoint();
    await a.evalApp(() => document.documentElement.classList.remove('tourLang'));
  });
});

CH.types = () => L.chapter('types', { card: [3, 'Inspection types', 'The type you pick decides the form.'] }, async a => {
  await inspectorReady(a); await a.unchapter(); await W(600);
  await a.scene('s05', async a => {
    const pick = await a.find('[data-testid=insp-type-pick]'); if (pick) { await a.show(pick); await a.hl(pick, 'Pick the type'); }
    await a.at(0.18); await a.unhl(); const e = await a.find('[data-testid=insp-type-event]'); await a.hl(e, 'Quick walk'); a.tick(0);
    await a.at(0.50); const r = await a.find('[data-testid=insp-type-regular]'); await a.hl(r, 'Full checklist'); a.tick(1);
    await a.at(0.72); const p = await a.find('[data-testid=insp-type-post]'); await a.hl(p, 'Post-event walk'); a.tick(2);
    await a.at(0.98); await a.unhl();
  });
  await a.scene('s06', async a => {
    await a.tap('[data-testid=insp-type-event]', null, { settle: 1100 }); await pickStand(a); await a.unpoint();
    const ban = async (id, label, i) => { const e = await a.find(`[data-testid=insp-banner-${id}]`, null, 6); if (e) { await a.show(e); await a.hl(e, label, true); } a.tick(i); };
    await ban('event', 'Event walk', 0);
    await a.at(0.30); await a.unhl(); await a.evalApp(() => window.__sdxPickType('Post Event')); await W(900); await ban('post', 'Post-event check', 2);
    await a.at(0.55); await a.unhl(); await a.evalApp(() => window.__sdxPickType('Regular Inspection')); await W(1200); await ban('regular', 'Regular inspection', 1);
    await a.at(0.98); await a.unhl();
  });
});

CH.walk = () => L.chapter('walk', { card: [4, 'The quick walk', 'Fast, simple, and it saves itself.'] }, async a => {
  await inspectorReady(a); await eventWalk(a); await a.unchapter(); await W(600);
  await a.scene('s07', async a => {
    const sc = await a.find('button', /Scan the stand QR|Scan/); if (sc) await a.hl(sc, 'Scan the poster'); a.tick(0);
    await a.at(0.22); await a.unhl(); await a.type('[data-testid=walk-stand-search]', 'magic city', { delay: 90 }); a.tick(1);
    await a.at(0.50); await a.tap('[data-testid=walk-stand-row][data-id="u:114"]', null, { settle: 1300 });
    const card = await a.find('[data-testid=walk-stand-card]'); if (card) await a.hl(card, 'License · floor · type'); a.tick(2);
    await a.at(0.98); await a.unhl(); await a.unpoint();
  });
  await a.scene('s08', async a => {
    const dots = await a.find('.walkDots, [data-testid=walk-progress-text]'); const d1 = await a.find('[data-testid^=walk-dot-]');
    await a.at(0.05); if (d1) { await a.show(d1); const box = await a.find('[data-testid=walk-progress]') || dots; if (box) await a.hl(box, 'Areas'); } a.tick(0);
    await a.at(0.45); await a.unhl(); const t = await a.find('[data-testid=walk-dot-temps]'); if (t) await a.hl(t, '⭐ first'); a.tick(1);
    await a.at(0.75); await a.unhl(); if (dots) await a.hl(dots, 'Done so far'); a.tick(2);
    await a.at(0.98); await a.unhl();
  });
  await a.scene('s09', async a => {
    await a.tap('[data-testid=walk-dot-floors]', null, { settle: 700 });
    await a.at(0.08); await a.tap('[data-testid=walk-area-floors] [data-testid=walk-allgood]', null, { settle: 900, label: 'All good' }); a.tick(0); await a.unhl();
    await a.at(0.45); await a.tap('[data-testid=walk-dot-sinks]', null, { settle: 700 });
    await a.tap('[data-testid=walk-area-sinks] [data-testid=walk-wrong]', null, { settle: 800, label: "Something's wrong" }); a.tick(1); await a.unhl();
    await a.at(0.70); await a.tap('[data-testid=walk-area-sinks] [data-testid=walk-item][data-key="facility.handSink"]', null, { settle: 800 });
    await a.at(0.86); await a.tap('[data-testid=walk-area-sinks] [data-testid=walk-row][data-idx="0"]', null, { settle: 900 }); a.tick(2); await a.unpoint();
  });
  await a.scene('s10', async a => {
    await a.at(0.08); const inp = await a.find('[data-testid=walk-photo-input]', null, 4); const pb = await a.find('[data-testid=walk-photo]');
    if (pb) { await a.point(pb); await a.page.evaluate(([x, y]) => window.tap(x, y), [0, 0]).catch(() => {}); }
    if (inp) await inp.setInputFiles({ name: 'sink.jpg', mimeType: 'image/jpeg', buffer: jpg('faucet') }); await W(1300); a.tick(0);
    await a.at(0.22); await a.tap('[data-testid=walk-fix-chip]', /Told the manager/, { settle: 600 }); a.tick(1);
    await a.at(0.40); await a.tap('[data-testid=walk-where-chip]', /Back of the house/, { settle: 600 });
    const u = await a.find('[data-testid=walk-urgent]', null, 2); if (u) await a.hl(u, 'Urgent'); a.tick(2);
    await a.at(0.58); await a.unhl(); await a.tap('[data-testid=walk-sheet-done]', null, { settle: 900 }); a.tick(3);
    await a.at(0.75); const rest = await a.find('[data-testid=walk-area-sinks] [data-testid=walk-rest-ok]', null, 2); if (rest) await a.tap(rest, null, { settle: 900 });
    const und = await a.find('[data-testid=walk-undo]', null, 3); if (und) await a.hl(und, 'Undo'); await a.at(0.98); await a.unhl(); await a.unpoint();
  });
  await a.scene('s11', async a => {
    await a.tap('[data-testid=walk-dot-temps]', null, { settle: 1300 }); a.tick(0);
    const row = async re => { for (const r of await a.F.$$('[data-testid=walk-temp-row]')) { const t = await r.$eval('.walkTempName', e => e.textContent).catch(() => ''); if (re.test(t)) return r; } return null; };
    await a.at(0.18); const c = await row(/2-DOOR COOLER/i); if (c) { await a.type(await c.$('[data-testid=walk-temp-input]'), '38', { delay: 160 }); } a.tick(1);
    await a.at(0.34); const f = await row(/FREEZER/i); if (f) { const neg = await f.$('[data-testid=walk-temp-neg]'); if (neg) await a.tap(neg, null, { settle: 300 }); const i = await f.$('[data-testid=walk-temp-input]'); await i.focus(); await a.F.page().keyboard.press('End'); await a.F.page().keyboard.type('5', { delay: 160 }); await W(400); }
    await a.at(0.55); const hs = await row(/Hand sink/i); if (hs) await a.type(await hs.$('[data-testid=walk-temp-input]'), '102', { delay: 140 });
    await a.at(0.72); const d = await row(/DISPLAY COOLER/i); if (d) { await a.type(await d.$('[data-testid=walk-temp-input]'), '50', { delay: 160 }); const m = await d.$('[data-testid=walk-temp-msg]'); if (m) await a.hl(m, 'Too warm'); }
    await a.at(0.86); await a.unhl(); if (d) { const fx = await d.$('[data-testid=walk-temp-fix]'); if (fx) await a.tap(fx, null, { settle: 700 }); await a.tap('[data-testid=walk-fix-chip]', /Moved the food/, { settle: 500 }); await a.tap('[data-testid=walk-sheet-done]', null, { settle: 600 }); } a.tick(2);
    await a.unpoint();
  });
  await a.scene('s12', async a => {
    await a.scrollTop();
    const prev = await a.find('[data-testid=walk-prev-problem]', null, 4); if (prev) { await a.show(prev); await a.hl(prev, "Last time's problem"); }
    await a.at(0.18); await a.unhl(); await a.tap('[data-testid=walk-prev-fixed]', null, { settle: 700 }); a.tick(0);
    await a.at(0.30); const st = await a.find('[data-testid=walk-prev-still]', null, 3); if (st) await a.tap(st, null, { settle: 700 });
    await a.at(0.45); await a.tap('[data-testid=walk-finish-save]', null, { settle: 2600, label: 'Finish & save' }); a.tick(1); await a.unhl();
    const sv = await a.find('[data-testid=walk-saved]', null, 6); if (sv) await a.show(sv, 'start'); a.tick(2); await a.unpoint();
  });
});

CH.full = () => L.chapter('full', { card: [5, 'The full checklist', 'Every section, every row, when you need the detail.'] }, async a => {
  await inspectorReady(a); await eventWalk(a); await pickStand(a);
  await a.evalApp(() => window.__sdxPickType('Regular Inspection')); await W(1400);
  const chip0 = await a.find('[data-testid=guide-chip-0]'); if (chip0) await a.show(chip0);
  await a.unchapter(); await W(600);
  await a.scene('s13', async a => {
    const chips = await a.find('.guideStepChips, .guideStepper, [data-testid=guide-chip-0]');
    const row = chips ? await chips.evaluateHandle(e => e.closest('.guideStepChips') || e.parentElement) : null;
    if (row) await a.hl(row.asElement(), 'Sections'); a.tick(0);
    await a.at(0.35); await a.unhl(); await a.tap('[data-testid=guide-chip-1]', null, { settle: 900 });
    await a.at(0.55); await a.tap('[data-testid=guide-chip-2]', null, { settle: 900 }); a.tick(1);
    await a.at(0.75); const pr = await a.find('.guideProgressText'); if (pr) await a.hl(pr, 'Checked · issues · left'); a.tick(2);
    await a.at(0.98); await a.unhl(); await a.unpoint();
  });
  await a.scene('s14', async a => {
    await a.evalApp(() => window.dispatchEvent(new CustomEvent('sdx-open-guide-item', { detail: { key: 'equipment.fryer' } }))); await W(900);
    const r0 = await a.find('[data-guide-key="equipment.fryer"] [data-cl-idx="0"]'); if (r0) await a.show(r0);
    await a.at(0.10); await a.tap('[data-guide-key="equipment.fryer"] [data-cl-idx="0"] .clBtnFail', null, { settle: 900, label: 'No' }); a.tick(0);
    await a.at(0.28); const d = await a.find('[data-guide-key="equipment.fryer"] [placeholder^="What exactly"]'); if (d) await a.type(d, 'Oil dark, needs change', { delay: 45 });
    const loc = await a.find('[data-guide-key="equipment.fryer"] [data-cl-idx="0"] button', /Back of the house/, 4); if (loc) await a.tap(loc, null, { settle: 500 }); a.tick(1);
    await a.at(0.55); const c = await a.find('[data-guide-key="equipment.fryer"] [placeholder^="What was done"]'); if (c) await a.type(c, 'Told the manager, oil changed', { delay: 40 }); a.tick(2);
    await a.at(0.75); const bb = await a.find('[data-guide-key="equipment.fryer"] [data-cl-idx="0"] .ciBaBefore'); if (bb) { await a.show(bb); await a.hl(bb, 'BEFORE photo'); }
    const fi = await a.F.$('[data-guide-key="equipment.fryer"] [data-cl-idx="0"] .ciBaRow input[type=file]'); if (fi) await fi.setInputFiles({ name: 'fryer.jpg', mimeType: 'image/jpeg', buffer: jpg('grease') }); await W(1200); a.tick(3);
    await a.at(0.98); await a.unhl(); await a.unpoint();
  });
  await a.scene('s15', async a => {
    // a second NO row with nothing filled, so the save list has something to show
    await a.evalApp(() => { const b = document.querySelector('[data-guide-key="equipment.fryer"] [data-cl-idx="1"] .clBtnFail'); b && b.click(); }); await W(500);
    await a.scrollTop(); const top = await a.find('[data-testid=full-top-back]'); if (top) await a.hl(top, 'Quick walk ⇄ full checklist', true); a.tick(0);
    await a.at(0.30); a.tick(1);
    await a.at(0.45); await a.unhl(); await a.tap('.btnGenHeader', null, { settle: 1300, label: 'Save Report' });
    const m = await a.find('[data-testid=presubmit-title]', null, 6); if (m) { const box = await m.evaluateHandle(e => e.closest('[role=dialog], .modal, .modalCard, .presubmitModal') || e.parentElement); await a.hl(box.asElement(), 'Before you save'); }
    await a.at(0.72); await a.unhl(); const go = await a.find('button', /Go fix/, 3); if (go) await a.hl(go, 'Go fix'); a.tick(2);
    await a.at(0.88); await a.unhl(); const sv = await a.find('[data-testid=presubmit-save]', null, 2); if (sv) await a.hl(sv, 'Save anyway');
    await a.at(0.99); await a.unhl(); const back = await a.find('[data-testid=presubmit-back]', null, 2); if (back) { await back.click(); await W(400); } await a.unpoint();
  });
});

CH.reports = () => L.chapter('reports', { card: [6, 'Past reports', 'Everything you saved, ready to open, edit or share.'] }, async a => {
  await a.dev('laptop'); await a.open(APP, 2400); await a.signIn('448800', { show: false }); await a.nav('history', 2600);
  await a.unchapter(); await W(600);
  await a.scene('s16', async a => {
    const c1 = await a.find('[data-rec]'); if (c1) await a.hl(c1, 'Newest first'); a.tick(0);
    await a.at(0.45); await a.unhl(); const s = await a.find('input[placeholder*="Search"], input[type=search]'); if (s) { await a.type(s, 'magic', { delay: 110 }); } a.tick(1);
    await a.at(0.85); if (s) { await s.fill(''); await W(600); } a.tick(2); await a.unpoint();
  });
  await a.scene('s17', async a => {
    const h = await a.find('[data-rec="r1"] .cardHeader') || await a.find('.cardHeader'); if (h) await a.tap(h, null, { settle: 1200 }); a.tick(0);
    await a.at(0.25); const iss = await a.find('[data-rec="r1"] .issueRow'); if (iss) { await a.show(iss); await a.hl(iss, 'Notes · place · corrective'); } a.tick(1);
    await a.at(0.70); await a.unhl(); const ed = await a.find('[data-rec="r1"] button', /Edit/); if (ed) { await a.show(ed); await a.hl(ed, 'Edit'); } a.tick(2);
    await a.at(0.98); await a.unhl(); await a.unpoint();
  });
  await a.scene('s18', async a => {
    await a.scrollTop(); await a.tap('button', /Select$/, { settle: 900 }); a.tick(0);
    await a.at(0.18); await a.tap('.bulkBar button', /Select All/, { settle: 700 });
    await a.at(0.35); const ex = await a.find('.bulkBar button', /Excel/); if (ex) await a.tap(ex, null, { settle: 1300 }); a.tick(1);
    await a.at(0.55); const st = await a.find('.expCrewStep'); if (st) await a.hl(st, 'Who is it for?'); a.tick(2);
    await a.at(0.85); await a.unhl(); const pic = await a.find('[data-testid=exp-crew-cleaning]'); if (pic) await a.tap(pic, null, { settle: 900 });
    const pt = await a.find('button, label', /Pictures in the file/, 3); if (pt) await a.hl(pt, 'Pictures'); a.tick(3);
    await a.at(0.99); await a.unhl(); await a.unpoint();
  });
});

CH.followups = () => L.chapter('followups', { card: [7, 'Follow-ups', 'Every open problem until it is fixed, with proof.'] }, async a => {
  await a.dev('phone'); await a.open(APP, 2400); await a.signIn('448800', { show: false }); await a.nav('history', 2400);
  const an = await a.find('button', /ANALYTICS/i); if (an) { await an.click(); await W(1800); } const fu = await a.find('button', /Follow-ups/); if (fu) { await fu.click(); await W(2000); }
  await a.unchapter(); await W(600);
  await a.scene('s19', async a => {
    const c = await a.find('[data-testid=fu-sim-card]'); if (c) { await a.show(c, 'start'); const ba = await c.$('[data-testid=fu-sim-ba]'); if (ba) await a.hl(ba, 'Before · After'); } a.tick(0); a.tick(1);
    await a.at(0.55); await a.unhl(); await a.scrollTop(); await a.tap('[data-testid=fu-sim-crew-cleaning]', null, { settle: 900, label: 'Crew' }); a.tick(2);
    await a.at(0.85); await a.tap('[data-testid=fu-sim-crew-all]', null, { settle: 800 }); await a.unpoint();
  });
  await a.scene('s20', async a => {
    const c = await a.find('[data-testid=fu-sim-card]'); if (c) await a.show(c, 'start');
    await a.at(0.05); const fx = c && await c.$('[data-testid=fu-sim-fixed]'); if (fx) await a.tap(fx, null, { settle: 900 }); a.tick(0);
    const u = await a.find('[data-testid=fu-sim-undo]', null, 4); if (u) await a.hl(u, 'Undo');
    await a.at(0.30); await a.unhl(); const ub = await a.find('[data-testid=fu-sim-undo] button', null, 2); if (ub) await a.tap(ub, null, { settle: 900 });
    await a.at(0.45); const c2 = await a.find('[data-testid=fu-sim-card]'); if (c2) await a.show(c2, 'start'); const rm = c2 && await c2.$('[data-testid=fu-sim-remind]'); if (rm) await a.tap(rm, null, { settle: 1100 }); a.tick(1);
    await a.at(0.70); const ph = c2 && await c2.$('[data-testid=fu-sim-photo]'); if (ph) await a.hl(ph, '📷 After photo'); a.tick(2);
    await a.at(0.98); await a.unhl(); await a.unpoint();
  });
  await a.scene('s21', async a => {
    await a.dev('laptop'); await W(1200); await a.scrollTop();
    await a.tap('[data-testid=fu-more-options]', null, { settle: 1500 });
    const tools = await a.find('[data-testid=fu-tools]'); if (tools) { await a.show(tools, 'start'); await a.hl(tools, 'Group · filter · crew'); } a.tick(0);
    await a.at(0.30); await a.unhl(); const fl = await a.find('button', /By Floor/); if (fl) await a.tap(fl, null, { settle: 1000 });
    await a.at(0.55); const sel = await a.find('button', /Select to export/); if (sel) await a.tap(sel, null, { settle: 1000 }); const bar = await a.find('[data-testid=fu-export-bar]', null, 3); if (bar) await a.hl(bar, 'Before & after Excel'); a.tick(1);
    await a.at(0.80); await a.unhl(); const fixedChip = await a.find('button, span', /fixed today/i, 3); if (fixedChip) await a.hl(fixedChip, 'Fixed today · Put back'); a.tick(2);
    await a.at(0.99); await a.unhl(); await a.unpoint();
  });
});

CH.stands = () => L.chapter('stands', { card: [8, 'Stands & equipment', 'One poster per stand, the people, and every cooler.'] }, async a => {
  await a.dev('laptop'); await a.open(APP, 2400); await a.signIn('448800', { show: false }); await a.nav('kitchen_qr', 3000);
  await a.unchapter(); await W(600);
  await a.scene('s22', async a => {
    const fh = await a.find('.kqrFloorHead'); if (fh) { await a.show(fh, 'start'); await a.hl(fh, 'Divided by floor'); } a.tick(0); a.tick(1);
    await a.at(0.5); await a.unhl(); const pill = await a.find('button', /Floor 1 \(/, 4); if (pill) await a.tap(pill, null, { settle: 900, label: 'Print a floor' }); a.tick(2);
    await a.at(0.8); const nl = await a.find('span, div', /NO LICENSE/, 3); if (nl) { await a.show(nl); await a.hl(nl, 'No license'); }
    await a.at(0.99); await a.unhl(); await a.unpoint();
  });
  await a.scene('s23', async a => {
    const pp = await a.find('.kqrPeople'); if (pp) { await a.show(pp); await a.hl(pp, 'People at this stand'); } a.tick(0);
    await a.at(0.4); await a.unhl(); const tl = await a.find('.kqrPersonBtn', /Text link/); if (tl) await a.hl(tl, 'Text link'); a.tick(1);
    await a.at(0.75); await a.unhl(); const wa = tl && await tl.evaluateHandle(e => e.nextElementSibling); if (wa && wa.asElement()) await a.hl(wa.asElement(), 'WhatsApp'); a.tick(2);
    await a.at(0.99); await a.unhl();
  });
  await a.scene('s24', async a => {
    await a.nav('print_labels', 2600); a.tick(0);
    const st = await a.find('.walkStand'); if (st) await a.hl(st, 'Coolers and freezers');
    await a.at(0.35); await a.unhl(); a.tick(1);
    await a.at(0.6); const rv = await a.find('[data-testid=eq-review]', null, 4); if (rv) { await a.show(rv, 'start'); await a.hl(rv, 'Not sure which stand'); } a.tick(2);
    await a.at(0.99); await a.unhl();
  });
});

CH.portal = () => L.chapter('portal', { card: [9, 'Stand teams', 'Scan the poster. No app, no password.'] }, async a => {
  await a.dev('phone'); await a.open(PORTAL, 2600); await a.unchapter(); await W(500);
  await a.scene('s25', async a => {
    await a.at(0.3); const en = await a.find('button', /English/, 4); if (en) await a.tap(en, null, { settle: 700 }); a.tick(0); a.tick(1);
    await a.at(0.5); await a.type('input[placeholder="Full name"]', 'MARIA P.', { delay: 70 });
    await a.type('input[placeholder*="787"]', '3055550101', { delay: 60 }); await a.tap('.haccpSubmitBtn', /Continue/, { settle: 1300 }); a.tick(2);
    await a.at(0.9); await a.tap('.haccpSubmitBtn', /location/i, { settle: 1500 }); await a.unpoint();
  });
  await a.scene('s26', async a => {
    await a.tap('button', /Hot Holding/, { settle: 800 }); a.tick(0);
    const inp = await a.find('.haccpTempInput'); if (inp) await a.type(inp, '150', { delay: 150 });
    await a.evalApp(() => { const r = document.querySelector('.htReading'); if (!r) return; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; [...r.querySelectorAll('input')].forEach(i => { if (!i.value) { set.call(i, i.type === 'time' ? '12:30' : 'CHICKEN'); i.dispatchEvent(new Event('input', { bubbles: true })); } }); });
    await a.at(0.4); await a.tap('.htSubmit', null, { settle: 900, label: 'Log it' }); a.tick(1);
    await a.at(0.7); const done = await a.find('.htCollapse', null, 3); if (done) await a.tap(done, null, { settle: 900 }); a.tick(2);
    const as = await a.find('[data-testid=auto-sent]', null, 4); if (as) await a.hl(as, 'Sent to the inspector');
    await a.at(0.99); await a.unhl(); await a.unpoint();
  });
  await a.scene('s27', async a => {
    await a.tap('button', /Poultry/, { settle: 800 });
    const ins = await a.F.$$('.haccpTempInput'); const inp = ins[ins.length - 1]; if (inp) await a.type(inp, '120', { delay: 150 });
    await a.evalApp(() => { const rs = document.querySelectorAll('.htReading'); const r = rs[rs.length - 1]; if (!r) return; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; [...r.querySelectorAll('input')].forEach(i => { if (!i.value) { set.call(i, i.type === 'time' ? '12:45' : 'RICE'); i.dispatchEvent(new Event('input', { bubbles: true })); } }); });
    const sb = await a.F.$$('.htSubmit'); if (sb.length) await a.tap(sb[sb.length - 1], null, { settle: 900 });
    const box = await a.find('[data-corr]', null, 4); if (box) { await a.show(box); await a.hl(box, 'What did you do?'); } a.tick(0);
    await a.at(0.35); await a.unhl(); const ta = await a.find('[data-corr] textarea'); if (ta) await a.type(ta, 'Reheated to 165F', { delay: 60 }); a.tick(1);
    await a.at(0.6); await a.tap('[data-testid=corr-send]', null, { settle: 1200 }); const sent = await a.find('[data-testid=corr-sent]', null, 4); if (sent) await a.hl(sent, 'Sent'); a.tick(2);
    await a.at(0.99); await a.unhl(); await a.unpoint();
  });
  await a.scene('s28', async a => {
    const eq = await a.find('.htEquipCard', null, 4); if (eq) { await a.show(eq, 'start'); await a.hl(eq, 'Their own coolers'); } a.tick(0);
    await a.at(0.4); await a.unhl(); const sr = await a.find('[data-testid=sup-req]', null, 4); if (sr) await a.show(sr, 'start');
    await a.tap('[data-testid=sup-req-chip]', /Test strips/, { settle: 500 }); a.tick(1);
    await a.tap('[data-testid=sup-req-chip]', /Paper towels/, { settle: 500 });
    await a.at(0.85); const ck = await a.find('.supReqSection input[type=checkbox]', null, 2); if (ck) await a.tap(ck, null, { settle: 400 }); a.tick(2); await a.unpoint();
  });
  await a.scene('s29', async a => {
    const cat = await a.find('.supCatChip', null, 4); if (cat) { await a.show(cat); await a.tap(cat, null, { settle: 700 }); } a.tick(0);
    const tx = await a.find('.haccpProblemTextarea'); if (tx) await a.type(tx, 'Freezer door seal is torn', { delay: 45 });
    const fi = await a.F.$('.haccpProblemSection input[type=file], input[type=file]'); if (fi) await fi.setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: jpg('faucet') }); await W(900);
    await a.at(0.5); const add = await a.find('.supAddAnotherBtn', null, 2); if (add) await a.hl(add, 'Add another problem'); a.tick(1);
    await a.at(0.7); await a.unhl(); const ref = await a.find('.haccpRefWrap', null, 3); if (ref) { await a.show(ref, 'start'); await a.hl(ref, 'Food Safety Quick Reference', true); } a.tick(2);
    await a.at(0.99); await a.unhl(); await a.unpoint();
  });
});

CH.feed = () => L.chapter('feed', { card: [10, 'From the stands', 'See every log the moment it arrives.'] }, async a => {
  await a.dev('phone'); await a.open(APP, 2400); await a.signIn('448800', { show: false });
  await a.evalApp(() => window.__sdxStandFeedIngest([])); await W(300);
  await a.evalApp(r => window.__sdxStandFeedIngest(r), S.feedRecords()); await W(800);
  await a.unchapter(); await W(500);
  await a.scene('s30', async a => {
    await a.tap('[data-testid=stand-feed-chip]', null, { settle: 1200, label: 'From the stands' }); a.tick(0);
    await a.at(0.35); const c = await a.find('[data-testid=stand-feed-row]'); if (c) await a.hl(c, 'Problems first'); a.tick(1);
    await a.at(0.6); await a.unhl(); const h = await a.find('.sfCardHead'); if (h) await a.tap(h, null, { settle: 1000 });
    const b = await a.find('[data-testid=sf-body]', null, 3); if (b) await a.show(b); a.tick(2);
    await a.at(0.99); await a.unpoint();
  });
  await a.scene('s31', async a => {
    await a.evalApp(() => document.querySelector('.sfBackdrop')?.click()); await W(400);
    await a.dev('laptop'); await W(900); await a.nav('history', 2200);
    const an = await a.find('button', /ANALYTICS/i); if (an) await a.tap(an, null, { settle: 1500 });
    const tp = await a.find('button', /Temp/); if (tp) await a.tap(tp, null, { settle: 1600 }); a.tick(0);
    await a.at(0.3); await a.tap('[data-testid=hc-view-flags]', null, { settle: 1200, label: 'Not scanning' }); a.tick(1);
    await a.at(0.7); const t = await a.find('[data-testid=hc-text]', null, 3); if (t) await a.hl(t, 'Text the flagged'); a.tick(2);
    await a.at(0.99); await a.unhl(); await a.unpoint();
  });
});

CH.crew = () => L.chapter('crew', { card: [11, 'Crews', 'Maintenance, cleaning and Ecolab: a board with their jobs.'] }, async a => {
  await a.dev('phone'); await a.open(APP + '?invite=tokc', 2600); await a.unchapter(); await W(500);
  await a.scene('s32', async a => {
    await a.at(0.1); await a.type('[data-testid=crew-join-name]', 'ANA R.', { delay: 110 }); a.tick(0); a.tick(1);
    await a.at(0.4); await a.tap('[data-testid=crew-join-go]', null, { settle: 2200 });
    const h = await a.find('[data-testid=crew-hello]', null, 6); if (h) await a.hl(h, 'Your jobs'); a.tick(2);
    await a.at(0.99); await a.unhl(); await a.unpoint();
  });
  await a.scene('s33', async a => {
    await a.tap('[data-testid=crew-work]', null, { settle: 1200 }); a.tick(0);
    await a.at(0.4); await a.tap('[data-testid=crew-done]', null, { settle: 1000 }); a.tick(1);
    const fi = await a.F.$$('input[type=file]'); for (const f of fi) { try { await f.setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpg('after') }); break; } catch {} } await W(1500);
    await a.at(0.65); const how = await a.find('.crewHowBtn', null, 2); if (how) await a.tap(how, null, { settle: 500 });
    await a.at(0.8); await a.tap('[data-testid=crew-send]', null, { settle: 1500 }); a.tick(2); await a.unpoint();
  });
  await a.scene('s34', async a => {
    const m = await a.find('button', /more/i, 3); if (m) await a.tap(m, null, { settle: 800 });
    const nm = await a.find('button', /Not mine/, 3); if (nm) await a.hl(nm, 'Not mine'); a.tick(0); a.tick(1);
    await a.at(0.55); await a.unhl(); await a.scrollTop(); const es = await a.find('button', /Español/, 3); if (es) await a.tap(es, null, { settle: 1200 }); a.tick(2);
    await a.at(0.9); const en = await a.find('button', /English/, 2); if (en) await a.tap(en, null, { settle: 800 }); await a.unpoint();
  });
});

CH.admin = () => L.chapter('admin', { card: [12, 'Analytics & admin', 'Answers from the reports, and the keys to the app.'] }, async a => {
  await a.dev('laptop'); await a.open(APP, 2400); await a.signIn('365582', { show: false }); await a.nav('history', 2400);
  const an = await a.find('button', /ANALYTICS/i); if (an) { await an.click(); await W(1800); }
  await a.unchapter(); await W(500);
  await a.scene('s35', async a => {
    const ins = await a.find('button', /Insights/i); if (ins) await a.tap(ins, null, { settle: 1500 }); a.tick(0);
    await a.at(0.4); const pr = await a.find('button', /Predict/i); if (pr) await a.tap(pr, null, { settle: 1500 }); a.tick(1);
    await a.at(0.7); const tl = await a.find('button', /Timeline/i); if (tl) await a.tap(tl, null, { settle: 1500 }); a.tick(2);
    await a.unpoint();
  });
  await a.scene('s36', async a => {
    await a.nav('admin', 2400); a.tick(0);
    await a.at(0.25); const il = await a.find('button, summary, h3, div', /Invite links/, 3); if (il) { await a.tap(il, null, { settle: 1200 }); } a.tick(1);
    await a.at(0.5); a.tick(2); await a.nav('print_labels', 2200); const ann = await a.find('button', /Announce/, 3); if (ann) await a.hl(ann, 'Announce');
    await a.at(0.8); a.tick(3); await a.at(0.99); await a.unhl(); await a.unpoint();
  });
});

CH.outro = () => L.chapter('outro', {}, async a => {
  await a.dev('none');
  await a.page.evaluate(() => window.outro(['Inspect', 'Follow up', 'Fix with proof', 'Log every temp']));
  await a.scene('s37', async () => {});
  await W(1500);
});

const which = process.argv.slice(2);
await L.launch();
for (const w of which) { if (!CH[w]) { console.log('no chapter', w); continue; } await CH[w](); }
await L.close();
