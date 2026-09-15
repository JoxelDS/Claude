# SDX Inspect — brief + prompt for the explanatory video

Everything you need to paste into a video tool (Higgsfield, Runway, Pika, Sora, an editor, or a video agency): a plain-words summary of the system, the master prompt, the screenshots to attach (in `docs/training/screens/`), and short variants.

---

## A. What SDX Inspect is (paste this as the "context")

SDX Inspect is the kitchen and concession-stand inspection system used by Sodexo Live! at Hard Rock Stadium (Miami). It is a web app that runs on any phone, iPad or desktop — nothing to install, one link, works in English and Spanish.

**Who uses it**
- **The inspector** (food safety / quality) walks the stadium on game day and inspects every stand and kitchen from the phone: temps, equipment, facilities, cleaning, operations. Photos and notes go in as he walks.
- **Stand supervisors and their teams** scan the **QR poster** taped inside their concession door. From that poster they log cooler and freezer temperatures, and report any problem with a photo — no login, no app store.
- **Crews** — **Maintenance**, **Cleaning** and **Ecolab (chemicals / sanitation)** — each get their own board. Every problem reported anywhere lands on the right board with the Before photo. They tap *In process*, fix it, add the *After photo* and mark it *Fixed* with a note.
- **Admin** (the inspector as manager) sees the performance dashboard, the inspection schedule, users and invite links, the stand list and licenses.

**The loop the video must show**
1. Walk → the inspector opens a stand and checks it on the phone.
2. Find → a problem (a leaking hand sink) gets a photo and one tap: *Issue*.
3. Board → the report lands on the maintenance board instantly, with the Before photo.
4. Fix → the tech taps *In process*, fixes it, adds the After photo, marks *Fixed* with a note.
5. Stand team → the supervisor scans the QR poster, logs cooler temps, reports a freezer problem with a photo.
6. Announce → the inspector sends one message to every stand ("health inspector on site today").
7. Verify → on the next visit the inspector sees the open problem, marks it verified — Before and After on the record.

