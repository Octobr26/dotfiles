"""Exercise harness-check against disposable repositories."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
CHECK = HERE.parents[2] / 'scripts/harness-check'
MESSAGE = 'harness-check must name each failing check'


def git(repo, *args):
    subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)


class HarnessCheckTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.repo = self.root / 'repo'
        self.suites = self.repo / 'config/agents/scripts'
        self.suites.mkdir(parents=True)
        (self.repo / 'scripts').mkdir()
        self.sentinel = self.root / 'replay-invoked'
        isolation = ('import os\nfrom pathlib import Path\nimport unittest\n\n'
                     'class Isolation(unittest.TestCase):\n'
                     '    def test_home_is_temporary(self):\n'
                     '        home = Path(os.environ["HOME"])\n'
                     '        self.assertNotEqual(home.resolve(), Path(' + repr(str(Path.home().resolve())) + '))\n'
                     '        self.assertFalse((home / ".local/state/agent-workflow").exists())\n\n'
                     'unittest.main()\n')
        (self.suites / 'ok.test.py').write_text(isolation)
        (self.suites / 'ok.test.mjs').write_text("import test from 'node:test';\ntest('ok', () => {});\n")
        (self.repo / 'scripts/tool').write_text('#!/usr/bin/env bash\necho ok\n')
        (self.repo / 'scripts/agent-workflow-replay').write_text(
            '#!/usr/bin/env bash\ntouch ' + str(self.sentinel) + '\n')
        git(self.repo, 'init', '-q')
        git(self.repo, 'add', '.')
        git(self.repo, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'base')

    def run_check(self):
        return subprocess.run([sys.executable, str(CHECK), '--repo', str(self.repo)],
                              text=True, capture_output=True, timeout=600)

    def test_each_failing_check_is_named_and_exit_is_nonzero(self):
        (self.suites / 'bad.test.py').write_text(
            'import unittest\n\nclass Bad(unittest.TestCase):\n'
            '    def test_bad(self):\n        self.fail("broken")\n\nunittest.main()\n')
        (self.repo / 'scripts/broken').write_text('#!/usr/bin/env bash\nif then\n')
        (self.repo / 'scripts/zbroken').write_text('#!/usr/bin/env zsh\nif [[ \n')
        (self.repo / 'scripts/tool').write_text('#!/usr/bin/env bash\necho ok   \n')
        (self.repo / 'notes.txt').write_text('trailing  \n')
        git(self.repo, 'add', 'notes.txt')
        result = self.run_check()
        output = result.stdout
        self.assertNotEqual(result.returncode, 0, MESSAGE + ': expected nonzero exit\n' + output + result.stderr)
        for line in ('FAIL test config/agents/scripts/bad.test.py',
                     'FAIL bash-syntax scripts/broken',
                     'FAIL zsh-syntax scripts/zbroken',
                     'FAIL whitespace unstaged',
                     'FAIL whitespace staged',
                     'PASS test config/agents/scripts/ok.test.py',
                     'PASS test config/agents/scripts/ok.test.mjs'):
            self.assertIn(line, output, MESSAGE)
        self.assertFalse(self.sentinel.exists(), 'harness-check must never invoke replay')

    def test_clean_repository_passes(self):
        result = self.run_check()
        self.assertEqual(result.returncode, 0, MESSAGE + ': clean repository failed\n' + result.stdout + result.stderr)
        self.assertNotIn('FAIL', result.stdout)
        self.assertIn('PASS test config/agents/scripts/ok.test.py', result.stdout, MESSAGE)
        self.assertIn('PASS bash-syntax scripts/tool', result.stdout, MESSAGE)
        self.assertFalse(self.sentinel.exists(), 'harness-check must never invoke replay')


if __name__ == '__main__':
    unittest.main()
