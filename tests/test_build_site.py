"""Regression checks for the student assessment's on-site-only experience."""
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class StudentAssessmentBuildTests(unittest.TestCase):
    def test_on_site_assessment_and_score_import_remain(self):
        html=(ROOT/'index.html').read_text(encoding='utf-8')
        self.assertIn('id="start-mini-ip" class="button primary" type="button"',html)
        self.assertIn('id="mini-ip-panel"',html)
        self.assertIn('id="interest-import-form"',html)
        self.assertIn('id="riasec-inputs"',html)

    def test_no_hosted_widget_controls_or_loader(self):
        html=(ROOT/'index.html').read_text(encoding='utf-8')
        js=(ROOT/'student.js').read_text(encoding='utf-8')
        build=(ROOT/'scripts'/'build_site.py').read_text(encoding='utf-8')
        for token in ('show-hosted-profiler','onet-widget-container','onet-widget-help','onet-widget-status','Use hosted O*NET widget'):
            self.assertNotIn(token,html)
        for token in ('configureWidget','widgetLoadStarted',"setAssessMode('widget')",'onetWidgetScriptSrc','show-hosted-profiler'):
            self.assertNotIn(token,js)
        self.assertNotIn('student_config.json',build)
        self.assertNotIn('ONET_WIDGET_EMBED_CODE',build)

if __name__=='__main__':
    unittest.main()
