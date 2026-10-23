# Step 0 — publish the safer database rules (about 2 minutes, from your computer)

**Why:** today anyone who knows how could write a fake "owner" (global admin) record and sign in as you, or empty the shared equipment list with one request. These rules stop that. They change nothing for your team: requests, approvals, crew links, reports and photos all work as before.

**What still stays open until the move to the LLC project (sign-in checked by a server):** reading data. Rules can't tell who is reading without a real sign-in.

## Publish
1. Open https://console.firebase.google.com and pick the project **sodexoinspection**.
2. Left menu → **Firestore Database** → the **Rules** tab.
3. Select everything in the editor and delete it.
4. Open `firestore.rules` from the repo (GitHub → JoxelDS/Claude → `firestore.rules` → the **Raw** button), copy all of it, and paste it into the editor.
5. Click **Publish**.

## Check (the Rules Playground, same tab)
| Type | Location | Data | Should say |
|---|---|---|---|
| create | `users/test1` | `{"badgeHash":"test1","name":"t","role":"global_admin","approved":true}` | **Denied** |
| create | `users/test2` | `{"badgeHash":"test2","name":"t","role":"inspector","approved":false}` | **Allowed** |
| update | your owner record `users/<your record id>` | any change | **Denied** |

Then tell me "rules published". I run one read-only check and two writes that must be refused, nothing else.

## What changes for you
- New **admins on the stadium venue** can't be made from the app until the move. If you need one: Firebase console → Firestore Database → `users` → that person's record → change `role` to `admin`.
- Your own owner record can't be edited from a phone until the move. There is no screen for that anyway.

The rules were tested in the Firebase emulator: 28 checks, all passed.
