# SDX Inspect — every feature, by department (EN / ES)

The training handbook. One section per department, every feature with where it lives in the app, English and Spanish side by side. Print the section for the people you are training, and the quick-reference card at the end for their door.

Screens referenced as `NN-name.png` are in `docs/training/screens/`. The crews' step-by-step video script is `crew-training-script.md`; the sales scripts are `sales-video-scripts.md`.

---

## 1. The system in one page

| | English | Español |
|---|---|---|
| What it is | SDX Inspect is the kitchen and concession-stand inspection system. It runs on any phone, iPad or desktop from one link. Nothing to install. | SDX Inspect es el sistema de inspección de cocinas y puestos de concesión. Corre en cualquier teléfono, iPad o computadora desde un enlace. No se instala nada. |
| Who uses it | The inspector, the stand supervisors and their teams, the Maintenance / Cleaning / Ecolab crews, and the admin. | El inspector, los supervisores de puesto y sus equipos, las cuadrillas de Mantenimiento / Limpieza / Ecolab, y el administrador. |
| The loop | Walk → find a problem with a photo → it lands on the right crew's board → In process → Fixed with an after photo → the inspector verifies. Stand teams scan their poster to log temps and report problems into the same loop. | Recorrido → problema con foto → llega al tablero de la cuadrilla correcta → En proceso → Arreglado con foto de después → el inspector verifica. Los puestos escanean su cartel para registrar temperaturas y reportar problemas en el mismo circuito. |
| Devices | Phone in the field, iPad on the walk and in the kitchen, desktop in the office for dashboards and printing. Same app, same data. | Teléfono en campo, iPad en el recorrido y la cocina, computadora en la oficina para tableros e impresión. Misma aplicación, mismos datos. |
| Language | 🌐 button on every screen (Google Translate, 18 languages). The stand portal and the crew boards have native English / Spanish (crews also Kreyòl). | Botón 🌐 en cada pantalla (Google Translate, 18 idiomas). El portal de puestos y los tableros de cuadrilla tienen inglés / español nativo (cuadrillas también kreyòl). |
| Updates | When a new version is ready a bar appears at the bottom: finish and save what you are doing, then Reload. If you skip it, close and reopen the app twice. | Cuando hay versión nueva aparece una barra abajo: termina y guarda lo que estás haciendo, luego Reload. Si la saltas, cierra y abre la aplicación dos veces. |

**Rules that apply to everyone / Reglas para todos**

| English | Español |
|---|---|
| One QR poster per stand, taped inside the door. Scanning shows the stand's live cooler list. | Un cartel QR por puesto, pegado dentro de la puerta. Al escanear se ve la lista de neveras del puesto. |
| Every problem needs a photo and a corrective action. No photo, no send. | Cada problema necesita foto y acción correctiva. Sin foto no se envía. |
| An out-of-range temperature needs a reason and what you did about it. | Una temperatura fuera de rango necesita una razón y qué hiciste. |
| Names, units, brands and licenses are stored in UPPER CASE. Every stand shows its type badge: CONCESSION, SUBCONTRACTOR, PORTABLE, KITCHEN. | Nombres, unidades, marcas y licencias se guardan en MAYÚSCULAS. Cada puesto muestra su tipo: CONCESSION, SUBCONTRACTOR, PORTABLE, KITCHEN. |
| A stand with no license shows NO LICENSE or REQUESTED. | Un puesto sin licencia muestra NO LICENSE o REQUESTED. |
| Write problems in your own words. The app reads English and Spanish and picks the category, the unit and the urgency. You can correct it with one tap. | Escribe los problemas con tus palabras. La aplicación lee inglés y español y elige la categoría, el equipo y la urgencia. Lo corriges con un toque. |

---

## 2. Inspector

### 2.1 Getting in and starting an inspection

