# 💍 Engagement Live Album

A free, camera-only shared photo album for your engagement party. Guests scan a QR code, take photos **with their phone camera** (there is no way to pick files from the gallery), and every photo appears instantly for everyone — on phones and on a big-screen live wall.

- **Hosting:** GitHub Pages (static, no build step)
- **Storage + live updates:** Supabase free tier
- **Cost:** $0

## Features

| | |
|---|---|
| 📷 **Camera-only capture** | `getUserMedia` + canvas. No `<input type="file">` anywhere. Front/rear switch, 3s/10s self-timer, 6 photo styles, optional couple-name frame on every photo. Space / volume keys work as a shutter. |
| ⚡ **Live album** | New photos appear on every open device within a second (Supabase Realtime), with automatic polling fallback if the socket drops. |
| 📶 **Works on bad venue Wi-Fi** | Photos are queued on the phone (IndexedDB) and upload automatically when the connection returns. Guests see their photo immediately. |
| 🖼 **Fast gallery** | Separate 480px thumbnails, lazy loading, no layout shift, swipeable full-screen viewer (swipe down to close, Android back button closes it). |
| ⬇️ **Downloads** | Save any photo in full quality, share via the phone's share sheet, or download the whole album as a ZIP. |
| 📺 **Live wall** | `#/wall` — slideshow for a TV/projector with a QR code; new photos jump straight to the screen with a "Just in" badge. Keeps the screen awake. |
| 🔒 **Host tools** | PIN-protected removal of photos (PIN verified in the database, never shipped to the browser). Guests can add photos but can't edit or delete anything. |
| 📱 **PWA** | Installable, offline app shell, safe-area aware for notched phones, light & dark themes. |

## Try it right now (demo mode)

With empty Supabase keys the app runs in **demo mode**: photos are stored on that device only (open two tabs to see live updates). Host PIN in demo mode is `1234`.

```bash
cd engagement-gallery
python3 -m http.server 8000
# open http://localhost:8000  (camera works on localhost or https only)
```

## Go live in ~10 minutes

### 1. Create the free Supabase backend
1. Sign up at [supabase.com](https://supabase.com) → **New project** (any region near your guests, e.g. Singapore/Mumbai for Sri Lanka).
2. Open **SQL Editor**, paste the whole of [`supabase/setup.sql`](supabase/setup.sql), **change the host PIN** on the line marked `>>> CHANGE ME <<<` (use something longer than 4 digits), then **Run**.
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**.

### 2. Configure
Edit `config.js` — this is the only file you need to touch:

```js
coupleNames: "Alex & Jordan",
eventDate: "2026-11-21",
supabaseUrl: "https://xxxx.supabase.co",
supabaseAnonKey: "eyJ...",     // public key — safe to commit
```

### 3. Deploy to GitHub Pages
1. Create a repository and push this folder's contents to `main`.
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
3. Your album is live at `https://<username>.github.io/<repo>/`. Set `publicUrl` in `config.js` to that address so the QR codes always point to it.

### 4. On the day
- Print the QR code from the home page (or show the **Live wall** on a TV — it has the QR built in).
- Test once on an iPhone (Safari) and an Android (Chrome) before guests arrive.
- Unlock **Host tools** at the bottom of the album to remove any photo.
- After the party, use the ZIP button to download everything.

## Free-tier capacity
Supabase free: 1 GB storage, 5 GB bandwidth/month. Each photo is ~300–600 KB plus a ~40 KB thumbnail, so roughly **2,000 photos** fit. Lower `maxImageEdge` (e.g. 1600) in `config.js` for more headroom. Inactive free projects pause after a week of no use — download the ZIP soon after the event.

## Project structure
```
index.html            single-page app (home, camera, gallery, live wall)
config.js             ← your event settings
css/styles.css
js/main.js            router, home page, PWA
js/camera.js          camera, filters, frame, capture
js/store.js           Supabase / demo data layer, realtime, offline upload queue
js/gallery.js         grid, viewer, downloads, host tools
js/wall.js            big-screen slideshow
js/util.js            helpers (IndexedDB, dialogs, toasts, QR)
supabase/setup.sql    database, storage bucket, security rules, host PIN
vendor/               supabase-js, JSZip, QR generator (bundled — no CDN needed)
sw.js, manifest.webmanifest, icons/
```

## Security notes
- The anon key is public by design; Row Level Security limits guests to **reading** and **adding** photos. Updates and deletes are impossible without the host PIN.
- Storage accepts only `image/jpeg` files under 6 MB with server-validated names.
- "Camera-only" is enforced in the app UI. A technically skilled person could still call the API directly — that's inherent to any app with no login, and Host tools let you remove anything unwanted.
- Removing a photo hides it from the album; the file stays in the storage bucket (delete it from Supabase → Storage if needed).

## Browser support
iOS Safari 15+, Android Chrome, desktop Chrome / Edge / Firefox / Safari. Opening the link inside some in-app browsers (Instagram, Facebook) may block the camera — the app tells guests to open it in Safari or Chrome.

MIT License.
