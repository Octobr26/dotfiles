"""Exercise the readiness hook installer against a temporary home directory."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
INSTALLER = HERE.parents[2] / 'scripts/agent-readiness-install-hooks'
MESSAGE = 'readiness matcher must list only mutation and shell tools'
CANDIDATES = ('Write', 'Edit', 'Bash', 'apply_patch', 'Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch',
              'Agent', 'mcp__codegraph__codegraph_explore')


def matches(matcher, tool):
    """Provider rule: empty or * matches all; plain names split on | or ,; anything else is a regex."""
    if matcher in (None, '', '*'):
        return True
    if re.fullmatch(r'[A-Za-z0-9_\- |,]+', matcher):
        return tool in {part.strip() for part in re.split(r'[|,]', matcher)}
    return re.search(matcher, tool) is not None


class InstallerTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name)
        (self.home / '.claude').mkdir()
        (self.home / '.codex').mkdir()
        self.claude_before = {'model': 'example', 'permissions': {'allow': ['Bash(ls)']},
                              'hooks': {'PreToolUse': [{'matcher': 'Read', 'hooks': [
                                  {'type': 'command', 'command': 'foreign-claude-hook'}]}]}}
        self.codex_before = {'hooks': {'Stop': [{'hooks': [{'type': 'command', 'command': 'foreign-codex-hook'}]}]}}
        (self.home / '.claude/settings.json').write_text(json.dumps(self.claude_before))
        (self.home / '.codex/hooks.json').write_text(json.dumps(self.codex_before))
        result = subprocess.run([sys.executable, str(INSTALLER), '--require-for', str(self.home / 'workspace')],
                                text=True, capture_output=True, env={**os.environ, 'HOME': str(self.home)})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.claude = json.loads((self.home / '.claude/settings.json').read_text())
        self.codex = json.loads((self.home / '.codex/hooks.json').read_text())

    @staticmethod
    def readiness_groups(config, event):
        return [group for group in config['hooks'].get(event, [])
                if any('agent-readiness-hook' in handler.get('command', '') for handler in group['hooks'])]

    def test_readiness_dispatch_is_limited_to_mutation_and_shell_tools(self):
        for config, expected in ((self.claude, {'Write', 'Edit', 'Bash'}), (self.codex, {'apply_patch', 'Bash'})):
            groups = self.readiness_groups(config, 'PreToolUse')
            self.assertEqual(len(groups), 1, MESSAGE)
            dispatched = {tool for tool in CANDIDATES if matches(groups[0].get('matcher'), tool)}
            self.assertEqual(dispatched, expected, MESSAGE)

    def test_installer_preserves_other_settings_and_adds_nothing_else(self):
        self.assertEqual(self.claude['model'], 'example')
        self.assertEqual(self.claude['permissions'], self.claude_before['permissions'])
        self.assertNotIn('permissions', self.codex)
        commands = lambda config: sorted(handler['command'] for groups in config['hooks'].values()
                                         for group in groups for handler in group['hooks'])
        claude_commands, codex_commands = commands(self.claude), commands(self.codex)
        self.assertIn('foreign-claude-hook', claude_commands)
        self.assertIn('foreign-codex-hook', codex_commands)
        for found in (claude_commands, codex_commands):
            readiness = [command for command in found if 'agent-readiness-hook' in command]
            self.assertEqual(len(readiness), 2, found)
            self.assertEqual(len(found), 3, 'installer must add only readiness PreToolUse and Stop handlers')
        for config in (self.claude, self.codex):
            self.assertEqual(len(self.readiness_groups(config, 'Stop')), 1)
            self.assertEqual(set(config['hooks']) - {'PreToolUse', 'Stop'}, set())


if __name__ == '__main__':
    unittest.main()
