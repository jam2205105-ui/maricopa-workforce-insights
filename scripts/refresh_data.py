#!/usr/bin/env python3
"""Refresh official BLS + optional Census snapshots for a static LMI site.

Run from the repository root: python scripts/refresh_data.py
No sample/fallback employment or wages are inserted. A failed source never deletes
last-good observations; instead its status records the error for transparency.
"""
from __future__ import annotations

import datetime as dt
import io
import json
import logging
import os
from pathlib import Path
import re
import sys
import zipfile
from typing import Any

import requests
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_PATH = ROOT / 'data' / 'current.json'
CATALOG_PATH = ROOT / 'data' / 'catalog.json'
OCCUPATIONS_PATH = ROOT / 'data' / 'occupations.json'
NOW = dt.datetime.now(dt.timezone.utc)
USER_AGENT = 'Maricopa-Workforce-Insights-Demo/1.0 (public-source data client; https://www.bls.gov/developers/)'
BLS_ENDPOINT = 'https://api.bls.gov/publicAPI/v2/timeseries/data/'
OEWS_TABLES = 'https://www.bls.gov/oes/tables.htm'
OEWS_AREA_CODE = '0038060'  # OEWS seven-digit code; Phoenix–Mesa–Chandler includes Maricopa + Pinal
SERIES_IDS = {
    'unemployment': 'LAUCN040130000000003',  # Maricopa County, unadjusted unemployment rate
    'jobs': 'SMS04380600000000001',         # Phoenix metro, SA total nonfarm jobs (thousands)
}
INDUSTRY_SERIES = {  # BLS CES, NOT seasonally adjusted, metro employment in thousands
    'Construction': 'SMU04380602000000001',
    'Manufacturing': 'SMU04380603000000001',
    'Financial activities': 'SMU04380605500000001',
    'Professional and business services': 'SMU04380606000000001',
    'Health care and social assistance': 'SMU04380606562000001',
    'Leisure and hospitality': 'SMU04380607000000001',
}


def get_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({'User-Agent': USER_AGENT, 'Accept': '*/*'})
    return session


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json_atomic(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + '\n', encoding='utf-8')
    tmp.replace(path)


def date_label(value: str) -> str:
    date = dt.date.fromisoformat(value + '-01')
    return date.strftime('%b %Y')


def numeric(value: Any, minimum: float | None = None, maximum: float | None = None):
    if value is None or isinstance(value, bool):
        return None
    val = str(value).strip().replace(',', '').replace('$', '')
    if val in ('', '#', '*', '**', 'N/A', 'nan', '-', '—', 'None'):
        return None
    try:
        parsed = float(val)
        if not (float('-inf') < parsed < float('inf')):
            return None
        if minimum is not None and parsed < minimum:
            return None
        if maximum is not None and parsed > maximum:
            return None
        return int(parsed) if parsed.is_integer() else parsed
    except ValueError:
        return None


def parse_bls_series(payload: dict) -> dict[str, list[dict]]:
    """Extract monthly observations only. Sort by period ascending."""
    if payload.get('status') != 'REQUEST_SUCCEEDED':
        raise ValueError(f"BLS did not succeed: {payload.get('status')} {payload.get('message')}")
    output: dict[str, list[dict]] = {}
    for series in payload.get('Results', {}).get('series', []):
        sid = series.get('seriesID')
        if not sid:
            continue
        points = []
        for d in series.get('data', []):
            year = str(d.get('year', ''))
            period = str(d.get('period', ''))
            if not (re.fullmatch(r'20\d{2}', year) and re.fullmatch(r'M(0[1-9]|1[0-2])', period)):
                continue
            value = numeric(d.get('value'))
            if value is None:
                continue
            points.append({'period': f'{year}-{period[1:]}', 'value': value})
        output[sid] = sorted({p['period']: p for p in points}.values(), key=lambda p: p['period'])[-25:]
    return output


def fetch_bls_series(session: requests.Session) -> dict:
    startyear = str(NOW.year - 2)
    body = {'seriesid': list(SERIES_IDS.values()) + list(INDUSTRY_SERIES.values()), 'startyear': startyear, 'endyear': str(NOW.year)}
    key = os.getenv('BLS_API_KEY', '').strip()
    if key:
        body['registrationkey'] = key
    response = session.post(BLS_ENDPOINT, json=body, timeout=45)
    response.raise_for_status()
    return parse_bls_series(response.json())


