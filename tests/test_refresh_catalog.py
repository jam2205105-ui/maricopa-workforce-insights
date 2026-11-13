import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import refresh_catalog as c

class OfficialCatalogTests(unittest.TestCase):
    def test_version_discovery(self):
        page='<a href="/dl_files/database/db_30_3_json/occupation_data.json"></a><a href="/dl_files/database/db_31_0_json/occupation_data.json"></a>'
        self.assertEqual(c.release_path(page),'db_31_0_json')
    def test_full_official_dataset_and_unique_soc(self):
        # Synthetic fixtures only, never written as site data.
        occ=[{'onetsoc_code':f'11-{i:04d}.00','title':f'Test Occupation {i}','description':f'Synthetic description {i}'} for i in range(1016)]
        zones=[{'onetsoc_code':'11-0000.00','job_zone':3}]
        titles=[{'onetsoc_code':'11-0000.00','job_title':'Test synonym'}]
        result=c.build_catalog(occ,zones,titles,'TEST',retrieved='TEST')
        self.assertEqual(result['count'],1016)
        self.assertEqual(result['occupations'][0]['jobZone'],3)
        self.assertIn('Test synonym',result['occupations'][0]['aliases'])
        self.assertTrue(all(r['sector']=='Management' for r in result['occupations']))
    def test_duplicate_invalid_code_refused(self):
        occ=[{'onetsoc_code':'11-1011.00','title':'Chief Executives'}]*1016
        with self.assertRaisesRegex(ValueError,'duplicate'):
            c.build_catalog(occ,[],[])
    def test_truncated_data_refused(self):
        with self.assertRaisesRegex(ValueError,'Incomplete'):
            c.build_catalog([{'onetsoc_code':'15-2051.00','title':'Data Scientists'}],[],[])

if __name__=='__main__':unittest.main()

class InterestProfileTransformTests(unittest.TestCase):
    def test_occupational_profile_only_from_six_valid_OI_elements(self):
        names=['Realistic','Investigative','Artistic','Social','Enterprising','Conventional']
        rows=[{'onetsoc_code':'15-2051.00','element_name':name,'scale_id':'OI','data_value':str(1+i)} for i,name in enumerate(names)]
        rows.append({'onetsoc_code':'15-2051.00','element_name':'Social','scale_id':'IH','data_value':'5'})
        profiles=c.build_interest_profiles(rows)
        self.assertEqual(len(profiles),1)
        self.assertEqual(profiles['15-2051.00']['social'],4)
        self.assertEqual(profiles['15-2051.00']['conventional'],6)
    def test_partial_interest_profiles_ignored(self):
        rows=[{'onetsoc_code':'15-2051.00','element_name':'Artistic','scale_id':'OI','data_value':'4'}]
        self.assertFalse(c.build_interest_profiles(rows))
