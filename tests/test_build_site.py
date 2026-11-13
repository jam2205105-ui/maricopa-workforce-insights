import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from build_site import approved_widget_url


class WidgetBuildTest(unittest.TestCase):
    def test_official_assessment_without_credentials(self):
        html=(ROOT/'index.html').read_text(encoding='utf-8')
        self.assertIn('href="https://onetinterestprofiler.org/"',html)
        self.assertNotIn('Hosted widget not yet configured',html)
        self.assertIn('id="onet-widget-container" class="widget-container" hidden',html)

    def test_widget_url_requires_official_https_hostname(self):
        self.assertEqual(approved_widget_url('https://www.mynextmove.org/explore/ip'), 'https://www.mynextmove.org/explore/ip')
        self.assertEqual(approved_widget_url('https://widget.onetcenter.org/ip?a=1'), 'https://widget.onetcenter.org/ip?a=1')
        self.assertEqual(approved_widget_url(''), '')
        for bad in ['https://evil.example.org/form','javascript:alert(1)','http://onetcenter.org/','https://onetcenter.org.evil.org/','https://user:pass@onetcenter.org/ip','https://onetcenter.org:8181/ip']:
            with self.subTest(url=bad), self.assertRaises(ValueError):
                approved_widget_url(bad)

if __name__=='__main__':
    unittest.main()
