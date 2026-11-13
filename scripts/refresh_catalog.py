"""Build the full student catalog from the official O*NET Database JSON release.

No O*NET API key required. Never synthesize occupation codes or titles.
The locally curated 24 program connections are kept separate and labeled editorial.
One publication is written atomically only after all validations pass.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import requests

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data' / 'occupations.json'
INDEX = 'https://www.onetcenter.org/database.html'
RELEASE = '31_0'
SOC = re.compile(r'^\d{2}-\d{4}\.\d{2}$')
SECTORS = {
 '11':'Management', '13':'Business & Finance', '15':'Technology & Data',
 '17':'Engineering & Architecture','19':'Science & Research',
 '21':'Community & Social Services','23':'Legal', '25':'Education & Library',
 '27':'Arts, Media & Design','29':'Healthcare', '31':'Healthcare Support',
 '33':'Public Safety', '35':'Food & Hospitality', '37':'Cleaning & Grounds',
 '39':'Personal Care & Services','41':'Sales', '43':'Office & Administration',
 '45':'Agriculture & Natural Resources','47':'Construction & Trades',
 '49':'Installation & Repair', '51':'Manufacturing & Production',
 '53':'Transportation & Logistics', '55':'Military'
}

def release_path(page: str) -> str:
    # O*NET 31.0 is the verified current release on 2026-11-13.
    # This regex permits future releases without hardcoding publication dates.
    versions = re.findall(r'dl_files/database/(db_(\d+)_(\d+)_json)/occupation_data\.json', page, re.I)
    if versions:
        versions.sort(key=lambda a:(int(a[1]),int(a[2])), reverse=True)
        return versions[0][0]
    return 'db_' + RELEASE + '_json'

def fetch_json(session, root, basename):
    url = f'https://www.onetcenter.org/dl_files/database/{root}/{basename}.json'
    response = session.get(url, timeout=90)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict) or not isinstance(data.get('row'), list):
        raise ValueError(f'Unexpected O*NET format: {basename}')
    return data['row']

INTEREST_NAMES = ('realistic','investigative','artistic','social','enterprising','conventional')

def build_interest_profiles(rows):
    """Extract six complete RIASEC ratings per O*NET-SOC from the OI scale.

    Missing/suppressed ratings remain absent. The public occupational ratings
    are *not* the Interest Profiler questionnaire or official career fit labels.
    """
    if not isinstance(rows, list):
        raise ValueError('Career interest ratings must be a list')
    profiles = {}
    for item in rows:
        code = str(item.get('onetsoc_code') or '')
        name = str(item.get('element_name') or '').strip().lower()
        if not SOC.fullmatch(code) or item.get('scale_id') != 'OI' or name not in INTEREST_NAMES:
            continue
        try:
            rating = float(item.get('data_value'))
        except (ValueError, TypeError):
            continue
        if not 1 <= rating <= 7: continue
        profiles.setdefault(code, {})[name] = round(rating, 2)
    return {code:vals for code,vals in profiles.items() if all(k in vals for k in INTEREST_NAMES)}

def build_catalog(occupations, zones, job_titles, source_version='31.0', retrieved=None, interest_rows=None):
    """Pure transform, testable with fixtures; never fabricates missing fields."""
    if not isinstance(occupations,list): raise ValueError('O*NET occupations must be a list')
    zone_map = {r.get('onetsoc_code'):int(r['job_zone']) for r in zones if str(r.get('job_zone','')).isdigit()}
    aliases = {}
    for r in job_titles:
        code = r.get('onetsoc_code')
        name = (r.get('short_title') or r.get('job_title') or '').strip()
        if not name or len(name)>200 or not SOC.fullmatch(str(code)):continue
        aliases.setdefault(code, set()).add(name)
    interest_profiles=build_interest_profiles(interest_rows or [])
    result=[]
    seen=set()
    for r in occupations:
        code=str(r.get('onetsoc_code') or '')
        title=str(r.get('title') or '').strip()
        summary=str(r.get('description') or '').strip()
        if not SOC.fullmatch(code) or not title or code in seen:raise ValueError(f'Invalid/duplicate O*NET occupation: {code!r}')
        seen.add(code)
        sector=SECTORS.get(code[:2], 'Other occupations')
        item={'key':code,'soc':code[:7],'title':title,'summary':summary,'sector':sector}
        if zone_map.get(code) in {1,2,3,4,5}:item['jobZone']=zone_map[code]
        # Store at most 16 alternate titles per career to keep browser search snappy.
        names=sorted(x for x in aliases.get(code,set()) if x.casefold()!=title.casefold())
        if names:item['aliases']=names[:16]
        if code in interest_profiles:item['interestProfile']=interest_profiles[code]
        result.append(item)
    if len(result)<950 or len(result)>1300:raise ValueError(f'Incomplete O*NET release: {len(result)} occupations')
    result.sort(key=lambda o:(o['title'].casefold(),o['key']))
    return {'schemaVersion':2, 'source':'O*NET Database', 'release':source_version,
            'license':'CC BY 4.0 (see https://www.onetcenter.org/database.html)',
            'retrievedAt':retrieved or dt.datetime.now(dt.timezone.utc).isoformat(),
            'count':len(result),'interestProfileCount':sum('interestProfile' in r for r in result),'occupations':result}

def main():
    s=requests.Session();s.headers.update({'User-Agent':'MaricopaWorkforceInsights/0.4 public data updater','Accept':'application/json, text/html'})
    version=os.getenv('ONET_DATABASE_VERSION','').strip()
    if version:
        if not re.fullmatch(r'\d+\.\d+',version):raise ValueError('ONET_DATABASE_VERSION expected e.g. 31.0')
        root='db_'+version.replace('.','_')+'_json'
    else:
        page=s.get(INDEX,timeout=25);page.raise_for_status()
        root=release_path(page.text)
        version='.'.join(root[3:-5].split('_'))
    occ=fetch_json(s,root,'occupation_data')
    zones=fetch_json(s,root,'job_zones')
    try:
        titles=fetch_json(s,root,'job_titles')
    except (requests.RequestException,ValueError) as exc:
        print(f'Alternate job title feed unavailable; official occupation list still usable: {exc}',file=sys.stderr)
        titles=[]
    # Version 30.3+ renamed the public 'Interests' file to Career Interest Types.
    interests=fetch_json(s,root,'career_interest_types')
    data=build_catalog(occ,zones,titles,version,interest_rows=interests)
    # Do not publish a silently broken interest matching directory.
    if data['interestProfileCount'] < 800:
        raise ValueError(f"Too few complete occupational interest profiles ({data['interestProfileCount']})")
    temp=OUTPUT.with_suffix('.json.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8');temp.replace(OUTPUT)
    print(f'Published {data["count"]} verified occupations, {data["interestProfileCount"]} complete interest profiles from O*NET {data["release"]} in {OUTPUT}')
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,requests.RequestException) as exc:
        print(f'Catalog refresh failed; previously published catalog was not overwritten: {exc}',file=sys.stderr);sys.exit(1)
