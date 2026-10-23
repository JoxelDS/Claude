// node tools/learn/build.mjs  → public/marketing/learn/** (English + /es/), and the Learn band on public/marketing/index.html
// The Learn website: the 8-lesson food-safety course (docs/training/food-handler/course.json) and the "How to use SDX
// Inspect" guide by role (docs/training/app-guide/guide.json). Static pages, so they work offline-first on GitHub Pages,
// can be indexed, and need no JavaScript to read (quizzes, progress and the certificate use tools/learn/site/learn.js).
// Videos come from tools/learn/media.json once they exist; without it every page is the readable text version.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { mark } from '../video/sdxmark.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'public/marketing/learn');
const SITE = 'https://joxelds.github.io/Claude/marketing/learn/';
const DEMO = 'https://joxelds.github.io/Claude/?v=riverside-demo';
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const course = rd('docs/training/food-handler/course.json');
const guide = fs.existsSync(path.join(ROOT, 'docs/training/app-guide/guide.json')) ? rd('docs/training/app-guide/guide.json') : null;
const media = fs.existsSync(path.join(ROOT, 'tools/learn/media.json')) ? rd('tools/learn/media.json') : {};
const LESSONS = course.lessons;
const ROLES = guide ? guide.roles : [];
const LANGS = ['en', 'es'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
const L = (o, lang) => (o && typeof o === 'object' ? (o[lang] ?? o.en ?? '') : o ?? '');
const lf = (o, k, lang) => o[`${k}_${lang}`] ?? o[`${k}_en`];
const fmtT = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ── UI words
const UI = {
  en: {
    learn: 'Learn', food: 'Food safety', app: 'How to use the app', navFood: 'Course', navApp: 'App guide', demo: 'Try the demo', about: 'About', other: 'Español', otherCode: 'es', product: 'SDX Inspect',
    skip: 'Skip to the content',
    heroEyebrow: 'SDX Inspect · Learn', heroTitle: 'Study food safety. Learn the app.', heroLead: 'Short lessons with Inspector Dex for stand teams, crews and inspectors — in English and Spanish, on any phone.',
    heroStatus: '> FREE · ENGLISH + ESPAÑOL · AT YOUR OWN PACE', startCourse: 'Start the food safety course', openGuide: 'How to use the app',
    tracksTitle: 'Two ways to learn', tracksLead: 'Take the food safety course for the basics every food handler needs, and the app guide for the job you do in SDX Inspect.',
    foodCard: 'Food safety course', foodCardP: '8 lessons on the basics every food handler needs: handwashing, temperatures, cooking and cooling, cross-contamination, cleaning, storage and pests. Each lesson ends with a short check.',
    appCard: 'How to use SDX Inspect', appCardP: 'Step by step for your job: inspector, stand team, crews and the person setting up a venue — with a live demo you can try.',
    lessonsN: '8 lessons', rolesN: '{n} guides', certChip: 'Certificate of completion', demoChip: 'Live demo',
    why1: 'Based on the FDA Food Code', why1p: 'Every rule in the course cites the 2022 FDA Food Code. Your local rules may be stricter — follow them too.',
    why2: 'English and Spanish', why2p: 'Every page, lesson and check is in both languages. Switch any time at the top.',
    why3: 'Your progress stays with you', why3p: 'Progress is saved in this browser. Copy your progress code to keep it on another phone.',
    courseTitle: 'Food safety course', courseLead: 'Eight short lessons. Read them, check yourself, and get an in-house certificate of completion when you pass all eight.',
    lessonN: 'Lesson {n}', lessonOf: 'Lesson {n} of {of}', minRead: 'about {n} min read', minVideo: '{t} video', quizN: '{n}-question check',
    inThis: 'In this lesson', theLesson: 'The lesson', remember: 'Remember', checkYourself: 'Check yourself', checkLead: 'Pick an answer — you will see right away if it is right, and why. Get {need} of {of} right to complete the lesson.',
    sources: 'Where this comes from', printSheet: 'Print the study sheet', studySheet: 'Study sheet', prev: '← Previous', next: 'Next lesson →', toCert: 'Get your certificate →',
    soonTitle: 'Video lesson coming soon', soonP: 'Inspector Dex is recording this lesson. Read it below — it is the same lesson.',
    chapters: 'Chapters', transcriptNote: 'Tap a paragraph to play that part of the video.',
    certTitle: 'Certificate of completion', certLead: 'Pass the check at the end of all 8 lessons (4 of 5 right) to get your certificate.',
    certLocked: 'Finish all 8 lessons to unlock your certificate.', certName: 'Your full name as it should appear', certMake: 'Make my certificate', certPrint: 'Print or save as PDF',
    certHead: 'Certificate of completion', certBody: 'has completed the SDX Inspect food safety course', certCourse: course.title_en,
    certDate: 'Date', certId: 'Certificate ID', certFine: 'In-house certificate of completion from SDX Inspect, recorded on this device and not verified. This is not a state food handler card or any official certification. Based on the 2022 FDA Food Code; local rules may be stricter.',
    codeTitle: 'Your progress code', codeLead: 'Progress is saved in this browser only. Copy this code to bring your progress to another phone or browser.', copy: 'Copy', codeEnter: 'Enter a code', codeUse: 'Use code',
    guideTitle: 'How to use SDX Inspect', guideLead: 'Pick your job. Each guide walks you through the app step by step, with the exact buttons you will see, and a live demo to try it.',
    demoBox: 'Try it on the live demo', demoBadge: 'Inspector badge', demoNote: 'The demo is a made-up venue. Other visitors use it too.', openDemo: 'Open the demo', tryIt: 'Try it in the demo',
    stepsTitle: 'Step by step', checkRole: 'Quick check', checkRoleLead: 'Three questions. Get 2 of 3 right to finish this guide.',
    whoFor: 'Who this is for', nextRole: 'Next guide →',
    aboutTitle: 'About these lessons', footer: 'SDX Inspect · Learn', privacy: 'Privacy',
    aboutBody: [
      'SDX Inspect is an inspection app for food stands and kitchens. These lessons are free study material for the people who work with it: stand teams, cleaning, maintenance and Ecolab crews, and inspectors.',
      'The food safety course follows the 2022 FDA Food Code. Each rule names its Food Code section in "Where this comes from". Your state, county or venue may have stricter rules — always follow those too.',
      'The certificate is an in-house certificate of completion from SDX Inspect. It is recorded only on your device and is not verified. It is not a state food handler card and not any other official certification.',
      'Inspector Dex is a cartoon. His voice in the videos is an AI voice.',
      'Your progress is saved in your browser and nowhere else. Nothing you answer here is sent to anyone.',
    ],
    i18n: { done: '✓ Done · {n}/5', tried: 'Tried · {n}/5', notyet: 'Not started', checked: '✓ Done', tried3: 'Tried · {n}/3', count: '{n} of {of} lessons done', countRoles: '{n} of {of} guides done', continueN: 'Continue: lesson {n}', start1: 'Start lesson 1', getCert: 'Get your certificate', passed: 'You got {n} of {of} right. Lesson complete!', failed: 'You got {n} of {of} right. You need {need} — read the lesson again and try once more.', again: 'Try again', next: 'Next →', copied: 'Copied.', codeOk: 'Progress added.', codeBad: 'That code does not look right — check it and try again.' },
  },
  es: {
    learn: 'Aprenda', food: 'Seguridad alimentaria', app: 'Cómo usar la app', navFood: 'Curso', navApp: 'Guía', demo: 'Pruebe el demo', about: 'Acerca de', other: 'English', otherCode: 'en', product: 'SDX Inspect',
    skip: 'Ir al contenido',
    heroEyebrow: 'SDX Inspect · Aprenda', heroTitle: 'Estudie seguridad alimentaria. Aprenda la app.', heroLead: 'Lecciones cortas con el Inspector Dex para equipos de puestos, cuadrillas e inspectores — en inglés y español, en cualquier teléfono.',
    heroStatus: '> GRATIS · ENGLISH + ESPAÑOL · A SU RITMO', startCourse: 'Empezar el curso de seguridad alimentaria', openGuide: 'Cómo usar la app',
    tracksTitle: 'Dos formas de aprender', tracksLead: 'Tome el curso de seguridad alimentaria para lo básico que todo manipulador de alimentos necesita, y la guía de la app para su trabajo en SDX Inspect.',
    foodCard: 'Curso de seguridad alimentaria', foodCardP: '8 lecciones sobre lo básico que todo manipulador de alimentos necesita: lavado de manos, temperaturas, cocinar y enfriar, contaminación cruzada, limpieza, almacenamiento y plagas. Cada lección termina con una pequeña prueba.',
    appCard: 'Cómo usar SDX Inspect', appCardP: 'Paso a paso para su trabajo: inspector, equipo del puesto, cuadrillas y quien configura un lugar — con un demo en vivo para probar.',
    lessonsN: '8 lecciones', rolesN: '{n} guías', certChip: 'Certificado de finalización', demoChip: 'Demo en vivo',
    why1: 'Basado en el Código de Alimentos de la FDA', why1p: 'Cada regla del curso cita el Código de Alimentos de la FDA de 2022. Sus reglas locales pueden ser más estrictas — sígalas también.',
    why2: 'Inglés y español', why2p: 'Cada página, lección y prueba está en los dos idiomas. Cambie cuando quiera, arriba.',
    why3: 'Su avance se queda con usted', why3p: 'El avance se guarda en este navegador. Copie su código de avance para llevarlo a otro teléfono.',
    courseTitle: 'Curso de seguridad alimentaria', courseLead: 'Ocho lecciones cortas. Léalas, compruebe lo que aprendió y obtenga un certificado interno de finalización al aprobar las ocho.',
    lessonN: 'Lección {n}', lessonOf: 'Lección {n} de {of}', minRead: 'unos {n} min de lectura', minVideo: 'video de {t}', quizN: 'prueba de {n} preguntas',
    inThis: 'En esta lección', theLesson: 'La lección', remember: 'Para recordar', checkYourself: 'Compruebe lo que aprendió', checkLead: 'Elija una respuesta — verá enseguida si es correcta y por qué. Acierte {need} de {of} para completar la lección.',
    sources: 'De dónde viene esto', printSheet: 'Imprimir la hoja de estudio', studySheet: 'Hoja de estudio', prev: '← Anterior', next: 'Siguiente lección →', toCert: 'Obtenga su certificado →',
    soonTitle: 'La lección en video llega pronto', soonP: 'El Inspector Dex está grabando esta lección. Léala abajo — es la misma lección.',
    chapters: 'Capítulos', transcriptNote: 'Toque un párrafo para ver esa parte del video.',
    certTitle: 'Certificado de finalización', certLead: 'Apruebe la prueba al final de las 8 lecciones (4 de 5 correctas) para obtener su certificado.',
    certLocked: 'Termine las 8 lecciones para desbloquear su certificado.', certName: 'Su nombre completo como debe aparecer', certMake: 'Hacer mi certificado', certPrint: 'Imprimir o guardar como PDF',
    certHead: 'Certificado de finalización', certBody: 'completó el curso de seguridad alimentaria de SDX Inspect', certCourse: course.title_es,
    certDate: 'Fecha', certId: 'ID del certificado', certFine: 'Certificado interno de finalización de SDX Inspect, guardado en este dispositivo y no verificado. No es una tarjeta estatal de manipulador de alimentos ni ninguna certificación oficial. Basado en el Código de Alimentos de la FDA de 2022; las reglas locales pueden ser más estrictas.',
    codeTitle: 'Su código de avance', codeLead: 'El avance se guarda solo en este navegador. Copie este código para llevar su avance a otro teléfono o navegador.', copy: 'Copiar', codeEnter: 'Escriba un código', codeUse: 'Usar código',
    guideTitle: 'Cómo usar SDX Inspect', guideLead: 'Elija su trabajo. Cada guía le muestra la app paso a paso, con los botones exactos que verá, y un demo en vivo para probarlo.',
    demoBox: 'Pruébelo en el demo en vivo', demoBadge: 'Credencial de inspector', demoNote: 'El demo es un lugar inventado. Otros visitantes también lo usan.', openDemo: 'Abrir el demo', tryIt: 'Pruébelo en el demo',
    stepsTitle: 'Paso a paso', checkRole: 'Prueba rápida', checkRoleLead: 'Tres preguntas. Acierte 2 de 3 para terminar esta guía.',
    whoFor: 'Para quién es', nextRole: 'Siguiente guía →',
    aboutTitle: 'Acerca de estas lecciones', footer: 'SDX Inspect · Aprenda', privacy: 'Privacidad',
    aboutBody: [
      'SDX Inspect es una app de inspección para puestos de comida y cocinas. Estas lecciones son material de estudio gratis para quienes trabajan con ella: equipos de puestos, cuadrillas de limpieza, mantenimiento y Ecolab, e inspectores.',
      'El curso de seguridad alimentaria sigue el Código de Alimentos de la FDA de 2022. Cada regla dice su sección del Código en «De dónde viene esto». Su estado, condado o lugar puede tener reglas más estrictas — sígalas siempre también.',
      'El certificado es un certificado interno de finalización de SDX Inspect. Se guarda solo en su dispositivo y no se verifica. No es una tarjeta estatal de manipulador de alimentos ni ninguna otra certificación oficial.',
      'El Inspector Dex es un personaje animado. Su voz en los videos es una voz de inteligencia artificial.',
      'Su avance se guarda en su navegador y en ningún otro lugar. Nada de lo que responde aquí se envía a nadie.',
    ],
    i18n: { done: '✓ Lista · {n}/5', tried: 'Intentada · {n}/5', notyet: 'Sin empezar', checked: '✓ Lista', tried3: 'Intentada · {n}/3', count: '{n} de {of} lecciones listas', countRoles: '{n} de {of} guías listas', continueN: 'Seguir: lección {n}', start1: 'Empezar la lección 1', getCert: 'Obtenga su certificado', passed: 'Acertó {n} de {of}. ¡Lección completa!', failed: 'Acertó {n} de {of}. Necesita {need} — lea la lección otra vez e inténtelo de nuevo.', again: 'Intentar otra vez', next: 'Siguiente →', copied: 'Copiado.', codeOk: 'Avance agregado.', codeBad: 'Ese código no parece correcto — revíselo e inténtelo de nuevo.' },
  },
};
const fmt = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o && k in o ? o[k] : ''));