| Where | English | Español |
|---|---|---|
| Login `01-login.png` | Badge number → sign in. Tap **on site** to unlock the day (`02-on-site-lock.png`). | Número de gafete → entrar. Toca **on site** para abrir el día. |
| Form header 📷 Scan stand QR | Scan the stand's poster: name, unit, floor, type, license, phone and supervisor fill in. Typing a name never prefills — only the scan or a tap on "Your Assigned Locations" does. | Escanea el cartel del puesto: nombre, unidad, piso, tipo, licencia, teléfono y supervisor se llenan solos. Escribir un nombre nunca rellena — solo el escaneo o un toque en "Your Assigned Locations". |
| Form steps `05-form-temps-step.png`, `06-form-equipment-step.png` | Temps → Facilities → Maintenance → Equipment → Utensils → Operations. Each item is YES / NO. The Equipment step lists the stand's coolers and freezers with their temperature. | Temps → Facilities → Maintenance → Equipment → Utensils → Operations. Cada punto es SÍ / NO. El paso Equipment lista las neveras y congeladores del puesto con su temperatura. |
| A NO item `07-form-hand-sink-issue-photo.png` | 🔴 BEFORE photo (required) and 🟢 AFTER photo (optional), SPECIFIC LOCATION, description (4+ words), CORRECTIVE ACTION (required). Camera or gallery in one tap. | Foto 🔴 BEFORE (obligatoria) y 🟢 AFTER (opcional), UBICACIÓN ESPECÍFICA, descripción (4+ palabras), ACCIÓN CORRECTIVA (obligatoria). Cámara o galería con un toque. |
| Temps out of range | Red reading → reason + action required. Each out-of-range unit becomes its own follow-up, named with the unit, brand, location and tag. | Lectura roja → razón + acción obligatorias. Cada equipo fuera de rango se vuelve su propio seguimiento, con nombre, marca, ubicación y etiqueta. |
| Notes | 🧠 "Understood from your notes": every sentence that describes a problem becomes an issue (category, area, corrective). ✕ Not an issue removes it. | 🧠 "Entendido de tus notas": cada frase que describe un problema se vuelve un asunto (categoría, área, acción). ✕ lo quita. |
| Draft | Autosaves 4 s after you stop typing, on the phone and in the cloud. Reopen the app → "Restore draft". | Se guarda solo 4 s después de dejar de escribir, en el teléfono y en la nube. Vuelve a abrir → "Restore draft". |
| Food Safety Quick Reference | Sticky card on the form: danger zone, cook temps, calibration, sanitizers, cutting boards, shelf order, FIFO, labels, thawing. | Tarjeta fija en el formulario: zona de peligro, temperaturas de cocción, calibración, sanitizantes, tablas, orden de estantes, FIFO, etiquetas, descongelado. |
| Save | Red **Save Report** in the header. Pre-submit check: every flagged item needs its BEFORE photo and action — no "continue anyway". | **Save Report** rojo en el encabezado. Revisión previa: cada punto marcado necesita su foto BEFORE y acción — no hay "continuar de todos modos". |
| Open problems `08-form-open-problems-followup.png` | Opening a stand shows its open problems from earlier visits with Before / After. Confirm fixed or keep open. | Al abrir un puesto se ven sus problemas abiertos de visitas anteriores con Antes / Después. Confirma arreglado o déjalo abierto. |
| Quick report (Follow-ups → ＋) | Report a problem without a full inspection: unit or name (the stand type is detected), description, optional chips, photo, action. | Reporta un problema sin inspección completa: unidad o nombre (el tipo se detecta), descripción, chips opcionales, foto, acción. |

### 2.2 Past Reports (History) `15-history.png`, `46-desktop-history.png`

| English | Español |
|---|---|
| Every report, newest first. Depth bar: "Showing 50 of 140 · ⬇ Load all". Search all reaches the server. Type filter includes Quick Report and Supervisor Log. | Cada reporte, el más nuevo primero. Barra: "Showing 50 of 140 · ⬇ Load all". Search all busca en el servidor. El filtro de tipo incluye Quick Report y Supervisor Log. |
| Tap a card header to expand: every item, notes under each issue (📍 area, description, 🔧 corrective), photos, HACCP temperature logs attached that day. | Toca el encabezado para expandir: cada punto, notas bajo cada asunto (📍 área, descripción, 🔧 acción), fotos, registros HACCP de ese día. |
| 📋 SUPERVISOR LOG cards: a stand team's own log — who, how many temps, out of range, problems, phone. | Tarjetas 📋 SUPERVISOR LOG: el registro propio del puesto — quién, cuántas temperaturas, fuera de rango, problemas, teléfono. |
| If reports fail to load you see "⚠️ Could not load — nothing was lost" with Try again; the local copy stays on screen. | Si no cargan ves "⚠️ Could not load — nothing was lost" con Try again; la copia local sigue en pantalla. |
| Exports per report: PDF, bulk PDF, Excel. | Exportar por reporte: PDF, PDF masivo, Excel. |

