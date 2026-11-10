"""Exercise private experiment replay against temporary experiment directories."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
REPLAY = HERE.parents[2] / 'scripts/agent-workflow-replay'
MESSAGE = 'replay must report failed expectations with a nonzero exit'
PASSING = 'import unittest\n\nclass Case(unittest.TestCase):\n    def test_ok(self):\n        pass\n\nunittest.main()\n'
FAILING = 'import unittest\n\nclass Case(unittest.TestCase):\n    def test_bad(self):\n        self.fail("x")\n\nunittest.main()\n'


def section(output, title):
    return output.split('## ' + title, 1)[-1].split('\n## ', 1)[0] if '## ' + title in output else ''


class ReplayTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name)

    def run_replay(self, *args):
        return subprocess.run([sys.executable, str(REPLAY), *args], text=True, capture_output=True,
                              env={**os.environ, 'HOME': str(self.home)}, timeout=300)

    def test_failed_expectations_exit_nonzero_and_sections_are_separate(self):
        experiments = self.home / 'cases'
        (experiments / 'manifest-case').mkdir(parents=True)
        (experiments / 'readiness-case').mkdir()
        (experiments / 'pass_case.py').write_text(PASSING)
        (experiments / 'fail_case.py').write_text(FAILING)
        (experiments / 'manifest-case/replay.json').write_text(json.dumps({'cases': [
            {'id': 'true-ok', 'argv': ['true'], 'expected_exit': 0},
            {'id': 'false-mismatch', 'argv': ['false'], 'expected_exit': 0}]}))
        (experiments / 'readiness-case/readiness.json').write_text(json.dumps(
            {'version': 1, 'task': 't', 'mode': 'implementation', 'actor': 'a', 'repository': '/x'}))
        (experiments / 'notes.md').write_text('prose only\n')
        result = self.run_replay('--experiments', str(experiments))
        output = result.stdout
        self.assertNotEqual(result.returncode, 0, MESSAGE + '\n' + output + result.stderr)
        passed, failed, manual = (section(output, name) for name in ('Passed', 'Failed', 'Non-automated'))
        self.assertIn('pass_case.py', passed, MESSAGE)
        self.assertIn('manifest-case/true-ok', passed, MESSAGE)
        self.assertIn('fail_case.py', failed, MESSAGE)
        self.assertIn('manifest-case/false-mismatch', failed, MESSAGE)
        self.assertIn('readiness-case', manual, MESSAGE)
        self.assertIn('notes.md', manual, MESSAGE)
        for name in ('readiness-case', 'notes.md'):
            self.assertNotIn(name, passed + failed)
        self.assertIn('passed 2, failed 2, non-automated 2', output, MESSAGE)

    def test_default_directory_is_private_state_and_no_report_is_written(self):
        experiments = self.home / '.local/state/agent-workflow/experiments'
        experiments.mkdir(parents=True)
        (experiments / 'pass_case.py').write_text(PASSING)
        result = self.run_replay()
        self.assertEqual(result.returncode, 0, MESSAGE + '\n' + result.stdout + result.stderr)
        self.assertIn('passed 1, failed 0, non-automated 0', result.stdout, MESSAGE)
        self.assertFalse((self.home / '.local/state/agent-workflow/reports').exists())

    def test_skipped_or_unexecuted_suites_are_not_passes(self):
        experiments = self.home / 'cases'
        experiments.mkdir()
        inputs = {
            'skipped.py': PASSING.replace('    def test_ok', '    @unittest.skip("unavailable")\n    def test_ok'),
            'class_skip.py': PASSING.replace('class Case', '@unittest.skip("unavailable")\nclass Case'),
            'empty.py': 'import unittest\nunittest.main(exit=False)\n',
            'not_run.py': PASSING.replace('unittest.main()', ''),
        }
        for name, source in inputs.items():
            (experiments / name).write_text(source)
        result = self.run_replay('--experiments', str(experiments))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for name in inputs:
            self.assertIn(name, section(result.stdout, 'Non-automated'),
                          'skipped or unexecuted suites must not count as passes')
            self.assertNotIn(name, section(result.stdout, 'Passed'))
        self.assertIn('passed 0, failed 0, non-automated 4', result.stdout)
        self.assertIn('1 reported, 0 passed, 1 skipped', result.stdout)

    def test_mixed_suite_preserves_main_guard_and_reports_skips(self):
        experiments = self.home / 'cases'
        experiments.mkdir()
        source = PASSING.replace('unittest.main()',
            'class Skipped(unittest.TestCase):\n'
            '    @unittest.skip("unavailable")\n'
            '    def test_skip(self):\n        self.fail("must not execute")\n\n'
            'if __name__ == "__main__":\n    unittest.main()')
        (experiments / 'mixed.py').write_text(source)
        result = self.run_replay('--experiments', str(experiments))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('mixed.py', section(result.stdout, 'Passed'))
        self.assertIn('2 reported, 1 passed, 1 skipped', result.stdout)
        self.assertIn('passed 1, failed 0, non-automated 0', result.stdout)

    def test_failure_of_tests_or_process_is_preserved(self):
        experiments = self.home / 'cases'
        experiments.mkdir()
        (experiments / 'late_failure.py').write_text(
            PASSING.replace('unittest.main()', 'unittest.main(exit=False)\nraise SystemExit(3)'))
        (experiments / 'test_failure.py').write_text(FAILING.replace('unittest.main()', 'unittest.main(exit=False)'))
        result = self.run_replay('--experiments', str(experiments))
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        for name in ('late_failure.py', 'test_failure.py'):
            self.assertIn(name, section(result.stdout, 'Failed'),
                          'test failures and process failures must remain failures')
        self.assertIn('passed 0, failed 2, non-automated 0', result.stdout)


if __name__ == '__main__':
    unittest.main()
