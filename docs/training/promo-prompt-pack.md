# Prompt pack: "SDX Inspect" modern video

## Context
Joxel asked for a good prompt to create a super good, modern video. No code changes. Deliverable = a ready-to-paste prompt pack: one master brief (for Higgsfield Marketing Studio, an explainer workflow, or any AI video tool/agent) plus shot-by-shot text-to-video prompts (Seedance 2.5 / Kling 3.0) and the on-screen text lines. No voiceover. If approved, the next step is to run it through Higgsfield (`generate_video_batch` for the shots, text overlays and sandbox mix; no voice) exactly like the v3 build.

## A. Master brief (paste as one prompt)

Create a 60-second, modern, cinematic product video for **SDX Inspect**, the kitchen and stand inspection app used by Sodexo Live! at Hard Rock Stadium. Audience: maintenance, Ecolab and cleaning crews plus stand supervisors. Tone: confident, calm, premium tech; think Apple keynote meets stadium game day. Format 16:9, 1080p, 24 fps, also a 9:16 cut. Look: real stainless-steel kitchens, glass-door coolers, stadium concourse at dusk, warm tungsten mixed with cool blue; shallow depth of field; slow dolly and glide moves; no shaky handheld; no cartoon; no stock-photo smiles. Color: deep navy #0F1F3D, electric blue #2F6BFF, gold #FFD166 accents, white type. Typography: bold sans-serif headlines, one line at a time, big and readable on a phone. Motion graphics: phone mock-ups of the app that slide in with soft shadows, UI elements that pop with a spotlight, chapter numbers that scale in, thin progress bar. No voiceover. The story is told only by the footage, the music and big on-screen text. Music: modern, minimal electronic pulse, 100 bpm, no vocals, with clear hits on each beat change so the text can land on them. Text: every beat has one short English line in white and its Spanish line under it in gold; text is the narrator.

Story in 6 beats: (1) Hook, 0–6 s: a cooler door swings shut in slow motion, a temperature reading turns green; text "Every stand. Every problem. One tap." (2) The problem, 6–16 s: an inspector spots a leaking faucet, snaps a photo; the report lands on a phone with a soft chime; text "The inspector finds it." (3) Your board, 16–28 s: phone mock-up of the Maintenance board: overdue, open, fixed today; a card opens; text "It lands on your board." (4) Do the work, 28–44 s: hands with a wrench under a hand sink; on the phone: In process, Waiting on, After photo, Fixed with a note; before/after photos side by side; text "Say what you did. Show it." (5) The stand side, 44–54 s: a supervisor scans the poster QR, taps Report a problem only, an announcement from the inspector appears; text "Stands report. Inspectors announce." (6) Close, 54–60 s: stadium exterior at dusk, lights on; logo "SDX Inspect" with tagline "Inspection, done together." and the Sodexo Live! line.

Rules: no fake statistics, no text inside the generated footage (all text is overlaid later), no visible brand logos other than ours, no faces in close-up, hands and backs are fine, keep every shot 4–8 seconds, leave clean negative space on the right third for text.

## B. Shot prompts (text-to-video, 16:9, 1080p, silent, one per generation)

1. Hook: "Extreme slow motion, a stainless steel commercial cooler door closing in a stadium kitchen, condensation on the glass, warm tungsten key light with cool blue rim, shallow depth of field, slow push-in, cinematic, no text." 6 s.
2. Inspector: "Over-the-shoulder shot of an inspector in a dark polo photographing a leaking faucet under a hand sink with a phone, water droplets catching light, stainless steel kitchen, shallow depth of field, slow orbit, cinematic, no visible face, no text." 6 s.
3. Notification: "Close-up of a smartphone on a steel counter lighting up, screen is plain and blank, soft glow on the metal, slow dolly in, cinematic, no text." 4 s.
4. Work: "Close-up of gloved hands tightening a fitting with a wrench under a stainless steel hand sink, work light, water drops, slow orbit, shallow depth of field, cinematic, no text." 6 s.
5. After: "A maintenance worker closes a commercial reach-in cooler door, wipes hands on a towel and nods, back to camera, warm kitchen light, slow push-in, cinematic, no face, no text." 6 s.
6. Concourse: "Empty stadium concourse at dusk, concession stands with roll-up gates half open, warm light spilling out, slow steady glide forward, cinematic, no people, no text." 6 s.
7. Supervisor: "A stand supervisor holds a phone up to a poster on a concession stand wall, phone screen plain, warm light, medium shot from behind, slow dolly, cinematic, no face, no text." 5 s.
8. Close: "Aerial-style wide shot of a modern football stadium at dusk, lights on, deep blue sky, slow rise, cinematic, no text, no logos." 8 s.

## C. On-screen text (EN / ES, one line per beat, no voiceover)
1. Every stand. Every problem. One tap. / Cada puesto. Cada problema. Un toque.
2. The inspector finds it. / El inspector lo encuentra.
3. It lands on your board. / Llega a tu tablero.
4. Say what you did. Show it. / Di qué hiciste. Muéstralo.
5. Stands report. Inspectors announce. / Los puestos reportan. Los inspectores anuncian.
6. SDX Inspect · Inspection, done together. / Inspección, en equipo.

## D. If we build it here
Reuse the v3 pipeline: shots via `generate_video_batch` (seedance_2_5, ~90 credits per 10 s, ~55 per 6 s; 8 shots ≈ 450 credits), app screens from the harness recording (phone mock-up), text overlays and a royalty-free music bed (you supply the track, or a Higgsfield music model if the account has one) mixed in `sandbox_exec`, delivered as a Higgsfield link.