### 2.3 Analytics → Follow-ups

| Feature | English | Español |
|---|---|---|
| The list | Every open problem across all stands, one card each: stand, unit, type badge, category, detail, days open, Before / After thumbs, 🧊 unit chip for temperature items. | Cada problema abierto de todos los puestos, una tarjeta: puesto, unidad, tipo, categoría, detalle, días abierto, fotos Antes / Después, chip 🧊 para temperaturas. |
| Grouping | 📍 By Stand · 🏷 By Type · 🏢 By Floor · 📅 By Date. Pills 🏷 Type ▾ and 🏢 Floor ▾ narrow any grouping. | 📍 Por puesto · 🏷 Por tipo · 🏢 Por piso · 📅 Por fecha. Los filtros Type ▾ y Floor ▾ acotan cualquier agrupación. |
| 🔔 Remind | Tap Remind on several cards → one basket → Send = one Quick Check announcement naming each problem with its detail. Per stand: Remind Team. | Toca Remind en varias tarjetas → una canasta → Send = un solo aviso Quick Check con cada problema y su detalle. Por puesto: Remind Team. |
| ✓ Resolve | Closes the item (↩ Undo for 9 s). Resolve all per group. If a save fails you see a warning and it retries. | Cierra el asunto (↩ Undo por 9 s). Resolve all por grupo. Si falla el guardado ves un aviso y reintenta. |
| ✅ Fixed panel | Chip "N fixed today" → everything the crews closed, grouped by day with who closed it, minutes on the job, clock times. ↩ Put back reopens one (or several in select mode). | Chip "N fixed today" → todo lo que cerraron las cuadrillas, por día, con quién, minutos y horas. ↩ Put back reabre uno (o varios en modo selección). |
| 🧹 Cleaning log | Cleaning jobs by day: flagged · started · solved · minutes; whose problem (CONCESSION / SUBCONTRACTOR); billable filter; PDF per stand with license and photos for the subcontractor. | Trabajos de limpieza por día: marcado · iniciado · resuelto · minutos; problema de quién; filtro facturable; PDF por puesto con licencia y fotos para el subcontratista. |
| Select to export | Tick open, fixed or cleaning rows → Excel (23 columns incl. fixed by, solved time, whose problem) · PDF · Word · 📸 Before & After (Excel with the photos embedded in the cells). | Marca filas abiertas, arregladas o de limpieza → Excel (23 columnas) · PDF · Word · 📸 Before & After (Excel con las fotos dentro de las celdas). |
| Alerts | 🔔 bell: "✅ Fixed — STAND #unit · category · by NAME" when a crew closes something; a Supervisor Log notification when a stand files one. | 🔔 campana: "✅ Fixed — PUESTO #unidad · categoría · por NOMBRE" cuando una cuadrilla cierra; aviso de Supervisor Log cuando un puesto registra. |

### 2.4 Analytics → Temps (HACCP tracker)

| English | Español |
|---|---|
| One list: every stand with a poster, the people at that stand underneath. Per stand: ✓ Logged HH:MM / ⏰ Missed / never logged, 👷 on-shift pill, 🕵 inspected pill, 📣 Request temps. | Una lista: cada puesto con cartel, y su gente debajo. Por puesto: ✓ Logged HH:MM / ⏰ Missed / nunca, chip 👷 en turno, chip 🕵 inspeccionado, 📣 Request temps. |
| Per person: name, phone, role, 💬 Text (their personal link, already signed in to their stand), ✎ edit, ✕ remove (Removed (N) → Restore). | Por persona: nombre, teléfono, rol, 💬 Text (su enlace personal, ya conectado a su puesto), ✎ editar, ✕ quitar (Removed (N) → Restore). |
| Chips: logged · missed · All · 👤 pending · 🕵 inspected. 📨 Text all missed (N) → a stepper, one person at a time: Open text / WhatsApp / Copy / Next / Done. | Chips: logged · missed · All · 👤 pending · 🕵 inspected. 📨 Text all missed (N) → uno por uno: Open text / WhatsApp / Copy / Next / Done. |
| Insights, Predictive and Timeline tabs read the whole history (inspections, HACCP logs, fixes, put-backs in one feed). | Las pestañas Insights, Predictive y Timeline leen todo el historial (inspecciones, registros HACCP, arreglos, reaperturas en un solo hilo). |