def update_bls(data: dict, session: requests.Session) -> None:
    data.setdefault('industryMetrics', {})
    try:
        fetched = fetch_bls_series(session)
    except (requests.RequestException, ValueError, KeyError) as exc:
        for name, source in (('unemployment','bls_lau'),('jobs','bls_ces'),('industries','bls_industry')):
            data['sources'][source] = {'status':'error','period':data.get('metrics', {}).get(name, {}).get('periodLabel'),'note':f'Update failed; retaining last verified values: {str(exc)[:180]}'}
        return
    for name, source in (('unemployment','bls_lau'),('jobs','bls_ces')):
        points = fetched.get(SERIES_IDS[name], [])
        if len(points) < 2:
            data['sources'][source] = {'status':'error', 'note':'BLS returned fewer than two monthly points; previous values retained.'}
            continue
        latest=points[-1]
        value=latest['value']
        # Known units: percent and thousands respectively. Enforce plausible bounds, not forecasts.
        if not (0 <= value <= 30) if name == 'unemployment' else not (500 <= value <= 10000):
            data['sources'][source] = {'status':'error','note':f'BLS value failed expected-range check for {name}.'}
            continue
        previous_period=data.get('metrics', {}).get(name, {}).get('period')
        if previous_period and latest['period'] < previous_period:
            data['sources'][source]={'status':'error','note':'Source period unexpectedly moved backwards; retained previously published values.'}
            continue
        data['metrics'][name]={'value':value,'period':latest['period'],'periodLabel':date_label(latest['period']),'seriesId':SERIES_IDS[name], 'unit':'percent' if name == 'unemployment' else 'thousands'}
        data['trends'][name]=[dict(p,periodLabel=date_label(p['period'])) for p in points[-13:]]
        data['sources'][source]={'status':'ok','period':date_label(latest['period']), 'fetchedAt':NOW.isoformat(), 'note': 'Latest published monthly observation; subject to BLS revision.'}
    industry_count = 0
    for label, series_id in INDUSTRY_SERIES.items():
        points=fetched.get(series_id, [])
        if not points:
            continue
        latest=points[-1]
        value=latest['value']
        if not (0 <= value <= 2000):
            continue
        prior_period=data.get('industryMetrics',{}).get(label,{}).get('period')
        if prior_period and prior_period>latest['period']:
            continue
        prior_year=next((p for p in reversed(points) if p['period']==f'{int(latest["period"][:4])-1}{latest["period"][4:]}'),None)
        yoy=round((value/prior_year['value']-1)*100,1) if prior_year and prior_year['value']>0 else None
        data['industryMetrics'][label]={'value':value,'period':latest['period'],'periodLabel':date_label(latest['period']),'yoyPercent':yoy,'unit':'thousands','seriesId':series_id}
        industry_count+=1
    data['sources']['bls_industry']={
        'status':'ok' if industry_count==len(INDUSTRY_SERIES) else 'error',
        'period':date_label(max((r['period'] for r in data['industryMetrics'].values()),default='2025-01')) if data['industryMetrics'] else None,
        'note':f'{industry_count}/{len(INDUSTRY_SERIES)} metro industry series refreshed; industry observations are not seasonally adjusted.'
    }


def latest_oews_vintage(session: requests.Session) -> int:
    response=session.get(OEWS_TABLES,timeout=35)
    response.raise_for_status()
    # Official tables list the newest May release first. This avoids hard-coding the year.
    hits=re.findall(r'May\s+(20\d{2})',response.text,flags=re.I)
    valid=[int(v) for v in hits if 2019 <= int(v) <= NOW.year]
    if not valid:
        raise ValueError('No annual OEWS vintage found on the BLS tables page')
    return max(valid)


def normalize_oews_area(value: Any) -> str:
    """Preserve BLS OEWS seven-digit areas, including leading zeroes.

    XLSX may store 0038060 as the number 38060; BLS CES series instead use
    the five-digit MSA code. Never compare those two representations raw.
    """
    if value is None or isinstance(value, bool):
        return ''
    area = str(value).strip()
    if area.endswith('.0'):
        area = area[:-2]
    return area.zfill(7) if area.isdecimal() and len(area) <= 7 else area


