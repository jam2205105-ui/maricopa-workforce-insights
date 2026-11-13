"""Assemble a deployable, static GitHub Pages site. No secrets or source code shipped.

Never publish a truncated O*NET catalog or missing occupation-interest profiles.
"""
import json
import shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'_site'


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
    for name in ('index.html','styles.css','catalog.js','interest_match.js','mini_ip.js','student.js','app.js'):
        shutil.copy2(ROOT/name,OUT/name)
    shutil.copytree(ROOT/'assets',OUT/'assets')
    (OUT/'data').mkdir()
    for name in ('current.json','catalog.json','occupations.json'):
        shutil.copy2(ROOT/'data'/name,OUT/'data'/name)
    # The assessment must never deploy without its actual questions.
    # Include the validated public activity text inside HTML so opening the
    # assessment does not depend on a second JSON network request.
    mini_bank=ROOT/'data'/'mini_ip_questions.json'
    if not mini_bank.is_file():
        raise SystemExit('Refusing deployment: on-site Mini-IP question bank missing')
    from refresh_interest_questions import valid_bank
    bank=json.loads(mini_bank.read_text(encoding='utf-8'))
    if not valid_bank(bank):
        raise SystemExit('Refusing deployment: on-site Mini-IP question bank incomplete')
    shutil.copy2(mini_bank,OUT/'data'/'mini_ip_questions.json')
    html_file=OUT/'index.html'
    marker='<script id="mini-ip-bank" type="application/json"></script>'
    html=html_file.read_text(encoding='utf-8')
    if html.count(marker)!=1:
        raise SystemExit('Refusing deployment: Mini-IP HTML data placeholder missing')
    safe_json=(json.dumps(bank,ensure_ascii=True,separators=(',',':'))
        .replace('<',chr(92)+'u003c')
        .replace('>',chr(92)+'u003e')
        .replace('&',chr(92)+'u0026'))
    html_file.write_text(html.replace(marker,marker.replace('</script>',safe_json+'</script>')),encoding='utf-8')
    print('On-site O*NET Mini-IP: 30 verified questions embedded in HTML and mirrored as JSON')
    (OUT/'.nojekyll').write_text('',encoding='utf8')
    print(f'GitHub Pages static site ready: {count} occupations, {interest_count} occupational RIASEC profiles; on-site Mini-IP only; no API keys or functions in published output.')

if __name__=='__main__':main()