### 2.5 Stands & equipment

| Tab | English | Español |
|---|---|---|
| Posters & licenses `09-stands-posters-licenses.png`, `12-all-posters-licenses.png` | One card per stand (the license sheet IS the stand list): type badge, license or NO LICENSE / REQUESTED, floor, QR. Select All / per-floor pills → Print: posters in unit order with a divider sheet per floor. ＋ Add stand, ✎ edit, hide / restore. | Una tarjeta por puesto (la hoja de licencias ES la lista): tipo, licencia o NO LICENSE / REQUESTED, piso, QR. Select All / por piso → Print: carteles en orden de unidad con una hoja divisoria por piso. ＋ Add stand, ✎ editar, ocultar / restaurar. |
| 👥 People at this stand | Everyone who ever logged there plus the contacts you add (name, phone, role). ✉ Text link (SMS), 💬 WhatsApp, 📋 copy. The message carries their stand link + "log every cooler today". Header 👥 People = directory with search, 📨 Text everyone. | Todos los que registraron ahí más los contactos que agregas (nombre, teléfono, rol). ✉ Text link, 💬 WhatsApp, 📋 copiar. El mensaje lleva su enlace + "registra todas las neveras hoy". 👥 People = directorio con búsqueda, 📨 Text everyone. |
| Equipment & verify walk `13-equipment-verify-walk.png` | Loads from the local copy first ("↻ Updating from the cloud…"). Per stand: every cooler / freezer with tag, brand, location; confirm / fix / remove (↩ Undo) / add; **Mark stand verified**. "✋ changed by NAME · date" when a supervisor edited a unit from the portal. Unassigned equipment bucket with bulk assign. Cutoff date for old reports. | Carga primero de la copia local. Por puesto: cada nevera / congelador con etiqueta, marca, ubicación; confirmar / corregir / quitar (↩ Undo) / agregar; **Marcar puesto verificado**. "✋ cambiado por NOMBRE · fecha" cuando un supervisor editó desde el portal. Equipo sin asignar con asignación masiva. Fecha de corte para reportes viejos. |

### 2.6 Messaging `14-announce-to-stands.png`

| English | Español |
|---|---|
| Announcements: type the message; floors, stand types and stands are pre-ticked from the text ("all stands", "floor 2", "portables") — tap to change. Stands see it the next time they scan. | Anuncios: escribe el mensaje; pisos, tipos y puestos se marcan solos según el texto — toca para cambiar. Los puestos lo ven la próxima vez que escanean. |
| Quick Check: a checklist sent to stands; answers come back per item. Messages / Alerts tabs: assignments, crew updates, supervisor logs. | Quick Check: una lista enviada a los puestos; las respuestas vuelven por punto. Pestañas Messages / Alerts: asignaciones, actualizaciones de cuadrilla, registros de supervisor. |

---

## 3. Stand supervisors and teams (the portal)

