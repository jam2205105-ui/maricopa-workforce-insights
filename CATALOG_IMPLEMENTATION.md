# Comprehensive career catalog — GitHub Pages implementation

The public O*NET 31.0 occupational directory includes 1,016 occupations. The `scripts/refresh_catalog.py` downloader obtains the **official current release** from O*NET and extracts titles, descriptions, exact full O*NET-SOC codes, job zones, some alternate titles, and public `OI` occupational RIASEC interest profiles. It validates 950–1300 occupations and at least 800 complete six-dimension profiles before GitHub Pages deployment can proceed.

- Catalog publication: `data/occupations.json` (created in Actions, or manually via script)
- Data refresh: `.github/workflows/deploy-pages.yml`
- GitHub Pages artifact build: `scripts/build_site.py`
- Public RIASEC comparison: `interest_match.js` (browser only)
- Curated MCCCD pathways: `data/catalog.json` (**24 exploratory mappings, not a districtwide crosswalk**)

The downloader uses the O*NET Database, not an O*NET API key. No synthetic records are shipped. Source publication metadata and version travel with the dataset. Occupational wage records are BLS OEWS Phoenix metro observations keyed by the broader **7-character BLS SOC**; specialized O*NET-SOC codes sharing this wage series are labeled accordingly and not double-counted.

When the first GitHub Actions workflow succeeds, the deployed website has the full actual career catalog; the ZIP itself does not prepopulate 1,016 records. Missing public data remain missing. See README for source and methodology details.
