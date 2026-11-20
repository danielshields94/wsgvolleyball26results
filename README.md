# World School Volleyball Championships 2026 – live results site

Fixtures, live results, standings, squads and tournament information for the
World School Volleyball Championships (Gloria Sports Arena, Antalya, 28–30 November 2026).

Hosted on Netlify. Results are stored with **Netlify Blobs** and saved through a small
**Netlify Function**, so staff can update scores from any device and everyone sees them
within about 15 seconds.

## What's in this repository

| Path | What it does |
|---|---|
| `public/index.html` | The website (single file: logo, flags, fixtures, rules all built in). |
| `netlify/functions/api.mjs` | The server function: password check, saving and reading results (`/api/data`, `/api/login`, `/api/write`). |
| `netlify.toml` | Tells Netlify where the site and function live. No build settings needed. |
| `package.json` | Lists the one package the function needs (`@netlify/blobs`). |

## One-time setup

1. **Create the GitHub repository**
   In GitHub, choose **New repository** (private is fine). Then use **Add file → Upload files**
   and drag in everything from this folder, keeping the folder structure
   (`public/` and `netlify/functions/`). Commit.

2. **Connect it to Netlify**
   In Netlify: **Add new site → Import an existing project → GitHub**, then pick the repository.
   Netlify reads `netlify.toml` automatically. Leave the build command blank and click **Deploy**.

3. **Set the staff password**
   In Netlify: **Site configuration → Environment variables → Add a variable**. Add both:
   - `EDIT_PASSWORD`: the password staff will type to enter results.
   - `SESSION_SECRET`: any long random string (40+ characters). It signs staff logins; nobody needs to remember it.

   Then go to **Deploys → Trigger deploy → Deploy site** so the function picks them up.

4. **Add your custom domain**
   In Netlify: **Domain management → Add a domain**. Either point a `CNAME` record for your
   domain (e.g. `results.yourdomain.com`) at your `yoursite.netlify.app` address with your
   domain provider, or move the domain's DNS to Netlify. HTTPS is switched on automatically.

## Entering results

1. Open the site, scroll to the bottom and click **🔒 Staff**.
2. Enter the staff password. You stay signed in on that browser tab for up to 14 hours,
   or until you click **Sign out** in the red banner.
3. Tap any match to enter set scores, set the status to **Live** or **Final**, and press **Save score**.
   Tap a team to edit its squad, or use **Edit tournament details** on the Tournament Info tab.

Standings, and knockout places once groups are complete, update automatically.

## Changing things later

- **Staff password:** change `EDIT_PASSWORD` in Netlify, then trigger a deploy. To sign
  everyone out immediately, also change `SESSION_SECRET`.
- **The website:** edit `public/index.html` in GitHub (or upload a new version). Netlify
  redeploys automatically. Saved results are **not** affected by redeploys.
- **Fixtures, teams or match formats** are built into `public/index.html`
  (`RAW`, `KO`, `TEAMS`, `DIVS` near the top of the script).

## How it works and its limits

- Visitors' pages check `/api/data` every 15 seconds while the tab is visible.
  Netlify's CDN answers repeat checks for up to 5 seconds, so most checks don't run the function.
  Keep an eye on **Usage** in Netlify during the event if many people are watching.
- The password is checked on Netlify's server. The page never contains it, and saving
  without a valid login is refused.
- Each match, squad and the tournament details are stored as separate entries, so
  several staff can enter different results at the same time.
- Results entered on the earlier claude.ai version of the page are not copied across.