def parse_oews_workbook(content: bytes, requested_soc: set[str]) -> dict[str, dict]:
    """Read official metro OEWS ZIP archives (possibly multiple XLSX files).

    BLS area 0038060 is Phoenix–Mesa–Chandler; the five-digit MSA number
    38060 may appear in spreadsheets as a numeric cell with its zeros dropped.
    Return reported statistics only, preserving BLS suppressed values as null.
    """
    results: dict[str, dict] = {}
    sampled_areas: set[str] = set()
    scanned_sheets = 0
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            members = [name for name in archive.namelist()
                       if name.lower().endswith('.xlsx')
                       and not name.startswith('__MACOSX/')
                       and not Path(name).name.startswith('~$')]
            if not members:
                raise ValueError('OEWS archive contains no XLSX workbook')
            # The BLS metro archive may also contain nonmetropolitan workbooks.
            members.sort(key=lambda name: (not Path(name).name.upper().startswith('MSA_'), name))
            for filename in members:
                book = load_workbook(io.BytesIO(archive.read(filename)), read_only=True, data_only=True)
                try:
                    for ws in book.worksheets:
                        iterator = ws.iter_rows(values_only=True)
                        columns = None
                        for row in iterator:
                            probe = [str(v).strip().upper().replace(' ', '_') if v is not None else '' for v in row]
                            if {'AREA', 'OCC_CODE', 'A_MEDIAN'}.issubset(probe):
                                columns = {name: i for i, name in enumerate(probe)}
                                break
                        if columns is None:
                            continue  # notes/metadata sheet, or unrelated workbook
                        scanned_sheets += 1

                        def cell(row, key):
                            idx = columns.get(key)
                            return row[idx] if idx is not None and idx < len(row) else None

                        for row in iterator:
                            area = normalize_oews_area(cell(row, 'AREA'))
                            if len(sampled_areas) < 12 and area:
                                sampled_areas.add(area)
                            if area != OEWS_AREA_CODE:
                                continue
                            soc = str(cell(row, 'OCC_CODE') or '').strip()
                            if soc not in requested_soc:
                                continue
                            group = str(cell(row, 'OCC_GROUP') or '').lower().strip()
                            if group and soc != '00-0000' and group not in ('detailed', 'detail'):
                                continue
                            employment = numeric(cell(row, 'TOT_EMP'), 0, 20_000_000)
                            median = numeric(cell(row, 'A_MEDIAN'), 5000, 1_000_000)
                            p10 = numeric(cell(row, 'A_PCT10'), 1000, 1_000_000)
                            p90 = numeric(cell(row, 'A_PCT90'), 1000, 2_000_000)
                            hourly = numeric(cell(row, 'H_MEDIAN'), 1, 1000)
                            if all(v is None for v in (employment, median, p10, p90, hourly)):
                                continue
                            results[soc] = {
                                'employment': employment, 'annualMedian': median,
                                'annualP10': p10, 'annualP90': p90,
                                'hourlyMedian': hourly, 'soc': soc,
                                'area': 'Phoenix–Mesa–Chandler, AZ MSA'
                            }
                finally:
                    book.close()
    except zipfile.BadZipFile as exc:
        raise ValueError('Downloaded OEWS archive is not a valid ZIP') from exc
    if not results:
        raise ValueError(
            f'No Phoenix OEWS rows for area {OEWS_AREA_CODE}; '
            f'checked {scanned_sheets} data sheets, sample area codes '
            f'{sorted(sampled_areas)[:10]}'
        )
    return results


