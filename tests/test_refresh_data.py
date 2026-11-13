import io
import json
import sys
import unittest
import zipfile
from pathlib import Path
from unittest.mock import Mock, patch
from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import refresh_data as m


class BLSParserTests(unittest.TestCase):
    def test_months_sort_and_annual_observations_excluded(self):
        payload={
            'status':'REQUEST_SUCCEEDED',
            'Results':{'series':[{'seriesID':'abc','data':[
                {'year':'2026','period':'M04','value':'3.4'},
                {'year':'2025','period':'M12','value':'3.7'},
                {'year':'2026','period':'M01','value':'3.3'},
                {'year':'2026','period':'M13','value':'99'},
                {'year':'2026','period':'M05','value':'-'},
            ]}]}}
        rows=m.parse_bls_series(payload)['abc']
        self.assertEqual([r['period'] for r in rows],['2025-12','2026-01','2026-04'])
        self.assertEqual(rows[-1]['value'],3.4)

    def test_bad_status_raises(self):
        with self.assertRaises(ValueError):
            m.parse_bls_series({'status':'REQUEST_FAILED'})

    def test_suppressed_values_remain_unknown(self):
        for v in ('#','*','-','N/A',None,''):
            self.assertIsNone(m.numeric(v))
        self.assertEqual(m.numeric('46,280'),46280)
        self.assertIsNone(m.numeric('1.5',minimum=10))

    def test_bls_failed_connection_preserves_previous(self):
        data={'sources':{},'metrics':{'unemployment':{'value':3.5}},'trends':{},'occupations':{},'census':{}}
        session=Mock()
        session.post.side_effect=m.requests.RequestException('test outage')
        m.update_bls(data,session)
        self.assertEqual(data['metrics']['unemployment']['value'],3.5)
        self.assertEqual(data['sources']['bls_lau']['status'],'error')

    def test_bls_good_response_updates_both_series(self):
        data={'sources':{},'metrics':{},'trends':{}}
        session=Mock()
        response=Mock()
        response.json.return_value={'status':'REQUEST_SUCCEEDED','Results':{'series':[
            {'seriesID':m.SERIES_IDS['unemployment'],'data':[{'year':'2026','period':'M10','value':'3.7'},{'year':'2026','period':'M09','value':'3.6'}]},
            {'seriesID':m.SERIES_IDS['jobs'],'data':[{'year':'2026','period':'M10','value':'2500.0'},{'year':'2026','period':'M09','value':'2490'}]}
        ]}}
        session.post.return_value=response
        m.update_bls(data,session)
        self.assertEqual(data['metrics']['jobs']['value'],2500)
        self.assertEqual(data['metrics']['unemployment']['period'],'2026-10')
        self.assertEqual(data['sources']['bls_ces']['status'],'ok')

    def test_industry_yoy_is_same_month_prior_year(self):
        data={'sources':{},'metrics':{},'trends':{},'industryMetrics':{}}
        series=[]
        for idx, sid in enumerate(list(m.SERIES_IDS.values())+list(m.INDUSTRY_SERIES.values())):
            values=(('3.6','3.5') if idx==0 else ('2500','2490') if idx==1 else ('110','100'))
            series.append({'seriesID':sid,'data':[{'year':'2026','period':'M10','value':values[0]},{'year':'2025','period':'M10','value':values[1]}]})
        response=Mock();response.json.return_value={'status':'REQUEST_SUCCEEDED','Results':{'series':series}}
        session=Mock();session.post.return_value=response
        m.update_bls(data,session)
        self.assertEqual(data['sources']['bls_industry']['status'],'ok')
        self.assertEqual(data['industryMetrics']['Construction']['yoyPercent'],10.0)
        self.assertEqual(len(data['industryMetrics']),6)


class OEWSParserTests(unittest.TestCase):
    def workbook_archive(self):
        wb=Workbook();ws=wb.active
        ws.append(['Publication test fixture — NOT REAL DATA'])
        ws.append(['AREA','AREA_TITLE','OCC_CODE','OCC_GROUP','TOT_EMP','A_MEDIAN','A_PCT10','A_PCT90','H_MEDIAN'])
        ws.append([38060,'Phoenix', '29-1141','detailed','44520','92620','65000','120000','44.53'])
        ws.append([38060,'Phoenix','15-1212','detailed','1800','*','60000','185000','*'])
        ws.append([38060,'Phoenix','00-0000','total','2500000','54520','29200','120000','26.21'])
        ws.append([99999,'Other','29-1141','detailed','5000','88000','55000','99000','40'])
        buffer=io.BytesIO();wb.save(buffer)
        archive=io.BytesIO()
        with zipfile.ZipFile(archive,'w') as z:
            z.writestr('fake_metropolitan.xlsx',buffer.getvalue())
        return archive.getvalue()

    def test_valid_metropolitan_rows_and_suppression(self):
        rows=m.parse_oews_workbook(self.workbook_archive(), {'29-1141','15-1212','00-0000'})
        self.assertEqual(set(rows),{'29-1141','15-1212','00-0000'})
        self.assertEqual(rows['29-1141']['annualMedian'],92620)
        self.assertEqual(rows['29-1141']['employment'],44520)
        self.assertIsNone(rows['15-1212']['annualMedian'])

    def test_zip_without_workbook_fails(self):
        archive=io.BytesIO()
        with zipfile.ZipFile(archive,'w') as z:z.writestr('note.txt','bad')
        with self.assertRaises(ValueError):m.parse_oews_workbook(archive.getvalue(),{'29-1141'})


if __name__=='__main__': unittest.main()