// ── assets (content-hashed names so a new deploy never pairs new HTML with an old cached file)
const ASSETS = path.join(OUT, 'assets');
fs.mkdirSync(ASSETS, { recursive: true });
for (const f of fs.readdirSync(ASSETS)) if (/^learn\.[0-9a-f]{8}\.(css|js)$/.test(f)) fs.rmSync(path.join(ASSETS, f));
const hashed = (src, ext) => { const buf = fs.readFileSync(path.join(ROOT, src)); const h = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8); const name = `learn.${h}.${ext}`; fs.writeFileSync(path.join(ASSETS, name), buf); return name; };
const CSS = hashed('tools/learn/site/learn.css', 'css');
const JS = hashed('tools/learn/site/learn.js', 'js');

// ── page shell
const written = [];
function page({ lang, rel, title, desc, body, current, jsonld, bodyClass = '' }) {
  const depth = (lang === 'es' ? 1 : 0) + rel.split('/').filter(Boolean).length;
  const up = '../'.repeat(depth);
  const u = UI[lang], other = lang === 'en' ? 'es' : 'en';
  const href = (r, lg = lang) => up + (lg === 'es' ? 'es/' : '') + r;
  const navItem = (key, r, label) => `<a href="${href(r)}"${current === key ? ' aria-current="page"' : ''}>${esc(u[label || key])}</a>`;
  const canonical = SITE + (lang === 'es' ? 'es/' : '') + rel;
  const og = fs.existsSync(path.join(ASSETS, 'img/og.jpg')) ? `\n<meta property="og:image" content="${SITE}assets/img/og.jpg">` : '';
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en" href="${SITE}${rel}">
<link rel="alternate" hreflang="es" href="${SITE}es/${rel}">
<link rel="alternate" hreflang="x-default" href="${SITE}${rel}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">${og}
<meta name="theme-color" content="#0E1336">
<link rel="icon" href="${up}../../sdx-inspect-icon.svg" type="image/svg+xml">
<link rel="preload" href="${up}assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${up}assets/${CSS}">
<script>document.documentElement.classList.add("js")</script>${jsonld ? `\n<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body class="${bodyClass}" data-lessons="${LESSONS.map((l) => l.id).join(',')}" data-roles="${ROLES.map((r) => r.id).join(',')}">
<a class="skip" href="#main">${esc(u.skip)}</a>
<header class="nav"><div class="wrap">
<a class="brand" href="${href('')}" aria-label="SDX Inspect · ${esc(u.learn)}">${mark(30)}<span>SDX<small>${esc(u.learn.toUpperCase())}</small></span></a>
<nav class="nav-links" aria-label="${esc(u.learn)}">${navItem('food', 'food-safety/', 'navFood')}${guide ? navItem('app', 'app-guide/', 'navApp') : ''}<a class="hide-sm" href="${up}../../?v=riverside-demo">${esc(u.demo)}</a><a class="lang" href="${href(rel, other)}" hreflang="${other}" lang="${other}">${esc(u.other)}</a></nav>
</div></header>
<main id="main">
${body}
</main>
<footer class="foot"><div class="wrap"><span>${esc(u.footer)}</span><span><a href="${href('about/')}">${esc(u.about)}</a> · <a href="${up}../">${esc(u.product)}</a> · <a href="${up}../../privacy.html">${esc(u.privacy)}</a></span></div></footer>
<script type="application/json" id="learn-i18n">${JSON.stringify(u.i18n).replace(/</g, '\\u003c')}</script>
<script src="${up}assets/${JS}" defer></script>
</body>
</html>
`;
  const file = path.join(OUT, lang === 'es' ? 'es' : '', rel, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  written.push(path.relative(OUT, file));
  return { up, href };
}
const relUp = (lang, rel) => '../'.repeat((lang === 'es' ? 1 : 0) + rel.split('/').filter(Boolean).length);
const linkTo = (lang, from, to) => relUp(lang, from) + (lang === 'es' ? 'es/' : '') + to;
const demoHref = (lang, from, href) => { const up = relUp(lang, from); return String(href || DEMO).replace(/^https:\/\/joxelds\.github\.io\/Claude\//, up + '../../'); };
const lessonMins = (l, lang) => Math.max(2, Math.round(l.beats.reduce((a, b) => a + words(lf(b, 'say', lang)), 0) / 170));
const mediaFor = (id, lang) => media?.[id]?.[lang] || null;

// ── quiz markup (answers also in a <details> for readers without JavaScript)
function quiz({ lang, kind, id, items, need, next, nextLabel }) {
  const u = UI[lang];
  const qs = items.map((q, i) => {
    const opts = L(q.options, lang) || lf(q, 'options', lang);
    const text = L(q.q, lang) || lf(q, 'q', lang);
    const why = L(q.why, lang) || lf(q, 'why', lang);
    return `<fieldset class="q" data-answer="${q.answer}"><legend>${i + 1}. ${esc(text)}</legend>${opts.map((o, j) => `<label><input type="radio" name="${id}-q${i}" value="${j}"> <span>${esc(o)}</span></label>`).join('')}<p class="why" hidden>${esc(why)}</p></fieldset>`;
  }).join('\n');
  const nojs = items.map((q, i) => { const opts = L(q.options, lang) || lf(q, 'options', lang); return `<li><b>${i + 1}.</b> ${esc(opts[q.answer])} — ${esc(L(q.why, lang) || lf(q, 'why', lang))}</li>`; }).join('');
  return `<form class="quiz" data-kind="${kind}" data-id="${id}" data-pass="${need}"${next ? ` data-next="${next}" data-next-label="${esc(nextLabel || '')}"` : ''}>
${qs}
<div class="result" aria-live="polite"></div>
</form>
<details class="nojs-answers"><summary>Answers</summary><ol>${nojs}</ol></details>`;
}

// ── pages
for (const lang of LANGS) {
  const u = UI[lang];
  const lessonHref = (from, l) => linkTo(lang, from, `food-safety/${l.id}/`);

  // hub
  {
    const rel = '';
    const cont = JSON.stringify(Object.fromEntries([...LESSONS.map((l) => [l.id, lessonHref(rel, l)]), ['cert', linkTo(lang, rel, 'food-safety/certificate/')]]));
    const body = `<section class="hero"><div class="wrap">
<div><p class="eyebrow">${esc(u.heroEyebrow)}</p><h1>${esc(u.heroTitle)}</h1><p class="lead">${esc(u.heroLead)}</p>
<div class="hero-actions"><a class="btn btn-primary" href="${lessonHref(rel, LESSONS[0])}" data-continue='${esc(cont)}'>${esc(u.startCourse)}</a>${guide ? `<a class="btn btn-ghost" href="${linkTo(lang, rel, 'app-guide/')}">${esc(u.openGuide)}</a>` : ''}</div>
<p class="mono">${esc(u.heroStatus)}</p></div>
<img class="hero-dex" src="${relUp(lang, rel)}assets/img/dex.png" alt="${lang === 'es' ? 'El Inspector Dex, el inspector animado de SDX Inspect, con su tableta' : 'Inspector Dex, the SDX Inspect cartoon inspector, holding his tablet'}" width="294" height="467">
</div></section>
<section class="block"><div class="wrap">
<h2>${esc(u.tracksTitle)}</h2><p>${esc(u.tracksLead)}</p>
<div class="tracks">
<a class="card track" href="${linkTo(lang, rel, 'food-safety/')}"><span class="icon" aria-hidden="true">🧤</span><h3>${esc(u.foodCard)}</h3><p>${esc(u.foodCardP)}</p><div class="progress" data-progress="fs"><i></i></div><div class="meta"><span class="chip" data-count="fs">${esc(fmt(u.i18n.count, { n: 0, of: LESSONS.length }))}</span><span class="chip">${esc(u.certChip)}</span></div></a>
${guide ? `<a class="card track" href="${linkTo(lang, rel, 'app-guide/')}"><span class="icon" aria-hidden="true">📱</span><h3>${esc(u.appCard)}</h3><p>${esc(u.appCardP)}</p><div class="progress" data-progress="ag"><i></i></div><div class="meta"><span class="chip" data-count="ag">${esc(fmt(u.i18n.countRoles, { n: 0, of: ROLES.length }))}</span><span class="chip">${esc(u.demoChip)}</span></div></a>` : ''}
</div>
<div class="facts3">
<div class="card"><b>${esc(u.why1)}</b><p>${esc(u.why1p)}</p></div>
<div class="card"><b>${esc(u.why2)}</b><p>${esc(u.why2p)}</p></div>
<div class="card"><b>${esc(u.why3)}</b><p>${esc(u.why3p)}</p></div>
</div>
</div></section>`;
    page({ lang, rel, title: `${u.heroTitle} · SDX Inspect`, desc: u.heroLead, body, current: 'learn' });
  }

  // food-safety index
  {
    const rel = 'food-safety/';
    const items = LESSONS.map((l, i) => `<li><a class="card lesson-link" href="${lessonHref(rel, l)}" data-lesson="${l.id}"><span class="lesson-num" aria-hidden="true">${i + 1}</span><span><h3>${esc(lf(l, 'title', lang))}</h3><span class="muted">${esc(fmt(u.minRead, { n: lessonMins(l, lang) }))}${mediaFor(l.id, lang) ? ' · ' + esc(fmt(u.minVideo, { t: fmtT(mediaFor(l.id, lang).dur) })) : ''}</span></span><span class="state">${esc(u.i18n.notyet)}</span></a></li>`).join('\n');
    const cont = JSON.stringify(Object.fromEntries([...LESSONS.map((l) => [l.id, lessonHref(rel, l)]), ['cert', linkTo(lang, rel, 'food-safety/certificate/')]]));
    const body = `<div class="wrap read"><p class="crumbs"><a href="${linkTo(lang, rel, '')}">${esc(u.learn)}</a> › ${esc(u.food)}</p>
<div class="lesson-head"><p class="eyebrow">${esc(u.lessonsN)}</p><h1>${esc(u.courseTitle)}</h1><p class="muted">${esc(u.courseLead)}</p>
<div class="progress" data-progress="fs" style="max-width:420px"><i></i></div><p class="muted" data-count="fs">${esc(fmt(u.i18n.count, { n: 0, of: LESSONS.length }))}</p>
<p><a class="btn btn-primary" href="${lessonHref(rel, LESSONS[0])}" data-continue='${esc(cont)}'>${esc(u.i18n.start1)}</a></p></div>
<ol class="lessons">${items}
<li><a class="card lesson-link" href="${linkTo(lang, rel, 'food-safety/certificate/')}"><span class="lesson-num" aria-hidden="true">✓</span><span><h3>${esc(u.certTitle)}</h3><span class="muted">${esc(u.certLead)}</span></span><span class="state"></span></a></li>
</ol></div>
<section class="block"><div class="wrap"><div class="card"><p class="muted">${esc(lang === 'es' ? 'Basado en el Código de Alimentos de la FDA de 2022. Sus reglas locales pueden ser más estrictas.' : course.basis)} ${esc(lang === 'es' ? 'Certificado interno de finalización de SDX Inspect. No es una tarjeta estatal de manipulador de alimentos ni ninguna otra certificación oficial.' : course.certificate)}</p></div></div></section>`;
    page({ lang, rel, title: `${u.courseTitle} · SDX Inspect`, desc: u.courseLead, body, current: 'food', jsonld: { '@context': 'https://schema.org', '@type': 'Course', name: lang === 'es' ? course.title_es : course.title_en, description: u.courseLead, inLanguage: lang, provider: { '@type': 'Organization', name: 'SDX Inspect' }, isAccessibleForFree: true } });
  }

  // lessons
  LESSONS.forEach((l, i) => {
    const rel = `food-safety/${l.id}/`;
    const m = mediaFor(l.id, lang);
    const prev = LESSONS[i - 1], next = LESSONS[i + 1];
    const nextHref = next ? lessonHref(rel, next) : linkTo(lang, rel, 'food-safety/certificate/');
    const paras = l.beats.map((b, k) => { const t = m?.beats?.[k]; return `<p${t != null ? ` data-t="${t}"` : ''}>${esc(lf(b, 'say', lang))}</p>`; }).join('\n');
    const player = m ? `<aside class="player" aria-label="${esc(u.chapters)}"><video controls playsinline preload="metadata" poster="${esc(m.poster)}"><source src="${esc(m.mp4)}" type="video/mp4"><track kind="captions" srclang="${lang}" label="${lang === 'es' ? 'Español' : 'English'}" src="${esc(m.vtt)}" default></video>
<ol class="chapters">${(m.chapters || []).map(([t, name]) => `<li><button type="button" data-t="${t}"><span class="t">${fmtT(t)}</span><span>${esc(name)}</span></button></li>`).join('')}</ol></aside>` : '';
    const soon = m ? `<p class="muted no-print">${esc(u.transcriptNote)}</p>` : `<div class="card soon no-print"><img src="${relUp(lang, rel)}assets/img/dex.png" alt="" width="72" height="114"><div><h3>${esc(u.soonTitle)}</h3><p>${esc(u.soonP)}</p></div></div>`;
    const facts = l.facts.map((f) => `<li>${esc(f.claim)}<small>${esc(f.source)}</small></li>`).join('');
    const body = `<div class="wrap read"><p class="crumbs"><a href="${linkTo(lang, rel, '')}">${esc(u.learn)}</a> › <a href="${linkTo(lang, rel, 'food-safety/')}">${esc(u.food)}</a> › ${esc(fmt(u.lessonN, { n: i + 1 }))}</p>
<div class="lesson-head"><p class="eyebrow">${esc(fmt(u.lessonOf, { n: i + 1, of: LESSONS.length }))}<span class="print-only"> · ${esc(u.studySheet)}</span></p><h1>${esc(lf(l, 'title', lang))}</h1>
<div class="ui"><span>${esc(fmt(u.minRead, { n: lessonMins(l, lang) }))}</span>${m ? `<span>${esc(fmt(u.minVideo, { t: fmtT(m.dur) }))}</span>` : ''}<span>${esc(fmt(u.quizN, { n: l.quiz.length }))}</span></div></div>
<div class="lesson-grid${m ? ' has-video' : ''}">${player}
<div class="stack">
<div class="panel"><h2>${esc(u.inThis)}</h2><ul class="goals">${lf(l, 'objectives', lang).map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>
${soon}
<article class="prose no-print" aria-labelledby="lsn-${l.id}"><h2 id="lsn-${l.id}">${esc(u.theLesson)}</h2>
${paras}</article>
<div class="panel"><h2>${esc(u.remember)}</h2><ul class="keypoints">${lf(l, 'keypoints', lang).map((k) => `<li>${esc(k)}</li>`).join('')}</ul><p class="no-print"><button type="button" class="btn btn-soft" data-print>${esc(u.printSheet)}</button></p></div>
<div class="panel quiz-panel"><h2>${esc(u.checkYourself)}</h2><p class="muted">${esc(fmt(u.checkLead, { need: 4, of: l.quiz.length }))}</p>
${quiz({ lang, kind: 'fs', id: l.id, items: l.quiz, need: 4, next: nextHref, nextLabel: next ? u.next : u.toCert })}</div>
<details class="panel sources"><summary>${esc(u.sources)}</summary><ul>${facts}</ul></details>
<nav class="pager">${prev ? `<a class="btn btn-soft" href="${lessonHref(rel, prev)}">${esc(u.prev)}</a>` : '<span></span>'}<a class="btn btn-soft" href="${nextHref}">${esc(next ? u.next : u.toCert)}</a></nav>
</div></div></div>`;
    const jsonld = { '@context': 'https://schema.org', '@type': 'LearningResource', name: lf(l, 'title', lang), inLanguage: lang, educationalLevel: 'Beginner', learningResourceType: 'Lesson', isAccessibleForFree: true, isPartOf: { '@type': 'Course', name: lang === 'es' ? course.title_es : course.title_en }, ...(m ? { video: { '@type': 'VideoObject', name: lf(l, 'title', lang), thumbnailUrl: SITE + m.poster.replace(/^(\.\.\/)+/, ''), contentUrl: SITE + m.mp4.replace(/^(\.\.\/)+/, ''), duration: `PT${Math.round(m.dur)}S`, uploadDate: m.date } } : {}) };
    page({ lang, rel, title: `${fmt(u.lessonN, { n: i + 1 })}: ${lf(l, 'title', lang)} · SDX Inspect`, desc: lf(l, 'objectives', lang).join(' '), body, current: 'food', jsonld });
  });

  // certificate
  {
    const rel = 'food-safety/certificate/';
    const list = LESSONS.map((l, i) => `<li data-cert-lesson="${l.id}"><span>${i + 1}. ${esc(lf(l, 'title', lang))}</span><span>${esc(u.i18n.notyet)}</span></li>`).join('');
    const body = `<div class="wrap read"><p class="crumbs"><a href="${linkTo(lang, rel, '')}">${esc(u.learn)}</a> › <a href="${linkTo(lang, rel, 'food-safety/')}">${esc(u.food)}</a> › ${esc(u.certTitle)}</p>
<div class="lesson-head"><h1>${esc(u.certTitle)}</h1><p class="muted">${esc(u.certLead)}</p></div>
<div class="stack cert-wrap" style="padding:18px 0 56px">
<div class="panel"><ul class="cert-list">${list}</ul><p class="cert-locked muted">${esc(u.certLocked)}</p>
<form class="cert-form" hidden><div class="field"><label for="cert-name"><b>${esc(u.certName)}</b></label><input id="cert-name" name="name" autocomplete="name" maxlength="60" required></div><p style="margin-top:12px"><button class="btn btn-primary" type="submit">${esc(u.certMake)}</button></p></form></div>
<div class="certificate" role="img" aria-label="${esc(u.certHead)}">${mark(64)}<p class="eyebrow" style="margin-top:14px">SDX Inspect</p><h2>${esc(u.certHead)}</h2><p class="name"></p><p>${esc(u.certBody)}</p><p style="font-weight:700;margin-top:6px">${esc(u.certCourse)}</p><p class="small">${esc(u.certDate)}: <span data-cert-date></span> · ${esc(u.certId)}: <span data-cert-id></span></p><p class="small">${esc(u.certFine)}</p></div>
<p><button class="btn btn-primary cert-print" type="button" hidden>${esc(u.certPrint)}</button></p>
<div class="panel code-box"><h2>${esc(u.codeTitle)}</h2><p class="muted">${esc(u.codeLead)}</p><div class="code-row"><span class="code"></span><button class="btn btn-soft" type="button" data-copy>${esc(u.copy)}</button></div>
<form class="code-row"><div class="field"><label for="code-in">${esc(u.codeEnter)}</label><input id="code-in" autocomplete="off" spellcheck="false"></div><button class="btn btn-soft" type="submit">${esc(u.codeUse)}</button></form><p class="code-msg muted" aria-live="polite"></p></div>
</div></div>`;
    page({ lang, rel, title: `${u.certTitle} · SDX Inspect`, desc: u.certLead, body, current: 'food' });
  }

  // app guide
  if (guide) {
    const rel = 'app-guide/';
    const cards = ROLES.map((r) => `<li><a class="card lesson-link" href="${linkTo(lang, rel, `app-guide/${r.id}/`)}" data-role="${r.id}"><span class="lesson-num" aria-hidden="true">${esc(r.icon || '•')}</span><span><h3>${esc(L(r.title, lang))}</h3><span class="muted">${esc(L(r.who, lang))}</span></span><span class="state">${esc(u.i18n.notyet)}</span></a></li>`).join('\n');
    const body = `<div class="wrap read"><p class="crumbs"><a href="${linkTo(lang, rel, '')}">${esc(u.learn)}</a> › ${esc(u.app)}</p>
<div class="lesson-head"><h1>${esc(u.guideTitle)}</h1><p class="muted">${esc(u.guideLead)}</p><div class="progress" data-progress="ag" style="max-width:420px"><i></i></div><p class="muted" data-count="ag">${esc(fmt(u.i18n.countRoles, { n: 0, of: ROLES.length }))}</p></div>
<ol class="lessons">${cards}</ol>
<div class="card demo-box" style="margin:28px 0 56px"><div><h3>${esc(u.demoBox)}</h3><p class="muted">${esc(u.demoNote)}</p></div><div>${esc(u.demoBadge)}: <b>448800</b></div><a class="btn btn-primary" href="${demoHref(lang, rel)}">${esc(u.openDemo)}</a></div></div>`;
    page({ lang, rel, title: `${u.guideTitle} · SDX Inspect`, desc: u.guideLead, body, current: 'app' });

    ROLES.forEach((r, i) => {
      const rr = `app-guide/${r.id}/`;
      const m = mediaFor('role-' + r.id, lang);
      const steps = r.steps.map((s) => `<li class="step"><div class="card"><h3>${esc(L(s.title, lang))}</h3><ul>${(L(s.do, lang) || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>${s.ui?.length ? `<div class="ui" aria-label="${lang === 'es' ? 'Botones en la app' : 'Buttons in the app'}">${s.ui.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}${s.tip && L(s.tip, lang) ? `<p class="tip">${esc(L(s.tip, lang))}</p>` : ''}${s.try?.href ? `<p><a class="btn btn-soft" href="${demoHref(lang, rr, s.try.href)}">${esc(u.tryIt)}</a>${s.try.note && L(s.try.note, lang) ? ` <span class="muted">${esc(L(s.try.note, lang))}</span>` : ''}</p>` : ''}</div></li>`).join('\n');
      const nextR = ROLES[i + 1];
      const player = m ? `<aside class="player"><video controls playsinline preload="metadata" poster="${esc(m.poster)}"><source src="${esc(m.mp4)}" type="video/mp4"><track kind="captions" srclang="${lang}" label="${lang === 'es' ? 'Español' : 'English'}" src="${esc(m.vtt)}" default></video><ol class="chapters">${(m.chapters || []).map(([t, name]) => `<li><button type="button" data-t="${t}"><span class="t">${fmtT(t)}</span><span>${esc(name)}</span></button></li>`).join('')}</ol></aside>` : '';
      const body = `<div class="wrap read"><p class="crumbs"><a href="${linkTo(lang, rr, '')}">${esc(u.learn)}</a> › <a href="${linkTo(lang, rr, 'app-guide/')}">${esc(u.app)}</a> › ${esc(L(r.title, lang))}</p>
<div class="lesson-head"><p class="eyebrow">${esc(u.appCard)}</p><h1>${esc(L(r.title, lang))}</h1><p class="muted">${esc(L(r.intro, lang))}</p></div>
<div class="lesson-grid${m ? ' has-video' : ''}">${player}<div class="stack">
<div class="card demo-box"><div><h3>${esc(u.demoBox)}</h3><p class="muted">${esc(u.demoNote)}</p></div>${r.id === 'inspector' || r.id === 'admin' ? `<div>${esc(u.demoBadge)}: <b>448800</b></div>` : ''}<a class="btn btn-primary" href="${demoHref(lang, rr, r.demo)}">${esc(u.openDemo)}</a></div>
<h2>${esc(u.stepsTitle)}</h2>
<ol class="steps">${steps}</ol>
<div class="panel quiz-panel"><h2>${esc(u.checkRole)}</h2><p class="muted">${esc(u.checkRoleLead)}</p>${quiz({ lang, kind: 'ag', id: r.id, items: r.check, need: 2, next: nextR ? linkTo(lang, rr, `app-guide/${nextR.id}/`) : linkTo(lang, rr, 'app-guide/'), nextLabel: nextR ? u.nextRole : u.app })}</div>
<nav class="pager"><a class="btn btn-soft" href="${linkTo(lang, rr, 'app-guide/')}">← ${esc(u.app)}</a>${nextR ? `<a class="btn btn-soft" href="${linkTo(lang, rr, `app-guide/${nextR.id}/`)}">${esc(u.nextRole)}</a>` : ''}</nav>
</div></div></div>`;
      page({ lang, rel: rr, title: `${L(r.title, lang)} · ${u.guideTitle}`, desc: L(r.intro, lang), body, current: 'app' });
    });
  }

  // about
  {
    const rel = 'about/';
    const body = `<div class="wrap read" style="padding-bottom:56px"><p class="crumbs"><a href="${linkTo(lang, rel, '')}">${esc(u.learn)}</a> › ${esc(u.about)}</p>
<div class="lesson-head"><h1>${esc(u.aboutTitle)}</h1></div>
<div class="prose">${u.aboutBody.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
<div class="panel code-box" style="margin-top:28px;max-width:760px"><h2>${esc(u.codeTitle)}</h2><p class="muted">${esc(u.codeLead)}</p><div class="code-row"><span class="code"></span><button class="btn btn-soft" type="button" data-copy>${esc(u.copy)}</button></div>
<form class="code-row"><div class="field"><label for="code-in">${esc(u.codeEnter)}</label><input id="code-in" autocomplete="off" spellcheck="false"></div><button class="btn btn-soft" type="submit">${esc(u.codeUse)}</button></form><p class="code-msg muted" aria-live="polite"></p></div></div>`;
    page({ lang, rel, title: `${u.aboutTitle} · SDX Inspect`, desc: u.aboutBody[0], body, current: 'about' });
  }
}

// ── the Learn band on the marketing page (between markers)
{
  const f = path.join(ROOT, 'public/marketing/index.html');
  let html = fs.readFileSync(f, 'utf8');
  const band = `<!--learn:start-->
<section id="learn" class="learn-band">
  <div class="wrap">
    <p class="xp-eyebrow">Learn · Aprenda</p>
    <h2>Study food safety. Learn the app.</h2>
    <p class="lead">Free lessons with Inspector Dex for stand teams, crews and inspectors — in English and Spanish, with a short check after each one.</p>
    <div class="learn-cards">
      <a class="learn-card" href="learn/food-safety/"><span class="learn-ico" aria-hidden="true">🧤</span><b>Food safety course</b><span>${LESSONS.length} lessons · certificate of completion</span></a>
      ${guide ? `<a class="learn-card" href="learn/app-guide/"><span class="learn-ico" aria-hidden="true">📱</span><b>How to use SDX Inspect</b><span>${ROLES.length} guides by job · try it on the live demo</span></a>` : ''}
      <a class="learn-card" href="learn/es/"><span class="learn-ico" aria-hidden="true">🌎</span><b>En español</b><span>Todas las lecciones y guías</span></a>
    </div>
    <ol class="learn-strip">${LESSONS.map((l, i) => `<li><a href="learn/food-safety/${l.id}/"><span>${i + 1}</span>${esc(l.title_en)}</a></li>`).join('')}</ol>
    <p class="learn-go"><a class="cta" href="learn/">Open Learn</a></p>
  </div>
</section>
<!--learn:end-->`;
  if (/<!--learn:start-->[\s\S]*?<!--learn:end-->/.test(html)) html = html.replace(/<!--learn:start-->[\s\S]*?<!--learn:end-->/, band);
  else html = html.replace(/(<\/section>\s*\n)(\s*<section>\s*\n\s*<div class="wrap">\s*\n\s*<h2>Everything your kitchen team needs)/, `$1\n${band}\n\n$2`);
  if (!html.includes('<!--learn:start-->')) throw new Error('could not place the Learn band on the marketing page');
  fs.writeFileSync(f, html);
}

// sitemap for the Learn pages
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${written.map((w) => `  <url><loc>${SITE}${w.replace(/index\.html$/, '')}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`learn: ${written.length} pages (${LANGS.join(' + ')}), css ${CSS}, js ${JS}${guide ? `, ${ROLES.length} role guides` : ', no guide.json yet'}${Object.keys(media).length ? `, media for ${Object.keys(media).length}` : ', no videos yet'}`);