| Step | English | Español |
|---|---|---|
| Scan `11-stand-qr-poster.png`, `18-portal-language.png` | Scan the poster inside your door. Pick English / Español. No app, no password. | Escanea el cartel dentro de tu puerta. Elige English / Español. Sin aplicación, sin contraseña. |
| Identify `19-portal-identify.png`, `20-portal-this-is-my-location.png` | Name and phone → "This is my location". If the inspector texted you your link, you arrive already signed in ("not you?" to change). | Nombre y teléfono → "This is my location". Si el inspector te mandó tu enlace, llegas ya conectado ("not you?" para cambiar). |
| Announcements | Anything the inspector sent to your stand shows at the top. | Lo que el inspector mandó a tu puesto aparece arriba. |
| Temps `21-portal-temp-log.png`, `22-portal-temps-entered.png` | Food temperatures (tap the item to reveal the box), then YOUR coolers and freezers underneath. Green = fine. Red = pick a reason and what you did. | Temperaturas de comida (toca el punto para ver la casilla), luego TUS neveras y congeladores debajo. Verde = bien. Rojo = elige una razón y qué hiciste. |
| "Inspector asked" banner | From a text link with `coolers=1` the equipment card is highlighted: "The inspector asked you to log EVERY cooler & freezer today". | Desde el enlace del inspector la tarjeta de equipo se resalta: "El inspector te pidió registrar TODAS las neveras hoy". |
| Food Safety Quick Reference | Collapsed card above the form, open on the Submitted screen. Six tabs, in your language. | Tarjeta plegada sobre el formulario, abierta al terminar. Seis pestañas, en tu idioma. |
| Equipment list | ✎ Edit this unit → Fix name / location · Moved to another stand (search, tap) · Not here anymore. ＋ Add a cooler / freezer that is missing (name, brand, location). Your name and date stay on the change. | ✎ Editar → Corregir nombre / ubicación · Se movió a otro puesto · Ya no está aquí. ＋ Agregar nevera / congelador que falta. Tu nombre y fecha quedan en el cambio. |
| Report a problem `23-portal-report-problem.png` → `25-portal-report-sent.png` | Write what is wrong and where, in your words. The app shows "Understood: Plumbing · Hand sink · urgent" — ✕ any chip that is wrong. ＋ Add details (optional). Photo required. Corrective action. ＋ Add another problem → "Send N Problem Reports". "Report a problem only" skips the temps. | Escribe qué está mal y dónde, con tus palabras. La aplicación muestra "Entendido: Plomería · Fregadero de manos · urgente" — ✕ el chip que esté mal. ＋ Agregar detalles (opcional). Foto obligatoria. Acción correctiva. ＋ Otro problema → "Enviar N reportes". "Solo reportar un problema" salta las temperaturas. |
| "+ Log 50°F · UNIT" | If you typed a temperature in the text ("the 2-door cooler reads 50"), one tap writes it into that cooler's row. | Si escribiste una temperatura en el texto, un toque la pone en la fila de esa nevera. |
| Submitted! | Instant. Your log is saved as the stand's own report (SUPERVISOR LOG) and the inspector is notified. Problems go straight to the crews. | Instantáneo. Tu registro se guarda como reporte propio del puesto y el inspector recibe aviso. Los problemas van directo a las cuadrillas. |

---

## 4. Maintenance crew `26-maintenance-board.png` → `32-not-mine-move.png`

| Step | English | Español |
|---|---|---|
| Getting in | Tap the invite link from the inspector → pick a badge number and your name → Join. That badge signs you in from then on. | Toca el enlace de invitación → elige un número de gafete y tu nombre → Join. Ese gafete te abre desde entonces. |
| Language | English / Español / Kreyòl pills above the tabs; 🌐 + for others. The problem text translates too. | Botones English / Español / Kreyòl sobre las pestañas; 🌐 + para otros. El texto del problema también se traduce. |
| Your board | To do (problems for you) · Reports (the inspection behind each). Top: ⏰ overdue · 📋 open · ✅ fixed today. Search by unit, stand or problem; pick one stand. 📍 By Stand / 🗂 By Problem. | To do (problemas para ti) · Reports (la inspección detrás). Arriba: ⏰ atrasados · 📋 abiertos · ✅ arreglados hoy. Busca por unidad, puesto o problema; elige un puesto. 📍 Por puesto / 🗂 Por problema. |
| The card `27-…before-photo.png` | Stand + unit + type badge, the problem with its detail (unit name for temperature items), when flagged, days open, who reported it, 🔴 BEFORE photos. | Puesto + unidad + tipo, el problema con su detalle, cuándo se marcó, días abierto, quién reportó, fotos 🔴 BEFORE. |
| 🔧 In process `28-…in-process.png` | Starts the clock. 📨 Send → the inspector sees it now. | Arranca el reloj. 📨 Send → el inspector lo ve ya. |
| ⏳ Waiting on… | Part, vendor, stand must be empty: write what and when, Send. | Pieza, proveedor, puesto vacío: escribe qué y cuándo, Send. |
| ✅ Fixed `29-…after-photo-fixed.png`, `30-…done.png` | 📷 Take photo or 🖼 Upload the AFTER photo (required), one line of what you did, Send. Minutes on the job and the stand type are recorded. The card leaves your list. | 📷 Tomar o 🖼 Subir la foto AFTER (obligatoria), una línea de qué hiciste, Send. Quedan los minutos y el tipo de puesto. La tarjeta sale de tu lista. |
| Not mine → move | Pest, cleaning or Ecolab job on your board? Pick who it belongs to. It leaves and the inspector is told. | ¿Plagas, limpieza o Ecolab en tu tablero? Elige de quién es. Sale y se avisa al inspector. |
| Reports tab | Every inspection of the last 60 days with a problem for your team, with notes and photos. | Cada inspección de los últimos 60 días con un problema para tu equipo, con notas y fotos. |

