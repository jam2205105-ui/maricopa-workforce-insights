"""Assemble a deployable, static GitHub Pages site. No secrets or source code shipped.

Never publish a truncated O*NET catalog or missing occupation-interest profiles.
"""
import json
import os
from urllib.parse import urlsplit, parse_qs
from html.parser import HTMLParser
import shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'_site'


class OfficialWidgetSnippet(HTMLParser):
    """Parse the official two-element widget snippet; never emit raw HTML."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags=[]
        self.invalid=False

    def handle_starttag(self, tag, attrs):
        values=dict(attrs)
        if len(values)!=len(attrs):
            self.invalid=True
        if tag=='script' and set(values)=={'src'}:
            self.tags.append(('script',values['src']))
        elif tag=='div' and values=={'class':'embed-onet-ip'}:
            self.tags.append(('div',None))
        else:
            self.invalid=True

    def handle_startendtag(self, tag, attrs):
        self.invalid=True

    def handle_data(self, data):
        if data.strip():
            self.invalid=True

    def handle_comment(self, data):
        self.invalid=True


def approved_widget_config(value):
    """Accept official O*NET script+container snippet or approved HTTPS iframe URL."""
    raw=str(value or '').strip()
    if not raw:
        return {'type':'none','src':''}
    src=raw
    if '<' in raw or '>' in raw:
        parser=OfficialWidgetSnippet()
        parser.feed(raw)
        parser.close()
        if parser.invalid or len(parser.tags)!=2 or parser.tags[0][0]!='script' or parser.tags[1]!=('div',None):
            raise ValueError('Invalid O*NET widget embed; use the exact snippet from My Account.')
        src=parser.tags[0][1]
    parsed=urlsplit(src)
    host=(parsed.hostname or '').lower()
    if parsed.scheme!='https' or parsed.username or parsed.password or parsed.port not in (None,443) or parsed.fragment:
        raise ValueError('Invalid O*NET widget URL; HTTPS without credentials is required.')
    if host=='services.onetcenter.org' and parsed.path=='/embed/onet-ip.js':
        query=parse_qs(parsed.query,keep_blank_values=True)
        if set(query)!={'x-api-key'} or len(query['x-api-key'])!=1 or not query['x-api-key'][0].strip():
            raise ValueError('Invalid official O*NET widget script parameters.')
        return {'type':'script','src':src}
    trusted=('onetcenter.org','onetinterestprofiler.org','mynextmove.org')
    if any(host==d or host.endswith('.'+d) for d in trusted) and '<' not in raw:
        return {'type':'iframe','src':src}
    raise ValueError('Unsupported O*NET embed source.')


def choose_widget_config(*sources):
    """Select the first validated optional widget configuration.

    If a malformed secret exists, allow a separately configured approved public
    widget source. Never print candidate values or credentials.
    """
    for raw in sources:
        if not str(raw or '').strip():
            continue
        try:
            candidate=approved_widget_config(raw)
        except ValueError:
            continue
        if candidate['type']!='none':
            return candidate
    return {'type':'none','src':''}


def approved_widget_url(url):
    """Backward-compatible iframe URL validator."""
    cfg=approved_widget_config(url)
    if cfg['type'] not in ('iframe','none'):
        raise ValueError('Expected an iframe URL, not an O*NET script loader.')
    return cfg['src']

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
    mini_bank=ROOT/'data'/'mini_ip_questions.json'
    if mini_bank.exists():
        from refresh_interest_questions import valid_bank
        if valid_bank(json.loads(mini_bank.read_text(encoding='utf-8'))):
            shutil.copy2(mini_bank,OUT/'data'/'mini_ip_questions.json')
            print('On-site O*NET Mini-IP: 30 validated questions included')
        else:
            print('On-site O*NET Mini-IP: invalid question bank excluded')
    else:
        print('On-site O*NET Mini-IP: question bank unavailable (web-only backup remains available)')
    cfg=json.loads((ROOT/'data'/'student_config.json').read_text(encoding='utf-8'))
    candidates=[
        ('ONET_WIDGET_EMBED_CODE',os.getenv('ONET_WIDGET_EMBED_CODE','')),
        ('ONET_WIDGET_IFRAME_SRC',os.getenv('ONET_WIDGET_IFRAME_SRC','')),
        ('student_config.json',cfg.get('onetWidgetScriptSrc','') or cfg.get('onetWidgetIframeSrc','')),
    ]
    for label, candidate in candidates:
        if not str(candidate or '').strip():
            status='unset'
        else:
            try:
                status='valid' if approved_widget_config(candidate)['type']!='none' else 'unset'
            except ValueError:
                status='invalid; expected official O*NET embed script URL or snippet'
        print(f'O*NET config {label}: {status}')  # no key or code is printed
    widget=choose_widget_config(*(candidate for _, candidate in candidates))
    cfg['onetWidgetIframeSrc']=widget['src'] if widget['type']=='iframe' else ''
    cfg['onetWidgetScriptSrc']=widget['src'] if widget['type']=='script' else ''
    (OUT/'data'/'student_config.json').write_text(json.dumps(cfg,indent=2)+'\n',encoding='utf-8')
    (OUT/'.nojekyll').write_text('',encoding='utf8')
    print(f'GitHub Pages static site ready: {count} occupations, {interest_count} occupational RIASEC profiles; O*NET widget: {widget["type"]}; no API keys or functions in published output.')

if __name__=='__main__':main()