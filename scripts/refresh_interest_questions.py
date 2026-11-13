#!/usr/bin/env python3
"""Fetch unchanged O*NET Mini-IP items for a static on-site questionnaire.

Only activity texts are downloaded. Student answers never leave their browser.
Credentials are used solely by GitHub Actions and are never written to files.
"""
import json
import os
from pathlib import Path
import re
from urllib.parse import parse_qs,urlsplit
import requests

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'data'/'mini_ip_questions.json'
URL='https://api-v2.onetcenter.org/mnm/interestprofiler/questions_30'
AREAS=('realistic','investigative','artistic','social','enterprising','conventional')

def valid_bank(bank):
    questions=bank.get('questions',[]) if isinstance(bank,dict) else []
    if len(questions)!=30:return False
    counts={a:0 for a in AREAS};seen=set()
    for q in questions:
        if not isinstance(q,dict):return False
        i=q.get('index');a=q.get('area');t=q.get('text')
        if not isinstance(i,int) or isinstance(i,bool) or i not in range(1,31) or i in seen or a not in counts or not isinstance(t,str) or not t.strip() or len(t)>250:return False
        counts[a]+=1;seen.add(i)
    return all(counts[a]==5 for a in AREAS)

def extract_widget_api_key(snippet):
    """O*NET public widget credentials may also be authorized for Web Services."""
    urls=re.findall(r'https://services\.onetcenter\.org/embed/onet-ip\.js\?[^\s"\'<>]+',snippet or '')
    for url in urls:
        part=urlsplit(url);keys=parse_qs(part.query).get('x-api-key',[])
        if part.scheme=='https' and part.hostname=='services.onetcenter.org' and len(keys)==1 and keys[0].strip():return keys[0]
    return ''

def fetch_questions(session,key):
    questions=[]
    for start,end in ((1,12),(13,24),(25,30)):
        r=session.get(URL,headers={'X-API-Key':key},params={'start':start,'end':end},timeout=35)
        r.raise_for_status()
        page=r.json();items=page.get('question',[])
        if isinstance(items,dict):items=[items]
        if not isinstance(items,list):raise ValueError('Invalid questions response')
        for item in items:
            questions.append({'index':item.get('index'),'area':str(item.get('area','')).lower(),'text':item.get('text')})
    bank={'source':'O*NET Web Services Mini-IP Questions (30 items)','sourceUrl':URL,
          'licenseUrl':'https://www.onetcenter.org/license_tools.html',
          'note':'Unmodified activity wording; on-site scoring is exploratory and not an official Web Services result.',
          'questions':sorted(questions,key=lambda x:x['index'])}
    if not valid_bank(bank):raise ValueError('Question bank failed completeness checks')
    return bank

def main():
    key=os.getenv('ONET_API_KEY','').strip() or extract_widget_api_key(os.getenv('ONET_WIDGET_EMBED_CODE',''))
    if not key:
        print('O*NET Mini-IP: no authorized Web Services key; prior question bank retained if available.')
        return
    try:bank=fetch_questions(requests.Session(),key)
    except (requests.RequestException,ValueError,TypeError,KeyError) as exc:
        # Never print credential-bearing URLs or response bodies
        print('O*NET Mini-IP: question refresh unavailable ('+type(exc).__name__+'); retaining last verified bank if present.')
        return
    DEST.parent.mkdir(parents=True,exist_ok=True)
    DEST.write_text(json.dumps(bank,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('O*NET Mini-IP: 30 verified questions retrieved; no credentials published.')

if __name__=='__main__':main()
