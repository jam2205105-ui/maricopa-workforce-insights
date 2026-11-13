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
    if OUT.exists():shutil.rmtree(OUT)
    OUT.mkdir()
    for name in ('index.html','styles.css','catalog.js','interest_match.js','student.js','app.js'):
        shutil.copy2(ROOT/name,OUT/name)
    shutil.copytree(ROOT/'assets',OUT/'assets')
    (OUT/'data').mkdir()
    for name in ('current.json','catalog.json','occupations.json','student_config.json'):
        shutil.copy2(ROOT/'data'/name,OUT/'data'/name)
    (OUT/'.nojekyll').write_text('',encoding='utf8')
    print(f'GitHub Pages static site ready: {count} occupations, {interest_count} occupational RIASEC profiles; no API keys or functions in published output.')

if __name__=='__main__':main()