**Facts that matter**
- One QR poster per stand (not per cooler). Scanning shows the stand's live equipment list.
- Everything is uppercase: stand names, units, brands. Stand type badges: Concession, Subcontractor, Portable, Kitchen. Flags: NO LICENSE / REQUESTED.
- Problem reports are guided (which unit, what's wrong, which part, where) so crews get specifics, not "something is broken".
- Out-of-range temps need a reason and an action.
- Announcements reach every targeted stand the next time they scan.
- Language switch on every screen; the portal is native EN/ES.
- Three form factors: phone (in the field), iPad (walk-around and kitchen), desktop (office, dashboard, printing posters).

---

## B. Master prompt (paste as the request)

> **I want an explanatory video about SDX Inspect, the inspection system we use at Sodexo Live! · Hard Rock Stadium.**
>
> **Goal:** teach new staff (inspectors, stand supervisors, maintenance / cleaning / Ecolab crews) how the system works end to end, in 2–3 minutes, so they understand it before their first game day. It must be educational first, but modern, simple and beautiful.
>
> **Style:** clean product-explainer. Flat, bright UI motion on soft navy / white backgrounds. Real app screens (attached) inside phone, iPad and desktop mock-ups that slide, scale and tilt gently. Animated arrows and dotted paths that show where a report travels (phone → board → crew → back to the inspector). Kinetic captions, one line at a time, big and readable. Smooth easing, no shaky camera, no stock-footage hype, no fast cuts. Calm, confident pace. Subtle sound design and a light modern music bed; optional calm narration (script below).
>
> **Brand:** use the Sodexo logo (attached). Palette: navy `#0F1F3D`, red `#E00000`, white, light blue `#9FC0FF`, gold accent `#FFD166`. Font: Montserrat. Keep stand names uppercase exactly as in the screenshots.
>
> **Use the attached screenshots as the exact UI. Do not invent screens.** Each screenshot is named by scene (see the index). Show the same screens on phone, iPad and desktop where the file names say `ipad-` / `desktop-` — the app is one product on three sizes.
>
> **Scenes (in order):**
> 1. **Title** — "A game day with SDX Inspect". Logo, tagline "Inspection, done together."
> 2. **The system in one picture** — three users around one stand: inspector, stand team, crews. Animated diagram: phone → board → crew → verified.
> 3. **The inspector's walk** — login, "on site" lock, the inspection form with the stand filled (MAGIC CITY DOGS #114). Steps: Temps, Facilities, Maintenance, Equipment, Utensils, Operations.
> 4. **Log temps** — cooler at 38 °F turns green. Text: "Every stand. Every cooler. On the phone."
> 5. **Find a problem** — hand sink leaking: tap *Issue*, add the photo, type the note. Text: "See it, photo it, send it."
> 6. **The QR poster** — the poster on the inside of the stand door (screenshot of the poster). Text: "One QR per stand."
> 7. **The stand team scans** — portal: pick language, identify (name + phone), "This is my location", temp log with the stand's coolers. Text: "Stands scan the poster to log temps."
> 8. **Report from the stand** — "Report a problem only": category chips (Cleaning / Maintenance / Ecolab / Equipment / Plumbing / Pest / Temperature / Other), then the guided chips (what, what's wrong, where), photo, submit, "Submitted!" Text: "Any problem? Report it from the same poster."
> 9. **The maintenance board** — the report appears with the Before photo. "By stand" and "By problem" views. Text: "It lands on the maintenance board."
> 10. **The fix** — *In process* → After photo → *Fixed* with the note "Replaced the cartridge, tested — no leak." → "Sent to the inspector". Text: "In process. Fixed. After photo."
> 11. **Other crews** — cleaning board, Ecolab board; "Not mine → move" sends a card to the right crew.
> 12. **Announce** — "Announce to stands" modal → every stand. Text: "One message to every stand."
> 13. **Verify** — the inspector opens the stand again, the open-problems panel shows Fixed / After photo; he confirms. Text: "Verified, with proof."
> 14. **Manage** — desktop: stands & equipment, posters & licenses, history, admin dashboard (performance, schedule). Text: "Everything on record."
> 15. **Three devices** — phone, iPad and desktop side by side showing the same board. Text: "Any phone. Any iPad. Any desktop."
> 16. **Close** — logo, "SDX Inspect · Inspection, done together · Inspección, en equipo."
>
> **On-screen text (EN / ES), one line per scene, bottom-left, small and clean:**
> 1. Game day starts with a walk. / El día de juego empieza con un recorrido.
> 2. Three teams, one system. / Tres equipos, un sistema.
> 3. Every stand. Every cooler. On the phone. / Cada puesto. Cada nevera. En el teléfono.
> 4. See it, photo it, send it. / Míralo, fotografíalo, envíalo.
> 5. One QR per stand. / Un QR por puesto.
> 6. Stands scan the poster to log temps. / Los puestos escanean el cartel para registrar temperaturas.
> 7. Any problem? Report it from the same poster. / ¿Un problema? Repórtalo desde el mismo cartel.
> 8. It lands on the maintenance board. / Llega al tablero de mantenimiento.
> 9. In process. Fixed. After photo. / En proceso. Arreglado. Foto de después.
> 10. Not yours? Move it to the right crew. / ¿No es tuyo? Pásalo al equipo correcto.
> 11. One message to every stand. / Un mensaje a todos los puestos.
> 12. Verified, with proof. / Verificado, con prueba.
> 13. Everything on record. / Todo queda registrado.
> 14. Any phone. Any iPad. Any desktop. / Cualquier teléfono, iPad o computadora.
> 15. SDX Inspect. Inspection, done together. / Inspección, en equipo.
>
> **Optional narration (calm, plain, male voice, English; Spanish captions):**
> "Every game day at Hard Rock Stadium starts with a walk. The inspector opens SDX Inspect and goes stand by stand. Behind each concession door there are coolers and freezers — each one gets checked, and the temperature goes straight into the phone. When something is wrong, one photo and one tap is all it takes. That report lands on the maintenance board right away, with the photo. The tech taps In process, fixes it, adds the after photo and marks it fixed with a note. Stand teams have their own way in: the QR poster on the inside of the door. Scan it, log the temps. If they see a problem, they report it from the same poster — it reaches the inspector and the right crew. Cleaning and Ecolab have their own boards, and anything sent to the wrong crew moves with one tap. When the inspector needs everyone to know something, one announcement reaches every stand. Later, the inspector checks the fix and verifies it. Before and after, on the record. Phone, iPad or desktop — it is the same system. SDX Inspect. Inspection, done together."
>
> **Rules:** no faces in close-up, no logos other than Sodexo, no food product shots, no dramatic lighting, no text that is not in this brief, keep every UI pixel-accurate to the screenshots. Deliver 16:9 1080p, plus a 9:16 cut of scenes 4–10 for phones.

---

## C. Screenshot index (attach these, in this order)

All files live in `docs/training/screens/`. Phone shots are 390×844 at 2×; `ipad-` are 820×1180 at 2×; `desktop-` are 1366×860 at 1.5×. `_all.png` is a contact sheet of everything.

| File | What it shows | Scene |
|---|---|---|
| `01-login.png` | Badge sign-in | 3 |
| `02-on-site-lock.png` | "Inspection locked" — tap to confirm you are on site (starts the timer) | 3 |
| `03-inspection-form-top.png` | Inspection form, empty, with the quick reference and "Scan stand QR" | 3 |
| `04-form-stand-filled.png` | Form with the stand filled: MAGIC CITY DOGS #114, license auto-filled | 3 |
| `05-form-temps-step.png` | Inspector guide · Temps step, cooler temp entered | 4 |
| `06-form-equipment-step.png` | Inspector guide · Equipment step | 4 |
| `07-form-hand-sink-issue-photo.png` | Facilities · Hand sink marked Issue, note + Before photo | 5 |
| `08-form-open-problems-followup.png` | Open problems at this stand — Fixed / In progress / After photo (verify) | 13 |
| `09-stands-posters-licenses.png` | Stands & equipment — Equipment & verify walk tab | 14 |
| `10-stand-focus-qr.png` | One stand opened: its QR poster, coolers / freezers, add / print | 6 |
| `11-stand-qr-poster.png` | The printed stand QR poster (goes inside the concession door) | 6 |
| `12-all-posters-licenses.png` | Posters & licenses tab — all posters, license health, add a stand | 14 |
| `13-equipment-verify-walk.png` | Equipment & verify walk (same tab, scrolled) | 14 |
| `14-announce-to-stands.png` | Announce to stands modal — message, duration, who gets it | 12 |
| `15-history.png` | History — reports & analytics | 14 |
| `16-crew-overview.png` | Crew boards seen from the inspector side | 9 |
| `17-admin.png` | Admin panel — performance dashboard, inspection schedule, event days | 14 |
| `18-portal-language.png` | Portal after scanning the QR: English / Español | 7 |
| `19-portal-identify.png` | Portal: name + phone | 7 |
| `20-portal-this-is-my-location.png` | Portal: confirm location · "This is my location" / "Report a problem only" | 7 |
| `21-portal-temp-log.png` | Portal temp log: the stand's coolers & freezers, how-to steps | 7 |
| `22-portal-temps-entered.png` | Portal temp log with temps entered (green = good, red = out of range) | 7 |
| `23-portal-report-problem.png` | Portal "Report a problem": category chips | 8 |
| `24-portal-report-filled.png` | Portal report with guided chips (what / what's wrong / where), text and photo | 8 |
| `25-portal-report-sent.png` | Portal "Submitted!" — routed to Maintenance, chat with inspector | 8 |
| `26-maintenance-board.png` | Maintenance board — To do / Reports, all stands | 9 |
| `27-maintenance-card-before-photo.png` | A card with the Before photo, In process / Waiting / Fixed / After photo | 9 |
| `28-maintenance-card-in-process.png` | Card marked In process (sent to the inspector) | 10 |
| `29-maintenance-card-after-photo-fixed.png` | After photo added, Fixed, "What did you do?" note | 10 |
| `30-maintenance-card-done.png` | Card done — "Sent to the inspector" | 10 |
| `31-maintenance-by-problem.png` | Board grouped By Problem | 9 |
| `32-not-mine-move.png` | "Not mine → move" — send the card to Cleaning / Ecolab / Pest / Other | 11 |
| `33-cleaning-board.png` | Cleaning board | 11 |
| `34-ecolab-board.png` | Ecolab board | 11 |
| `35-ipad-inspection-form.png` | iPad · inspection form | 15 |
| `36-ipad-stands-equipment.png` | iPad · stands & equipment | 15 |
| `37-ipad-posters-licenses.png` | iPad · posters & licenses with QR posters | 15 |
| `38-ipad-history.png` | iPad · history | 15 |
| `39-ipad-crew-overview.png` | iPad · crew board | 15 |
| `40-ipad-admin-dashboard.png` | iPad · admin dashboard | 15 |
| `41-ipad-maintenance-board.png` | iPad · maintenance board | 15 |
| `42-ipad-portal-temp-log.png` | iPad · stand portal temp log | 15 |
| `43-desktop-inspection-form.png` | Desktop · inspection form with report output panel | 14/15 |
| `44-desktop-stands-equipment.png` | Desktop · stands & equipment | 14/15 |
| `45-desktop-posters-licenses.png` | Desktop · posters & licenses (print posters from here) | 14/15 |
| `46-desktop-history.png` | Desktop · history & analytics | 14/15 |
| `47-desktop-crew-overview.png` | Desktop · crew board | 14/15 |
| `48-desktop-admin-dashboard.png` | Desktop · admin dashboard | 14/15 |
| `49-desktop-maintenance-board.png` | Desktop · maintenance board | 15 |
| `50-desktop-portal-temp-log.png` | Desktop · stand portal | 15 |

---

## D. Short variants

**30-second version (scenes 3, 5, 9, 10, 7, 12, 16):** "A 30-second modern explainer for SDX Inspect: inspector finds a leak on the phone → it lands on the maintenance board with the photo → In process, After photo, Fixed → the stand team scans the QR poster and logs temps → verified. Phone mock-ups slide in over a soft navy background, kinetic captions EN/ES, Sodexo logo at start and end, no narration, light modern music. Use the attached screenshots exactly."

**One-line prompt for an image/video generator (background plates only):** "Clean modern explainer background, soft navy-to-white gradient, subtle grid, floating phone / iPad / desktop mock-ups with blank screens, gentle depth, no text, no people, 16:9."

**Prompt for a still key visual:** "Three devices (phone, iPad, laptop) angled on a soft navy background showing the same inspection board; a stadium concourse blurred far behind; Sodexo logo top-left; clean, bright, modern, no extra text."
