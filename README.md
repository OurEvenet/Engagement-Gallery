# 💍 Gayathri & Ashen — Live Engagement Album

**Admin guide: how to run the album before, during and after the party.**

🔗 **Album link:** https://ourevenet.github.io/Engagement-Gallery/
📺 **Live wall (for the TV/projector):** https://ourevenet.github.io/Engagement-Gallery/#/wall

Guests scan a QR code and take photos with their phone camera (they can't upload old photos from their gallery). Every photo shows up straight away for everyone, on phones and on the big screen.

---

## 1. What guests do

1. **Scan the QR code**: the printed card, or the one on the live wall.
2. Tap **Take a photo**. The first time, the phone asks for camera access; they tap **Allow**.
3. Optionally type their name, which is shown with their photos.
4. Pick a style (Original, Glow, Warm, Rosé, Film, B&W). Use the ⏱ timer for group shots (3s or 10s) and 🔄 to switch to the selfie camera.
5. Tap the round shutter button, add a caption if they like, then **Add to album**. Hearts fly up and the photo is in the album. 💕
6. **View the album** shows everyone's photos. Tap one to see it full-screen and swipe left or right. **Save** downloads it and **Share** sends it to WhatsApp and similar apps.

> Every photo gets an elegant "Gayathri & Ashen · date" frame along the bottom.
> If the Wi-Fi drops, photos are kept on the guest's phone and upload by themselves when the connection comes back.

---

## 2. Before the party (checklist)

- [ ] **Check the date.** It's set in `config.js` → `eventDate` (currently `2026-11-21`) and is printed on every photo frame. To change it, see section 6.
- [ ] **Test on two phones**, one iPhone (Safari) and one Android (Chrome):
  1. Open the album link and take a photo.
  2. Check it appears on the other phone without refreshing.
  3. Delete the test photo using **Host tools** (section 4).
- [ ] **Print the QR code.** On the home page, the "Invite other guests" card has the QR code: screenshot it, or print the page. It always points to the album link above.
- [ ] **Test the live wall** on the TV laptop: open the live wall link, then click ⛶ (full screen). Move the mouse to show the buttons.
- [ ] **Find a few host PIN holders.** Only people who know the PIN can remove photos. Keep the PIN private. It is **not** written anywhere in this repository.

---

## 3. During the party

| Task | How |
|---|---|
| **Show photos on the TV** | Open the **live wall** link on a laptop connected to the TV and go full screen. Each photo shows for 6 seconds, and brand-new photos jump to the screen with a "Just in" badge. The QR code stays on the side so more guests can join. The screen won't go to sleep. |
| **Check the album** | Open the album link → **View the album**. The red dot means updates are live, and the top line shows the number of photos and guests. |
| **Remove an unwanted photo** | See section 4. |
| **Guest says the camera doesn't work** | See section 7. |

---

## 4. Host tools: removing photos

1. Open the album → **View the album**.
2. Scroll to the bottom and tap **🔒 Host tools**.
3. Enter the **host PIN** → **Unlock**. The label changes to "Host mode on".
4. Tap any photo; a 🗑 button appears next to Save/Share. Tap it → **Remove**.
   The photo disappears for everyone straight away.
5. When you're done, tap **Host mode on · exit**. Host mode also switches off automatically when the browser tab is closed.

**Changing the host PIN:** open [Supabase](https://supabase.com/dashboard) → your project → **SQL Editor**, paste the following with your new PIN, then click **Run**:

```sql
update public.app_secrets
set value = extensions.crypt('YOUR-NEW-PIN', extensions.gen_salt('bf'))
where key = 'admin_pin';
```

> Removing a photo hides it from the album. The original file stays in Supabase Storage. To delete it completely, go to Supabase → **Storage** → `photos` and delete the files with that photo's ID.

---

## 5. After the party

1. **Download everything.** Open the album on a computer → **View the album** → the 🗂 **zip button** at the top right. Every photo is saved in full quality into one `.zip` file.
2. **Do this within a week.** Free Supabase projects pause after about 7 days with no activity. Your photos are kept, but you'd need to log in to Supabase and click **Restore** to bring the album back.
3. Optional: share the album link with guests afterwards, so they can view and save photos too.

---

## 6. Changing the settings

Everything lives in **`config.js`**. Edit it on GitHub: open the file → ✏️ pencil icon → make the change → **Commit changes**. The live site updates within about a minute; refresh the page to see it.

| Setting | What it does |
|---|---|
| `coupleNames` | Names on the home page, the photo frame and the wall (`"Gayathri & Ashen"`) |
| `eventTitle` | Small heading above the names (`"Our Engagement"`) |
| `eventDate` | Date shown on the home page and every photo frame, written as `YYYY-MM-DD` |
| `welcomeMessage` | Text under the date on the home page |
| `watermark` | `true` adds the names/date frame to each photo, `false` turns it off |
| `wallInterval` | Seconds each photo stays on the live wall |
| `maxImageEdge` | Photo size in pixels (lower it, e.g. `1600`, to fit more photos in the free storage) |

⚠️ Don't change `supabaseUrl`, `supabaseAnonKey`, `bucket` or `publicUrl` unless you move to a different Supabase project or website address.

**The couple illustration** is `images/couple.png`. To use a different picture, upload a new PNG with the same name; one with a transparent background looks best. The app icons are `icons/icon-192.png` and `icons/icon-512.png`.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| **"Camera access is off"** | The guest tapped "Don't allow". **iPhone:** tap **aA** in the address bar → Website Settings → Camera → Allow. **Android Chrome:** tap 🔒 next to the address → Permissions → Camera → Allow. Then tap **Try again**. |
| **Camera won't open inside Instagram/Facebook/WhatsApp** | Those in-app browsers often block the camera. Tap ⋯ → **Open in Safari / Open in Chrome**. |
| **"Camera is busy"** | Another app (a video call, the camera app) is using it. Close that app and try again. |
| **Photo stuck "uploading"** | The phone is offline. The photo is saved on the phone and uploads automatically when it reconnects; the guest can keep taking photos. The small number on the album button shows how many are waiting. |
| **Live wall stopped updating** | Refresh the page (F5) and go full screen again. Make sure the laptop's Wi-Fi is on. |
| **"Incorrect PIN"** | Check the PIN. To reset it, see section 4. |
| **Album won't load at all** | Check the Supabase project isn't paused: log in to [supabase.com](https://supabase.com/dashboard). If it's paused, click **Restore**. |

---

## 8. Limits of the free plan

- **Storage:** 1 GB, which is roughly **2,000 photos** (each is about 0.5 MB).
- **Bandwidth:** 5 GB per month. That's plenty for one evening, but avoid downloading the full zip many times.
- **Pausing:** the project pauses after about 7 days without visitors (see section 5).

To see usage, log in to Supabase → your project → **Usage**.

---

## 9. Privacy & security

- Anyone with the link can **view** and **add** photos. Nobody can edit or delete photos without the host PIN.
- The PIN is checked inside the database and is never sent to guests' phones.
- The `supabaseAnonKey` in `config.js` is a **public** key. That's normal and safe; the database rules are what protect the album.
- The GitHub repository is public, so **never put the host PIN in any file here.**

---

<details>
<summary><strong>Technical notes (for developers)</strong></summary>

- **Hosting:** GitHub Pages from the `main` branch root, no build step. **Backend:** Supabase (Postgres + Storage + Realtime), free tier.
- **Database setup:** [`supabase/setup.sql`](supabase/setup.sql) is idempotent. Change the PIN line before running it on a new project.
- **Demo mode:** with empty Supabase keys, photos are stored only in the browser (host PIN `1234`). Run it locally with `python3 -m http.server 8000` and open http://localhost:8000.
- **Structure:**
  ```
  index.html            single-page app (home, camera, gallery, live wall)
  config.js             event settings
  css/styles.css        styles + animations
  js/main.js            router, home page, PWA
  js/camera.js          camera, filters, frame, capture
  js/store.js           Supabase / demo data layer, realtime, offline upload queue
  js/gallery.js         grid, viewer, downloads, host tools
  js/wall.js            big-screen slideshow
  js/fx.js              petals + heart-burst animations
  js/util.js            helpers (IndexedDB, dialogs, toasts, QR)
  images/couple.png     couple illustration
  supabase/setup.sql    database, storage bucket, security rules, host PIN
  vendor/               supabase-js, JSZip, QR generator (bundled)
  sw.js, manifest.webmanifest, icons/
  ```
- **Animations** respect the phone's "reduce motion" setting: they're switched off for guests who have it enabled.
- **After changing files**, bump `CACHE` in `sw.js` (e.g. `eg-shell-v3`) so installed copies refresh.

MIT License.
</details>
