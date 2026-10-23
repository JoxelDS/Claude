# DMCA takedown runbook (internal)

The public policy is `public/copyright.html`. Notices go to the designated agent ("Copyright Agent, JoxelBusiness LLC").
The safe harbor only protects us if the agent is registered at https://dmca.copyright.gov AND we act on valid notices.

## When a notice arrives
1. **Log it** (date received, who sent it, the work, the material and where it is). Keep the email.
2. **Check it is complete** (17 U.S.C. § 512(c)(3)): signature · the work · the material + where · contact details · good-faith statement · accuracy + authority under penalty of perjury. If something is missing, reply asking for it — an incomplete notice from the owner still deserves a reply.
3. **Find the material.** Photos live in Firebase Storage under `photos/<venue>/<record>/<photoId>.jpg` (and `<photoId>_t.jpg`); comments / chat / announcements in Firestore (`venues/<venue>/sharedMemory/venueSettings` follow-up comments, `supervisorChat`, `standNotices`). The app's ⚑ Report → Admin "Remove for everyone" hides it for everyone in the app; the file itself can't be deleted from the app.
4. **Remove it within 1–2 business days:** hide it in the app (admin Remove) AND delete the Storage object + clear the field with the Admin SDK (a service-account script run from a GitHub Action — never from a phone).
5. **Tell the person who posted it, promptly** (512(g)(2)(A)): what was removed, why, a copy of the notice (personal details of the sender may be left out), and how to send a counter-notice (link to copyright.html).
6. **Strike count:** add one strike to the poster's account. Two valid, uncountered notices → remove their access (Admin → remove person) and tell the venue admin.

## Counter-notice
1. Check it is complete (512(g)(3)): signature · material + where it was · mistake statement under penalty of perjury · name / address / phone · consent to federal court jurisdiction + accepting service.
2. Send a copy to the person who sent the original notice, saying we will restore it in 10 business days.
3. Restore the material between 10 and 14 business days after receiving the counter-notice, unless they tell us they filed a court action.

## Keep the registration alive
- The designation expires 3 years after it is registered unless it is amended or resubmitted ($6 each, Pay.gov). Calendar a reminder at 33 months.
- Any change of agent name, address, phone or email → amend it the same week, and update copyright.html to match exactly.
