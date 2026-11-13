# GitHub-only Interest Profiler integration

**No backend**: The official assessment always opens through a working direct link. GitHub Pages can also host the public O*NET Interest Profiler **widget** if O*NET provides an authorized iframe URL that permits framing. The page cannot read values from that cross-origin iframe. Students manually enter their six RIASEC scores, and the hub compares those scores locally with published public O*NET occupational interest profiles. No O*NET API key is needed for this matching approach.

1. **Works now, without any widget code:** Students select **Take Interest Profiler here** to reveal the on-page O*NET widget when configured. The off-site O*NET link remains as a backup when the embed is unavailable. When done, they return and enter their six R/I/A/S/E/C scores to see local career matches, wages, and Maricopa pathways.
2. **Optional true embedded iframe:** Sign in to your O*NET Web Services developer account and retrieve the **Interest Profiler Widget iframe code** from **My Account**. This is separate from your API key. Copy only the iframe's approved HTTPS `src` URL.
3. In GitHub **Settings → Secrets and variables → Actions → Variables**, add repository variable `ONET_WIDGET_IFRAME_SRC` with that `src` URL. Alternatively, set `onetWidgetIframeSrc` in `data/student_config.json` for a public URL. Do NOT put the API key in any public file or a widget URL.
4. Run **Refresh labor-market data and publish GitHub Pages**. When approved and configured, the iframe displays above the score import. If not, students still have the fully working direct link.
5. A cross-origin iframe cannot pass assessment results into the site's JavaScript automatically. Students enter scores manually; the site then computes exploratory alignments with the published O*NET occupational profiles. Getting official API match ratings on-site requires a secure service, which GitHub Pages by itself does not provide.

Unlike the former Netlify edition, this version **does not administer O*NET's 30-question Mini-IP inside its own JavaScript**, because GitHub Pages cannot securely authenticate the O*NET Web Services scoring calls. We do not copy O*NET questionnaire items or call our local similarities “official fit.” O*NET's hosted widget remains the official assessment. Its browser results handoff is manual.

The occupational interest profiles come from O*NET Database `career_interest_types.json`, filtered to `scale_id=OI` and six valid RIASEC numeric ratings. The comparison is Pearson correlation, ordered highest to lowest, limited to 100 careers above an exploratory similarity threshold; it is not equivalent to O*NET API job-zone-specific recommendations or assessment fit labels. Work preparation, regional wages and program links remain separate evidence.

**Privacy:** no student name, ID, or email is collected. Scores are processed on-device and not sent to this site’s server. Optional “remember” storage uses that browser’s local storage and should be avoided on shared campus machines.

## O*NET official script-loader widget

O*NET's current My Account embed can be a two-element snippet: an official `<script src="https://services.onetcenter.org/embed/onet-ip.js?...">` followed by `<div class="embed-onet-ip"></div>`. This is a script loader, not an iframe `src`. The build accepts this exact snippet (or the approved older HTTPS iframe format), validates the host, and publishes a structured widget configuration. It never copies arbitrary HTML into the page. The site mounts the official loader and leaves the official assessment link available as a fallback.

The **existing** GitHub Actions variable `ONET_WIDGET_IFRAME_SRC` is supported for backward compatibility, including a full two-element snippet. However, repository variables are not masked in public workflow logs: use **GitHub Actions secret `ONET_WIDGET_EMBED_CODE`** instead if you want to avoid exposing the embed configuration in build logs, and remove the older variable. If the key in that older variable was sensitive, rotate it in O*NET. The official JavaScript embed key is unavoidably client-visible once the widget loads, so it should be a widget-approved, domain-restricted credential rather than a private server-side API key.

Students complete the official widget on the site but transfer their six RIASEC results into the score-import form below. There is no documented same-origin result handoff through the widget, and the hub does not claim one.
