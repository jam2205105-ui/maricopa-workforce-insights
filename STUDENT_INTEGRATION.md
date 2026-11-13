# Student interest assessment — GitHub Pages

The student experience uses an **on-site, 30-question activity assessment** sourced from O*NET Mini Interest Profiler questions. The hosted O*NET widget and its launch option have been removed from the student interface.

## Student flow

1. Select **Start on-site assessment** to answer 30 questions across six pages.
2. The browser calculates exploratory RIASEC interest scores and shows career matches.
3. Explore careers, Phoenix-area wages and potential Maricopa pathways without leaving the website.
4. Alternatively, select **Enter my six interest scores** to import previously obtained results.
5. Save a shortlist or download an interest-based career plan.

## Refresh and privacy

`scripts/refresh_interest_questions.py` runs in GitHub Actions and fetches the authorized O*NET Mini-IP questions. Use `ONET_API_KEY` as the Web Services key; the workflow retains a credential fallback from the existing `ONET_WIDGET_EMBED_CODE` secret for question retrieval. The site does **not** mount the hosted O*NET widget or publish its URL. The removed `data/student_config.json` file is no longer included in the website build.

Only the validated question text is published; student responses are processed on-device. Local RIASEC totals and career-profile similarities are exploratory and should not be represented as official O*NET Results API scores or validated career-fit recommendations. Review the O*NET Tools Developer License before official institutional adoption.
