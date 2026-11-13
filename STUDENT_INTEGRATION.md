# GitHub-only Interest Profiler integration

**No backend**: GitHub Pages can host the public O*NET Interest Profiler **widget** if O*NET provides an authorized iframe URL that permits framing. The page cannot read values from that cross-origin iframe. Students manually enter their six RIASEC scores, and the hub compares those scores locally with published public O*NET occupational interest profiles. No O*NET API key is needed for this matching approach.

1. Obtain the **widget iframe src URL** from your O*NET developer account.
2. Set `onetWidgetIframeSrc` in `data/student_config.json`. Do not paste `X-API-Key` or other credentials into public files.
3. Deploy with the GitHub Actions Pages workflow.
4. Take the official interest assessment, import the six R/I/A/S/E/C scores, inspect top career alignments, compare pay, save a shortlist and export a plan.

Unlike the former Netlify edition, this version **does not administer O*NET's 30-question Mini-IP inside its own JavaScript**, because GitHub Pages cannot securely authenticate the O*NET Web Services scoring calls. We do not copy O*NET questionnaire items or call our local similarities “official fit.” O*NET's hosted widget remains the official assessment. Its browser results handoff is manual.

The occupational interest profiles come from O*NET Database `career_interest_types.json`, filtered to `scale_id=OI` and six valid RIASEC numeric ratings. The comparison is Pearson correlation, ordered highest to lowest, limited to 100 careers above an exploratory similarity threshold; it is not equivalent to O*NET API job-zone-specific recommendations or assessment fit labels. Work preparation, regional wages and program links remain separate evidence.

**Privacy:** no student name, ID, or email is collected. Scores are processed on-device and not sent to this site’s server. Optional “remember” storage uses that browser’s local storage and should be avoided on shared campus machines.
