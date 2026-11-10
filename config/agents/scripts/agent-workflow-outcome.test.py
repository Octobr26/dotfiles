"""Exercise explicit outcome entry against a temporary agent-workflow state."""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent
CLI = HERE.parents[2] / 'scripts/agent-workflow'
SESSION_VARIABLES = ('CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID', 'CODEX_SESSION_ID')
MESSAGE = 'outcome command must record explicit feedback for a captured turn'


class OutcomeTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name)
        workspace = self.home / 'workspace'
        workspace.mkdir()
        config = self.home / '.config/agent-workflow/config.json'
        config.parent.mkdir(parents=True)
        config.write_text(json.dumps({'workspace': str(workspace), 'node': 'node', 'backfill_days': 30,
                                      'timezone': 'America/Los_Angeles', 'jev': {'enabled': False}}))
        self.assertEqual(self.cli('report', '--days', '7').returncode, 0)
        self.db = self.home / '.local/state/agent-workflow/history.sqlite'
        now = time.time() * 1000
        turns = [('codex', 'sess-a:turn-1', True, now - 3_600_000),
                 ('codex', 'sess-a:turn-2', True, now - 3_000_000),
                 ('codex', 'sess-a:turn-3', True, now - 2_500_000),
                 ('claude', 'sess-b:turn-1', True, now - 2_000_000),
                 ('claude', 'sess-b:turn-9', False, now - 1_000_000)]
        with sqlite3.connect(self.db) as db:
            for provider, key, complete, started in turns:
                session, turn = key.split(':')
                data = {'taskKey': key, 'sessionId': session, 'turnId': turn, 'provider': provider,
                        'startedAtMs': started, 'completedAtMs': started + 1000 if complete else None,
                        'complete': complete, 'model': 'example-model'}
                db.execute('INSERT INTO turns VALUES (?,?,?,?,?)', (provider, key, session, started, json.dumps(data)))
            db.execute('INSERT INTO commits VALUES (?,?,?)', (str(workspace / 'repo'), 'a' * 40, now / 1000))

    def cli(self, *args, env=None):
        # Real session variables must not leak in and silently bind a test to the developer's session.
        base = {k: v for k, v in os.environ.items() if k not in SESSION_VARIABLES}
        return subprocess.run([sys.executable, str(CLI), *args], text=True, capture_output=True,
                              env={**base, 'HOME': str(self.home), **(env or {})}, timeout=120)

    def rows(self):
        with sqlite3.connect(self.db) as db:
            return db.execute('SELECT provider, turn_key, kind, note FROM outcomes ORDER BY id').fetchall()

    def test_explicit_feedback_is_linked_to_a_captured_turn(self):
        result = self.cli('outcome', 'codex:sess-a:turn-1', '--kind', 'acceptance')
        self.assertEqual(result.returncode, 0, MESSAGE + '\n' + result.stdout + result.stderr)
        self.assertEqual(self.rows(), [('codex', 'sess-a:turn-1', 'acceptance', None)], MESSAGE)

    def test_unknown_or_ambiguous_keys_are_rejected_without_writing(self):
        self.assertEqual(self.cli('outcome', 'codex:sess-a:turn-1', '--kind', 'acceptance').returncode, 0, MESSAGE)
        before = self.rows()
        for key in ('codex:sess-x:turn-1', 'codex:sess-a', 'sess-a:turn-1', 'claude:sess-a:turn-1'):
            with self.subTest(key=key):
                result = self.cli('outcome', key, '--kind', 'acceptance')
                self.assertNotEqual(result.returncode, 0, MESSAGE)
        self.assertEqual(self.rows(), before)

    def test_corrections_and_later_acceptance_are_kept_and_identical_repeats_are_not(self):
        key = 'codex:sess-a:turn-2'
        for kind, note in (('correction', 'fix a'), ('correction', 'fix a'), ('correction', 'fix b'),
                           ('acceptance', None), ('acceptance', None)):
            arguments = ['outcome', key, '--kind', kind] + (['--note', note] if note else [])
            self.assertEqual(self.cli(*arguments).returncode, 0, MESSAGE)
        self.assertEqual([row[2:] for row in self.rows()],
                         [('correction', 'fix a'), ('correction', 'fix b'), ('acceptance', None)], MESSAGE)

    def test_last_rates_the_latest_completed_turn_of_the_named_session(self):
        result = self.cli('outcome', '--last', '--session', 'sess-a', '--kind', 'acceptance')
        self.assertEqual(result.returncode, 0, MESSAGE + '\n' + result.stdout + result.stderr)
        self.assertEqual(self.rows(), [('codex', 'sess-a:turn-3', 'acceptance', None)], MESSAGE)

    def test_last_binds_to_the_session_environment_and_skips_incomplete_turns(self):
        result = self.cli('outcome', '--last', '--kind', 'correction', '--note', 'fix a',
                          env={'CLAUDE_CODE_SESSION_ID': 'sess-b'})
        self.assertEqual(result.returncode, 0, MESSAGE + '\n' + result.stdout + result.stderr)
        self.assertEqual(self.rows(), [('claude', 'sess-b:turn-1', 'correction', 'fix a')], MESSAGE)

    def test_last_never_guesses_a_session(self):
        for arguments, env in ((('outcome', '--last', '--kind', 'acceptance'), None),
                               (('outcome', '--last', '--session', 'sess-x', '--kind', 'acceptance'), None),
                               (('outcome', 'codex:sess-a:turn-1', '--last', '--kind', 'acceptance'), None),
                               (('outcome', '--kind', 'acceptance'), None)):
            with self.subTest(arguments=arguments):
                self.assertNotEqual(self.cli(*arguments, env=env).returncode, 0, MESSAGE)
        self.assertEqual(self.rows(), [], 'a rejected request must not write an outcome')

    def test_report_shows_explicit_coverage_and_leaves_other_turns_unknown(self):
        # turn-2 has a commit in the window and turn-3 is silent: both must stay unknown.
        self.cli('outcome', 'codex:sess-a:turn-1', '--kind', 'acceptance')
        self.cli('outcome', 'claude:sess-b:turn-1', '--kind', 'correction', '--note', 'fix a')
        result = self.cli('report', '--days', '7')
        self.assertEqual(result.returncode, 0, result.stderr)
        report = result.stdout
        self.assertTrue('Explicit outcome coverage: 2/4 completed turns' in report, MESSAGE + ': coverage line')
        self.assertTrue('Current explicit state: acceptance 1, correction 1' in report, MESSAGE + ': state line')
        self.assertTrue('Unrated completed turns' in report, MESSAGE + ': unrated listing')
        unrated = report.split('Unrated completed turns', 1)[-1].split('\n## ', 1)[0]
        for key in ('codex:sess-a:turn-2', 'codex:sess-a:turn-3'):
            self.assertTrue(key in unrated, MESSAGE + ': commit-only or silent turn must stay unrated')
        for key in ('codex:sess-a:turn-1', 'claude:sess-b:turn-1'):
            self.assertFalse(key in unrated, 'rated turn listed as unrated')
        self.assertFalse('claude:sess-b:turn-9' in unrated, 'incomplete turn listed as unrated')


if __name__ == '__main__':
    unittest.main()
