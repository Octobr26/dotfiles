"""Check Jev skill candidates and session binding."""
import os
from pathlib import Path
import runpy
import unittest

JEV = runpy.run_path(str(Path(__file__).resolve().parents[3] / 'scripts/jev-workflow'), run_name='imported')
SESSION_VARIABLES = ('CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID', 'CODEX_SESSION_ID')


class CatalogTests(unittest.TestCase):
    def test_local_skills_are_routable_and_always_on_skills_are_not(self):
        names = JEV['catalog']('direct')
        for skill in ('gh-axi', 'gkdev-branch', 'typesafe-ai', 'code-review'):
            self.assertIn(skill, names)
        for skill in ('render-output', 'jev-workflow'):
            self.assertNotIn(skill, names)

    def test_every_candidate_has_a_skill_file(self):
        root = Path(__file__).resolve().parents[2] / 'skills'
        for name in JEV['catalog']('direct'):
            self.assertTrue((root / name / 'SKILL.md').exists(), name)


class SessionTests(unittest.TestCase):
    def setUp(self):
        saved = {name: os.environ.pop(name, None) for name in SESSION_VARIABLES}
        self.addCleanup(lambda: os.environ.update({k: v for k, v in saved.items() if v is not None}))

    def test_claude_code_session_variable_binds_a_claude_session(self):
        os.environ['CLAUDE_CODE_SESSION_ID'] = 'abc'
        self.assertEqual(JEV['current_session'](), ('claude', 'abc'))

    def test_codex_wins_and_no_variable_means_unbound(self):
        os.environ['CLAUDE_CODE_SESSION_ID'] = 'abc'
        os.environ['CODEX_SESSION_ID'] = 'xyz'
        self.assertEqual(JEV['current_session'](), ('codex', 'xyz'))
        del os.environ['CODEX_SESSION_ID'], os.environ['CLAUDE_CODE_SESSION_ID']
        self.assertEqual(JEV['current_session'](), ('unknown', None))


unittest.main()