---

## 5. Cleaning crew `33-cleaning-board.png`

Same board and same taps as Maintenance, plus:

| English | Español |
|---|---|
| On ✅ Fixed you answer: 🧹 We cleaned it / 👍 It was already clean. Typing "ya estaba limpio" or "we cleaned it" pre-picks it. | Al marcar ✅ Fixed respondes: 🧹 Lo limpiamos / 👍 Ya estaba limpio. Escribir "ya estaba limpio" lo elige solo. |
| The stand type is stamped on the job (CONCESSION problem / SUBCONTRACTOR problem). Subcontractor jobs are billable; the inspector's cleaning log and PDF use it. | El tipo de puesto queda en el trabajo (problema de CONCESSION / SUBCONTRACTOR). Los de subcontratista se facturan; el registro de limpieza y el PDF del inspector lo usan. |
| Your day shows in the inspector's 🧹 Cleaning log: every stand, started / solved times, minutes, before / after. | Tu día aparece en el 🧹 Cleaning log del inspector: cada puesto, horas de inicio / fin, minutos, antes / después. |

---

## 6. Ecolab crew `34-ecolab-board.png`

Same board and same taps as Maintenance, plus:

| English | Español |
|---|---|
| Your cards: sanitizer concentration, dish machine, chemical dispensers, test strips, chemical storage. Problems written as "sanitizer too weak" or "no hay químico" route to you automatically. | Tus tarjetas: concentración de sanitizante, máquina de platos, dispensadores, tiras de prueba, almacenamiento de químicos. Problemas escritos como "sanitizer too weak" o "no hay químico" llegan a ti solos. |
| The Food Safety Quick Reference (sanitizers tab) is the standard the inspector and the stands see — keep your readings in those ranges. | La referencia rápida (pestaña sanitizantes) es el estándar que ven el inspector y los puestos — mantén tus lecturas en esos rangos. |
| Not yours (a leak, grease)? Not mine → move to Maintenance or Cleaning. | ¿No es tuyo (una fuga, grasa)? Not mine → move a Mantenimiento o Limpieza. |

---

## 7. Admin / manager `17-admin.png`, `48-desktop-admin-dashboard.png`

| Feature | English | Español |
|---|---|---|
| Dashboard | Performance: inspections, pass rate, open problems, fixes, by inspector and by stand. | Rendimiento: inspecciones, tasa de aprobación, problemas abiertos, arreglos, por inspector y por puesto. |
| Schedule | Month calendar of planned inspections and assignments. | Calendario mensual de inspecciones planeadas y asignaciones. |
| Users | Approve requests, set roles (inspector, admin, location manager, crews), soft-remove. | Aprobar solicitudes, asignar roles, quitar (borrado suave). |
| 🔗 Invite links | One link per role with a QR (Save PNG / Print / Copy). Share by text or WhatsApp. An existing badge is refused with "already exists as ROLE". | Un enlace por rol con QR (Guardar PNG / Imprimir / Copiar). Comparte por texto o WhatsApp. Un gafete existente se rechaza con "already exists as ROLE". |
| License registry | The 2026 sheet (106 rows): mark rows requested / active / added. This list drives the posters and the stand ids — change names here, not in reports. | La hoja 2026 (106 filas): marca filas requested / active / added. Esta lista manda en los carteles y los ids de puesto — cambia nombres aquí, no en reportes. |
| Stand list | Add / edit / hide stands (site, unit, floor, license, type) and their contacts. | Agregar / editar / ocultar puestos (sitio, unidad, piso, licencia, tipo) y sus contactos. |
| Venue | Venue id and settings; "Viewing reports for" banner for global admins. | Id y ajustes del lugar; banner "Viewing reports for" para administradores globales. |
| Push notifications | Ready in the code but not turned on: needs the Web Push key pasted in and one deploy from Joxel's machine (`docs/PUSH-SETUP.md`). Until then alerts arrive while the app is open. | Listo en el código pero no activado: falta pegar la clave Web Push y un despliegue desde la máquina de Joxel. Hasta entonces las alertas llegan con la aplicación abierta. |

