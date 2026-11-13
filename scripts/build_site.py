"""Assemble a deployable, static GitHub Pages site. No secrets or source code shipped.

Never publish a truncated O*NET catalog or missing occupation-interest profiles.
"""
import json
import os
from urllib.parse import urlsplit
import shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'_site'


def approved_widget_url(url):
    """Validate public HTTPS iframe URLs from O*NET My Account."""
    value=str(url or '').strip()
    if not value:
        return ''
    parsed=urlsplit(value)
    host=(parsed.hostname or '').lower()
    trusted=('onetcenter.org','onetinterestprofiler.org','mynextmove.org')
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443) or not any(host==domain or host.endswith('.'+domain) for domain in trusted):
        raise ValueError('Invalid ONET_WIDGET_IFRAME_SRC: provide the HTTPS iframe src from O*NET My Account, never an API key or unrelated URL.')
    return value

def main():
    catalog=json.loads((ROOT/'data/occupations.json').read_text(encoding='utf-8'))
    occupations=catalog.get('occupations', [])
    count=catalog.get('count', 0)
    interest_count=sum(1 for item in occupations if item.get('interestProfile'))
    if count != len(occupations) or not 950 <= count <= 1300:
        raise SystemExit('Refusing incomplete O*NET occupational catalog deployment')
    if interest_count < 800:
        raise SystemExit('Refusing deployment without enough complete RIASEC occupational profiles')
    snapshot=json.loads((ROOT/'data/current.json').read_text(encoding='utf-8'))
    if len(snapshot.get('occupations', {})) < 100 or not snapshot.get('oewsPeriod'):
        raise SystemExit('Refusing deployment without verified Phoenix OEWS wages. Check BLS refresh and archived snapshot.')
    if not snapshot.get('metrics', {}).get('unemployment') or not snapshot.get('metrics', {}).get('jobs'):
        raise SystemExit('Refusing deployment without published BLS unemployment and payroll indicators')
    if OUT.exists():shutil.rmtree(OUT)
    OUT.mkdir()
    for name in ('index.html','styles.css','catalog.js','interest_match.js','student.js','app.js'):
        shutil.copy2(ROOT/name,OUT/name)
    shutil.copytree(ROOT/'assets',OUT/'assets')
    (OUT/'data').mkdir()
    for name in ('current.json','catalog.json','occupations.json'):
        shutil.copy2(ROOT/'data'/name,OUT/'data'/name)
    cfg=json.loads((ROOT/'data'/'student_config.json').read_text(encoding='utf-8'))
    try:
        embed=approved_widget_url(os.getenv('ONET_WIDGET_IFRAME_SRC','') or cfg.get('onetWidgetIframeSrc',''))
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    cfg['onetWidgetIframeSrc']=embed
    (OUT/'data'/'student_config.json').write_text(json.dumps(cfg,indent=2)+'\n',encoding='utf-8')
    (OUT/'.nojekyll').write_text('',encoding='utf8')
    print(f'GitHub Pages static site ready: {count} occupations, {interest_count} occupational RIASEC profiles; no API keys or functions in published output.')

if __name__=='__main__':main()