def update_oews(data: dict, session: requests.Session, selected_soc: set[str]) -> None:
    try:
        year=latest_oews_vintage(session)
        # This dataset is published once annually. Existing observations for the same vintage
        # are retained instead of repeatedly downloading a large file every day.
        if str(data.get('oewsPeriod','')) == str(year) and len(data.get('occupations',{})) >= max(2,len(selected_soc)//3):
            data['sources']['bls_oews']={'status':'ok','period':f'May {year}','note':'Previously fetched official vintage is still the newest published OEWS release.', 'fetchedAt':data.get('oewsFetchedAt')}
            return
        url=f'https://www.bls.gov/oes/special-requests/oesm{str(year)[-2:]}ma.zip'
        response=session.get(url,timeout=100)
        response.raise_for_status()
        if len(response.content) < 20_000:
            raise ValueError('OEWS download unexpectedly small')
        records=parse_oews_workbook(response.content,selected_soc|{'00-0000'})
        # Require genuine breadth, rather than publishing a damaged partial workbook.
        if len(records) < max(4,len(selected_soc)//4):
            raise ValueError(f'Only {len(records)} SOC records returned; expected substantially more')
        prior_year=data.get('oewsPeriod')
        if prior_year and int(prior_year)>year:
            raise ValueError('The OEWS release year regressed')
        data['occupations']=records
        data['oewsPeriod']=str(year)
        data['oewsFetchedAt']=NOW.isoformat()
        data['sources']['bls_oews']={'status':'ok','period':f'May {year}', 'fetchedAt':NOW.isoformat(), 'note':f'{len(records)} selected Phoenix–Mesa–Chandler metro occupation rows fetched from official OEWS May {year}.'}
    except (requests.RequestException,ValueError,KeyError,zipfile.BadZipFile) as exc:
        logging.warning('BLS OEWS update failed: %s', exc)
        data['sources']['bls_oews']={'status':'error','period':f"May {data.get('oewsPeriod')}" if data.get('oewsPeriod') else None,'note':f'Refresh failed; retaining last verified wages if present: {str(exc)[:180]}'}


def update_census(data: dict, session: requests.Session) -> None:
    key=os.getenv('CENSUS_API_KEY','').strip()
    if not key:
        data['sources']['census']={'status':'skipped','note':'Optional ACS feed is disabled until CENSUS_API_KEY is configured.'}
        return
    # ACS 1-year for Maricopa County; publication years typically lag by 1 year.
    for year in (NOW.year-1,NOW.year-2):
        try:
            response=session.get(f'https://api.census.gov/data/{year}/acs/acs1',params={'get':'NAME,B01003_001E,B19013_001E','for':'county:013','in':'state:04','key':key},timeout=35)
            response.raise_for_status()
            rows=response.json()
            if len(rows)<2:
                raise ValueError('Missing data rows')
            row=dict(zip(rows[0],rows[1]))
            population=numeric(row['B01003_001E'],100_000,15_000_000)
            median_income=numeric(row['B19013_001E'],10_000,1_000_000)
            if population is None or median_income is None:
                raise ValueError('ACS values missing or outside expected range')
            if data.get('census',{}).get('year',0)>year:
                raise ValueError('ACS reporting year regressed')
            data['census']={'year':year,'geography':'Maricopa County, AZ', 'population':population,'medianHouseholdIncome':median_income}
            data['sources']['census']={'status':'ok','period':str(year), 'fetchedAt':NOW.isoformat(), 'note':'ACS 1-year county estimates; household income is not individual worker pay.'}
            return
        except (requests.RequestException,ValueError,KeyError,IndexError,TypeError) as exc:
            logging.warning('ACS %s unavailable: %s',year,exc)
    data['sources']['census']={'status':'error','period':str(data.get('census',{}).get('year','')),'note':'ACS fetch failed; previous validated values retained. Check API key and dataset vintage.'}


def main() -> int:
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    data=load_json(SNAPSHOT_PATH, {'schemaVersion':1})
    catalog=load_json(CATALOG_PATH, {'careers':[]})
    official=load_json(OCCUPATIONS_PATH, {'occupations':[]})
    # Full OEWS coverage, not just the original 24 editorial program pathways.
    requested_soc={str(c['soc']) for c in catalog.get('careers',[]) if c.get('soc')}
    requested_soc.update(str(c['soc']) for c in official.get('occupations',[]) if c.get('soc'))
    for key in ('metrics','trends','occupations','census','sources','industryMetrics'):
        data.setdefault(key,{})
    if not requested_soc:
        logging.error('Career catalog empty; refusing to refresh.')
        return 2
    session=get_session()
    update_bls(data,session)
    update_oews(data,session,requested_soc)
    update_census(data,session)
    data['schemaVersion']=1
    data['generatedAt']=NOW.isoformat()
    save_json_atomic(SNAPSHOT_PATH,data)
    logging.info('Published %s | %s',SNAPSHOT_PATH,{k:v.get('status') for k,v in data['sources'].items()})
    # Write the report even if one external source is down, but a completely failed
    # first run must fail CI so it cannot be mistaken for a live deployment.
    has_public_data=bool(data.get('metrics') or data.get('occupations'))
    return 0 if has_public_data else 1


if __name__=='__main__':
    sys.exit(main())