import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from refresh_interest_questions import valid_bank,extract_widget_api_key,fetch_questions
class FakeResp:
    def __init__(self,rows):self.rows=rows
    def raise_for_status(self):pass
    def json(self):return {'question':self.rows}
class FakeSession:
    def get(self,url,headers,params,timeout):
        assert headers['X-API-Key']=='TEST_KEY'
        areas=('realistic','investigative','artistic','social','enterprising','conventional')
        return FakeResp([{'index':i,'area':areas[(i-1)%6],'text':f'Activity {i}'} for i in range(params['start'],params['end']+1)])
class MiniIPTests(unittest.TestCase):
    def test_validation(self):
        bank=fetch_questions(FakeSession(),'TEST_KEY')
        self.assertTrue(valid_bank(bank))
        self.assertNotIn('TEST_KEY',str(bank))
        self.assertFalse(valid_bank({'questions':bank['questions'][:-1]}))
    def test_credential_extraction(self):
        source='<script src="https://services.onetcenter.org/embed/onet-ip.js?x-api-key=TEST_KEY"></script>'
        self.assertEqual(extract_widget_api_key(source),'TEST_KEY')
        self.assertEqual(extract_widget_api_key('https://other.invalid/?x-api-key=TEST_KEY'),'')
if __name__=='__main__':unittest.main()