---

## 8. Quick-reference cards (print one per department)

### Inspector — your 6 taps / tus 6 toques
1. on site → 📷 Scan the stand poster. / on site → 📷 Escanea el cartel del puesto.
2. NO on an item → BEFORE photo + location + action. / NO en un punto → foto BEFORE + ubicación + acción.
3. Save Report. / Guardar.
4. Analytics → Follow-ups: Remind, Resolve, Put back. / Analytics → Follow-ups: recordar, cerrar, regresar.
5. Analytics → Temps: who logged, Text all missed. / Analytics → Temps: quién registró, Text all missed.
6. Select → 📸 Before & After when you need the proof. / Select → 📸 Before & After cuando necesites la prueba.

### Stand team — your 5 taps / tus 5 toques
1. Scan the poster (or open the inspector's text). / Escanea el cartel (o abre el texto del inspector).
2. Name + phone → This is my location. / Nombre + teléfono → This is my location.
3. Food temps, then your coolers. Red = reason + action. / Temperaturas de comida, luego tus neveras. Rojo = razón + acción.
4. Problem? Write it, photo, action, Send. / ¿Problema? Escríbelo, foto, acción, Send.
5. ✎ Edit this unit if a cooler moved or is gone. / ✎ Editar si una nevera se movió o ya no está.

### Crews (Maintenance · Cleaning · Ecolab) — your 5 taps / tus 5 toques
1. Open the link, pick your language. / Abre el enlace, elige tu idioma.
2. Read the card: stand, unit, BEFORE photo. / Lee la tarjeta: puesto, unidad, foto BEFORE.
3. 🔧 In process → Send. / 🔧 In process → Send.
4. 📷 AFTER photo → ✅ Fixed → one line → Send. / 📷 Foto AFTER → ✅ Fixed → una línea → Send.
5. Not yours? Not mine → move. / ¿No es tuyo? Not mine → move.

### Admin — your 4 places / tus 4 lugares
1. Users: approve and set roles. / Usuarios: aprobar y asignar roles.
2. Invite links: one QR per role. / Enlaces: un QR por rol.
3. Licenses: keep the sheet current. / Licencias: mantén la hoja al día.
4. Dashboard and schedule. / Tablero y calendario.

---

## 9. Training plan (20 minutes per department)

| Department | Demo live (10 min) | They do it on their phone (8 min) | Check (2 min) |
|---|---|---|---|
| Inspector | Scan a poster, fail the hand sink with BEFORE photo, save, open Follow-ups, Resolve, open Temps, Text one person. | Full inspection of one demo stand (MAGIC CITY DOGS #114), one flagged item. | "Show me the open problem on the crew board and the Fixed panel." |
| Stand supervisors | Scan → identify → temps (one red) → problem in their words → Submitted. Show the SUPERVISOR LOG card. | Log the demo stand's temps and one problem with a photo from their own phone. | "Text me your stand link" (People → Text link) and "add the missing freezer". |
| Maintenance | Card → In process → After photo → Fixed; Not mine → move. | Close the demo card on their phone; move one to Cleaning. | "Where does the inspector see your after photo?" (Follow-ups → Fixed). |
| Cleaning | Same, plus the We cleaned it / already clean question and the cleaning log. | Close a demo cleaning card. | "Which jobs get billed to the subcontractor?" |
| Ecolab | Same board; a sanitizer card; the Food Safety reference sanitizer tab. | Close a demo Ecolab card. | "Move a leak card to Maintenance." |
| Admin | Users, invite link with QR, license row, dashboard. | Create an invite link for a test role and join with a test badge. | "Mark a license as requested and find it on the poster." |

Demo data to seed before a session: the list in `sales-video-scripts.md` §4 (MAGIC CITY DOGS #114, two coolers, MARIA logged / LUIS missed, one open problem with a BEFORE photo, one fixed with BEFORE and AFTER). Use fake 305 555 phone numbers.
