# Maricopa Workforce Insights — GitHub Pages edition

A **GitHub-only** LMI Hub. GitHub stores the code, **GitHub Actions** downloads published labor-market data and deploys the website, and **GitHub Pages** hosts it. **No Netlify, backend server, build system, or student API credentials are required.**

> **Prototype governance notice:** Independent demonstration; not an official Maricopa Community Colleges site or approved program-to-occupation crosswalk. Review with MCCCD web, accessibility, FERPA, brand and data governance before institutional publication.

## Deploy in GitHub (new repository)

1. Create a GitHub repository named, for example, `maricopa-workforce-insights`. For a GitHub Free account using GitHub Pages, use a **public** repository; other plans may support private repositories. Choose `main` as the default branch.
2. Upload **the contents of this extracted folder** into the repository root. The root must contain `index.html`, `student.js`, `data/`, `scripts/`, and the **hidden** `.github/workflows/deploy-pages.yml` file. The hidden workflow file is essential; upload the folder with Git, GitHub Desktop, or an upload method that includes dot-folders.
3. Go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. You do **not** select branch publishing for this version.
4. Go to **Actions → Refresh labor-market data and publish GitHub Pages → Run workflow → Run workflow**. Push to `main` also runs the workflow automatically.
5. Wait until the deployment job finishes successfully, then open the site URL shown under **Settings → Pages**, typically `https://YOUR-USERNAME.github.io/maricopa-workforce-insights/`.
6. Test: career search, 1,016 official O*NET occupations (subject to version changes), interest score import, career shortlist, environmental scan, and data source status. Wages display only after BLS publishes/returns a validated value.

### Optional API keys

In **Settings → Secrets and variables → Actions → New repository secret**, you may add:

| Secret | Use | Required? |
| --- | --- | --- |
| `BLS_API_KEY` | Higher API quota for monthly BLS series | No |
| `CENSUS_API_KEY` | Optional county ACS feed | No; enables ACS updates |
| O*NET API key | **Not used** on GitHub Pages | No. Do not add it to public code |

These repository secrets are available only during GitHub Actions; GitHub Pages cannot host a secret-backed API endpoint. **Never commit credentials to the repository or place them in `data/*.json`, JavaScript or an iframe URL.**

### Configure the official O*NET Interest Profiler widget

The site has a student-friendly **official-widget + score import** experience. A licensed O*NET developer account provides an approved embeddable widget snippet. Take its **public iframe `src` URL only**, and place it in `data/student_config.json` as `onetWidgetIframeSrc`. Do **not** include your O*NET API key or other secrets. If the widget cannot be embedded because of framing restrictions or is not configured, the site provides a direct link to the official profiler at https://onetinterestprofiler.org/.

**Result handoff limitation:** O*NET does not document a browser-safe result callback from the cross-origin hosted widget, so students manually copy their **six RIASEC scores** into the hub. The hub then compares those scores with published O*NET occupational interest profiles **entirely in the browser**. This is a pattern comparison, **not** O*NET's official Web Services career-fit algorithm or labels. No O*NET API secret or additional hosting service is necessary.

## Data refresh and website publishing

`.github/workflows/deploy-pages.yml` runs on every push to `main`, manually on demand, and daily at **14:17 UTC (07:17 Arizona)**. It:

1. Runs unit tests for the data parser, catalog, and local interest comparison.
2. Downloads the official O*NET Database occupations, preparation levels, alternate titles, and occupational RIASEC interest ratings (no API key needed). The first **full download** must succeed. A suspiciously incomplete source **blocks deployment**, preserving the last good live website rather than publishing a fake directory.
3. Refreshes published Maricopa County BLS unemployment, Phoenix MSA payroll/industry data, Phoenix metro BLS OEWS wages and optional Census ACS indicators. Data are validated and metadata state the latest publication period. If a source fails, it is marked unavailable or the last verified values retained with a warning; no invented wage, employment or job-opening values.
4. Validates the catalog and packages **only public site files** into `_site/`.
5. Deploys that artifact directly to GitHub Pages using `actions/deploy-pages`.

**Important:** New data are checked each day, but BLS OEWS publishes annually and BLS employment series monthly. *Daily website rebuilds are not daily economic releases.* The site does not require GitHub Actions to commit generated data to your main branch. The live `data/occupations.json` and `data/current.json` are in the Pages build artifact. To get a copy of the refreshed data locally, run the scripts yourself.

## Run locally

```bash
python -m pip install -r requirements.txt
python scripts/refresh_catalog.py
python scripts/refresh_data.py
python -m http.server 8000
```

Open `http://localhost:8000/` (not `file://`). The initial ZIP contains only the **24 curated starter pathways**, without an actual 1,016-occupation source snapshot: this build container cannot fetch public servers. The GitHub workflow downloads the full real catalog at deployment time. **Do not treat the 24-pathway sample as the comprehensive verified catalog.**

## What is available

