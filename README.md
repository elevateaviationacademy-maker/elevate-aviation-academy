# Elevate Aviation Academy — Student/Instructor Portal

A single Next.js app — clean white theme, installable as a home-screen app
(PWA) on Android/iPhone, independent of any marketing website — with:
- Student signup/login
- Instructor login, content upload (video + PDF), and per-student access control
- Instructor-created **practice exams** pulled from the 7,900+ question DGCA
  bank (`data/questions.json`, covering Meteorology, Air Regulations, Air
  Navigation, Technical General, Technical Specific): pick subject/chapters/
  question count/duration, grant access to specific students, run several
  exams at once, open/close each one, and monitor scores as students submit
- Students only ever see content or exams an instructor has explicitly granted
- Best-effort download/screenshot deterrents (see "Honest limitations" below)

Total cost: **₹0/month** for up to a few hundred students on light-to-moderate
usage, using free tiers of Supabase, Cloudflare R2, and Vercel.

---

## 1. Create accounts (all free, no credit card required for these tiers)

1. **Supabase** — https://supabase.com → New project. Note your project URL
   and keys (Settings → API).
2. **Cloudflare** — https://dash.cloudflare.com → R2 → Create bucket, name it
   e.g. `elevate-academy-content`. Then R2 → Manage API Tokens → create a
   token with **Object Read & Write** on that bucket. Note the Account ID,
   Access Key ID, and Secret Access Key.

   **Also required — CORS policy on the bucket.** Uploads go directly from
   the student/instructor's browser to R2 using a signed URL (so files never
   pass through your server), which means R2 itself has to allow that
   cross-origin request. Without this, uploads fail in the browser with
   `Failed to fetch` and no other error detail. In the bucket → Settings →
   CORS Policy, add:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain.com"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Replace `your-production-domain.com` once you have a real deploy URL (you
   can always come back and add it later — `localhost:3000` alone is enough
   to develop locally). If you ever change ports or add another environment,
   add that origin here too.
3. **Vercel** — https://vercel.com → sign up with GitHub (free).
4. **GitHub** — you'll need a repo to connect to Vercel.

## 2. Set up the database

In Supabase: SQL Editor → New query → paste the entire contents of
`supabase/schema.sql` in this project → Run.

**Already had this app running before?** You only need one extra step:
SQL Editor → New query → paste the contents of `supabase/migration_subjects.sql`
→ Run. This adds subject-wise organization (Meteorology, Air Regulations, Air
Navigation, Technical General, Technical Specific) to your existing content
without touching anything you've already uploaded — old items just get
labeled "Unsorted" until you re-save them under a subject.

## 3. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the values from step 1.
Never commit `.env.local` to GitHub — it's already in `.gitignore`.

## 4. Run it locally to test

```bash
npm install
npm run dev
```

Open http://localhost:3000, sign up as a student, then in Supabase's SQL
editor run:

```sql
update profiles set role = 'instructor' where email = 'you@example.com';
```

Refresh — you're now the instructor. Upload a short test video/PDF, grant
your own test student account access, and open it from that account to
confirm everything works end to end.

To test exams: go to **Exams** in the instructor nav, create one (subject +
chapters + question count + duration), grant your test student access, open
the gate, then log in as that student and take it from the **Practice Exams**
tab. The question bank itself lives in `data/questions.json` — it's bundled
with the app, not stored in Supabase, so there's nothing extra to import.

## 5. Deploy for free

1. Push this project to a new GitHub repo.
2. In Vercel: New Project → import that repo.
3. Add the same environment variables from `.env.local` in Vercel's project
   settings (Settings → Environment Variables).
4. Deploy. Vercel gives you a free `.vercel.app` URL immediately.

## 6. Connect elevateaviationacademy.in

In Vercel: Project → Settings → Domains → add `elevateaviationacademy.in`
(and `www.elevateaviationacademy.in` if you want that too). Vercel shows you
1–2 DNS records to add. Go to wherever you bought the domain (registrar's DNS
settings) and add those records. It's free — Vercel doesn't charge for custom
domains on its free tier, and includes free HTTPS.

## 7. Turning it into a mobile app

This is already a PWA — no separate native app needed. It ships a manifest,
service worker, and icons, so most students just see an "Install" banner
in-app (Android/Chrome) and tap it. On iPhone (Safari), the banner shows the
manual steps: Share → "Add to Home Screen" (Apple doesn't allow an automatic
install prompt in Safari).

It then opens full-screen with its own icon, just like an installed app,
with zero App Store/Play Store approval or fees, and it doesn't link out to
elevateaviationacademy.wordpress.com or any other site — it's a standalone
portal for students.

## How to keep editing this with Claude

Just tell Claude (in a new chat, with these files attached, or paste the
relevant file) what you want changed — e.g. "add a field for flight hours to
each course" or "let instructors reorder content." Claude can edit any file
here directly.

---

## Honest limitations — please read

**Screenshots and screen recording cannot be fully blocked in a browser**,
on any platform, by any provider, free or paid. What this app does instead:
- Removes the browser's built-in download buttons (`nodownload` on video,
  hidden PDF toolbar).
- Serves files through short-lived signed links (20 minutes) that expire and
  can't be reused or shared as a permanent download link.
- Overlays a watermark with the logged-in student's name — so if content is
  leaked, you can trace which login it came from and revoke that student's
  access.
- Disables right-click "save as."

If a student is determined to screen-record their phone, no web (or native
app, honestly) technology stops that. The realistic goal is removing casual
sharing and making leaks traceable, not making leaks impossible.

**YouTube (unlisted) videos** work a little differently: the player itself is
YouTube's own iframe, so this app can't intercept right-click/download inside
it the way it does for R2-hosted video — the watermark overlay still traces
leaks back to the viewing student, and "Unlisted" keeps it out of search and
recommendations, but the direct embed link is still a link. Use R2 upload
instead for anything you want the extra layer of control on.

**Free tier limits to watch:**
- Cloudflare R2 free tier: 10GB storage, and R2 uniquely has **no charge for
  bandwidth/downloads** — this is why it's used here for video instead of
  Supabase storage (which does charge for bandwidth past a small free
  allowance). If you outgrow 10GB of stored video, R2 storage is ~$0.015/GB/
  month after that — still very cheap.
- Supabase free tier: 500MB database (plenty for user/course records — this
  isn't where the video lives), pauses your project after 1 week of no
  activity (just visit the dashboard to wake it back up if that happens).
- Vercel free tier: fine for this traffic level (50–200 students).

If you outgrow any of this, each of these services has a genuinely cheap
next tier ($0–$10/month range) rather than a hard cliff.