- **Students:** full official O*NET career search (after deployment refresh); alternate titles; preparation filters; wages when available; official hosted Interest Profiler link/optional widget; six-score import; locally ranked exploratory occupational interest alignments; shortlist and downloadable plan.
- **Educators:** program demand scan builder over the occupation directory; source metadata; wage/occupation employment snapshots; printable report.
- **Community:** unemployment/payroll trends and sector indicators with source periods; printable regional brief; CSV export.
- **Automation:** daily source checks and GitHub Pages deployments with no exposed credentials.

## What is NOT connected

- Approved districtwide program-to-career CIP/SOC mapping (**24 editorial example pathways only**)
- MCCCD enrollment, retention, completions or student records
- Arizona OEO projections, job posting data or a live job-vacancy inventory
- Server-side O*NET Interest Profiler scoring or official O*NET occupation-fit labels
- Automatic cross-origin transfer of hosted O*NET widget results

This design intentionally avoids collecting student names, emails, or institutional IDs. Interest scores stay local to the browser unless students opt to retain them on that device; a saved shortlist stays on the device. Because GitHub Pages is static, server-side identity verification and confidential institutional analytics require a different, authenticated deployment surface.

## Source/method attribution

O*NET® Database, U.S. Department of Labor / ETA, currently 31.0 (CC BY 4.0): https://www.onetcenter.org/database.html

O*NET Interest Profiler licensing and integration: https://services.onetcenter.org/ip and https://www.onetcenter.org/license_tools.html

Career interest ratings: O*NET Database **Career Interest Types**, `OI` scale, 1–7 per RIASEC area. Browser similarity uses the Pearson correlation of the six-dimensional profile shapes, inspired by O*NET's published Interest Profiler Manual; threshold labels are **site-defined**, not official fit labels. https://www.onetcenter.org/dl_files/IP_Manual.pdf

BLS LAUS: **Maricopa County** monthly unemployment (not seasonally adjusted). BLS CES and OEWS: **Phoenix–Mesa–Chandler MSA**, includes **Maricopa and Pinal counties**. BLS OEWS occupational employment **is not job vacancies**. Sources: https://www.bls.gov/lau/ , https://www.bls.gov/sae/ , https://www.bls.gov/oes/tables.htm

Maricopa degrees/certificates: https://www.maricopa.edu/degrees-certificates (editorial examples, unreviewed).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No site URL | Settings → Pages → Source must be **GitHub Actions**; open the latest Actions run for errors. |
| Action workflow missing | The entire hidden `.github/workflows/deploy-pages.yml` path wasn't uploaded. |
| Workflow fails during O*NET download | Source temporarily unavailable / naming changed; try re-running. The prior website stays live. |
| Only 24 careers locally | Run `python scripts/refresh_catalog.py` or deploy through GitHub Actions. |
| Salary shown as “not available” | Published BLS OEWS file may be missing/suppressed for that occupation, or the data refresh failed. Inspect **Data sources** section. |
| Student button doesn't automatically report scores | Hosted O*NET iframe is cross-origin; students import their six RIASEC scores. This is intentional and does not require an API key. |
| Works on `/` but not on project path | Keep the bundled relative URLs. Do not change `data/…` into absolute `/data/…`. |


## Source reliability (Nov 2026)

- **BLS OEWS wages:** The published 2025 Phoenix-Mesa-Chandler metropolitan
  geography is `0038060` in OEWS (seven digits, including leading zeroes).
  BLS CES payroll series use the five-digit metro code `38060`; do not interchange them.
  OEWS is annual and not a monthly/real-time salary estimate.
- **BLS LAU, CES and industries:** Monthly reported values; monthly refreshes
  can have release lags. The Phoenix MSA includes Maricopa and Pinal counties,
  while the unemployment measure is Maricopa County.
- **Census ACS:** Requires adding `CENSUS_API_KEY` in GitHub Settings →
  Secrets and variables → Actions. Without it, the feed is marked skipped.
- **O*NET:** Source includes all published occupations; only occupations with
  complete public RIASEC profiles have interest-matching data. Missing profiles
  are never synthesized.
- **Persistence:** A successful workflow commits updated, validated public
  snapshots back to `data/current.json` and `data/occupations.json`, so a
  temporary upstream outage keeps previously verified values with an error
  status instead of silently wiping them out. No API keys are committed.
- **Failure policy:** Builds fail rather than publish when fewer than 100 verified
  metro OEWS SOC records or required BLS LAU/CES indicators are available.

### On-site student assessment
Set `ONET_API_KEY` (O*NET Web Services **v2** key) under GitHub Actions repository secrets. At build time, `scripts/refresh_interest_questions.py` downloads the **30 original Mini-IP questions**, validates five questions for each of six interest areas, and publishes only non-secret question text. The student assessment is completed locally, with browser-only responses. Scores are exploratory local totals (0–20 per area) used for the existing occupation interest pattern comparison; this is **not** the O*NET official Results API or endorsed/validated career fit. See O*NET Tools Developer License for conditions applicable to adapted tools: https://www.onetcenter.org/license_tools.html . If the key is absent or not authorized, only existing verified questions will remain available and the website will explicitly say when the on-site assessment cannot load. Do not put API keys in source code or public site configuration.
