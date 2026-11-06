"""Exercise the native hook ABI against real Git repositories and readiness records."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('readiness_tests', HERE / 'agent-readiness.test.py')
readiness_tests = importlib.util.module_from_spec(spec)
spec.loader.exec_module(readiness_tests)
HOOK = HERE.parents[2] / 'scripts/agent-readiness-hook'


class NativeHookTests(unittest.TestCase):
    def setUp(self):
        self.fixture = readiness_tests.ReadinessTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.repo = self.fixture.repo
        self.home = self.fixture.root / 'home'
        self.state_dir = self.fixture.root / 'state'
        self.fixture.run_cli = lambda *args: subprocess.run(
            [sys.executable, str(readiness_tests.CLI), *args], text=True, capture_output=True,
            env={**os.environ, 'AGENT_READINESS_STATE_DIR': str(self.state_dir)})

    def hook(self, event='PreToolUse', tool='Write', arguments=None, required=False, **fields):
        payload = {'session_id': 'author', 'cwd': str(self.repo), 'hook_event_name': event,
                   'tool_name': tool, 'tool_input': arguments or {'file_path': str(self.repo / 'behavior.py')}}
        payload.update(fields)
        argv = [sys.executable, str(HOOK), '--state-dir', str(self.state_dir)]
        if required:
            argv.extend(['--require-for', str(self.repo if required is True else required)])
        return subprocess.run(argv, input=json.dumps(payload),
                              text=True, capture_output=True, env={**os.environ, 'HOME': str(self.home)})

    def enroll(self):
        self.fixture.initialize('implementation')

    def test_bug_investigation_is_available_without_an_implementation_plan(self):
        operations = [
            ('request_user_input_async', {'questions': [{'title': 'Which table shows the bug?'}]}),
            ('mcp__codegraph__codegraph_explore', {'projectPath': str(self.repo), 'query': 'column resizing'}),
            ('exec_command', {'cmd': 'pwd; rg --files -g "*column*" .'}),
            ('exec_command', {'cmd': 'git worktree list'}),
            ('exec_command', {'cmd': 'pnpm exec vitest --run src/unit-tests/use-resizable-columns.test.tsx'}),
        ]
        for stage in ('unenrolled', 'review', 'implementation', 'missing-record'):
            if stage in ('review', 'implementation'):
                if stage == 'implementation':
                    self.fixture.record.unlink()
                self.fixture.initialize(stage)
            elif stage == 'missing-record':
                self.fixture.record.unlink()
            for tool, arguments in operations:
                with self.subTest(stage=stage, tool=tool, arguments=arguments):
                    result = self.hook(required=True, tool=tool, arguments=arguments)
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_investigation_report_can_end_with_an_incomplete_review_record(self):
        self.fixture.initialize('review')
        result = self.hook(event='Stop', last_assistant_message='The existing code needs further investigation.')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_unenrolled_session_is_outside_scope(self):
        result = self.hook()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_required_workspace_denies_unenrolled_mutation_but_allows_reads(self):
        result = self.hook(required=True)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn('init', result.stderr)
        self.assertIn('--actor author', result.stderr)
        self.assertEqual(self.hook(required=True, tool='Read').returncode, 0)
        self.assertEqual(self.hook(required=True, event='Stop').returncode, 0)
        command = (str(readiness_tests.CLI) + ' init --repo ' + str(self.repo)
                   + ' --base HEAD --mode implementation --actor author'
                   + ' --task "Review owner (shared) behavior; retain the original choice"')
        self.assertEqual(self.hook(required=True, tool='Bash', arguments={'command': command}).returncode, 0)

    def test_file_target_in_required_workspace_cannot_escape_via_unrelated_cwd(self):
        self.assertEqual(self.hook(required=True, cwd=str(self.home)).returncode, 2)
        patch = '*** Begin Patch\n*** Add File: ' + str(self.repo / 'unwanted') + '\n+bad\n*** End Patch'
        self.assertEqual(self.hook(required=True, cwd=str(self.home), tool='apply_patch', arguments=patch).returncode, 2)

    def test_private_evidence_edit_is_available_before_enrollment_and_plan(self):
        report = self.state_dir.parent / 'experiments' / 'peer.json'
        arguments = {'file_path': str(report), 'content': '{}'}
        self.assertEqual(self.hook(required=True, arguments=arguments).returncode, 0)
        self.enroll()
        self.assertEqual(self.hook(arguments=arguments).returncode, 0)
        patch = '*** Begin Patch\n*** Add File: ' + str(report) + '\n+{}\n*** End Patch'
        self.assertEqual(self.hook(tool='apply_patch', arguments={'command': patch}).returncode, 0)
        self.assertEqual(self.hook(tool='apply_patch', arguments=patch).returncode, 0)
        patch += '\n*** Add File: ' + str(self.repo / 'unwanted') + '\n+bad'
        self.assertEqual(self.hook(tool='apply_patch', arguments={'command': patch}).returncode, 2)

    def test_accepted_plan_allows_edits_after_tree_changes_but_changed_spec_denies(self):
        self.enroll()
        self.fixture.source()
        self.fixture.accepted_plan()
        self.assertEqual(self.hook().returncode, 0)
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.assertEqual(self.hook().returncode, 0)
        self.fixture.edit(lambda record: record['cases'][0].update(expected='A different requested result'))
        self.assertEqual(self.hook().returncode, 2)

    def test_accepted_cwd_plan_cannot_authorize_another_repository_target(self):
        self.enroll()
        self.fixture.source()
        self.fixture.accepted_plan()
        other = self.fixture.root / 'other-repo'
        other.mkdir()
        subprocess.run(['git', 'init', '-q', str(other)], check=True)
        for tool in ('Write', 'Edit'):
            result = self.hook(required=self.fixture.root, tool=tool,
                               arguments={'file_path': str(other / 'unwanted')})
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        patch = ('*** Begin Patch\n*** Add File: ' + str(self.repo / 'added')
                 + '\n+one\n*** Add File: ' + str(other / 'added') + '\n+two\n*** End Patch')
        result = self.hook(required=self.fixture.root, tool='apply_patch', arguments=patch)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn('multiple repositories', result.stderr)

    def test_shell_and_mcp_execution_remain_with_provider_permissions(self):
        # The hook is not a shell sandbox. Returning zero does not authorize or
        # execute these commands; readiness obligations still apply to edits.
        self.enroll()
        for tool, arguments in [
            ('Bash', {'command': 'touch unwanted'}),
            ('exec_command', {'cmd': 'python3 -c "print(1)"'}),
            ('mcp__unknown__run', {'code': 'write'}),
        ]:
            with self.subTest(tool=tool):
                result = self.hook(required=True, tool=tool, arguments=arguments)
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_enrolled_record_is_denied_instead_of_treated_as_unenrolled(self):
        self.enroll()
        self.fixture.record.unlink()
        self.assertEqual(self.hook().returncode, 2)

    def test_index_lookup_ignores_large_unrelated_record_history(self):
        self.enroll()
        for number in range(150):
            (self.state_dir / ('unrelated-' + str(number) + '.json')).write_text('not JSON')
        self.assertEqual(self.hook().returncode, 2)
        self.assertEqual(self.hook(tool='Read').returncode, 0)

    def test_source_and_test_capture_are_available_before_plan_acceptance(self):
        self.enroll()
        prefix = (str(readiness_tests.CLI) + ' capture --record ' + str(self.fixture.record))
        for suffix in (' --id source --kind source -- cat contract.txt',
                       ' --id baseline --kind check -- pnpm exec vitest --run',
                       ' --id plan-peer --kind plan-review --reviewer peer -- cat /tmp/peer.json'):
            result = self.hook(tool='Bash', arguments={'command': prefix + suffix})
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.hook(tool='Agent', arguments={'prompt': 'Review the plan read-only.'}).returncode, 0)

    def test_current_complete_final_evidence_allows_stop(self):
        self.fixture.complete_review()
        result = self.hook(event='Stop', last_assistant_message='Complete.', stop_hook_active=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout, '')

    def test_accepted_review_record_does_not_authorize_native_repository_edits(self):
        self.fixture.initialize('review')
        self.fixture.source()
        self.fixture.accepted_plan()
        result = self.hook()
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn('review record does not authorize', result.stderr)

    def test_pending_clarification_can_stop_without_acceptance(self):
        self.enroll()
        self.fixture.edit(lambda record: record['clarification'].update(status='needs_user'))
        result = self.hook(event='Stop', last_assistant_message='Please settle the requested choice.')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('no acceptance is implied', result.stdout)

    def test_enrolled_native_edits_are_denied_without_accepted_plan(self):
        self.enroll()
        for tool, arguments in [('Write', {}), ('Edit', {}), ('apply_patch', {'command': '*** Begin Patch'})]:
            with self.subTest(tool=tool):
                result = self.hook(tool=tool, arguments=arguments)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertIn('readiness', result.stderr.lower())
        self.assertFalse((self.repo / 'unwanted').exists())

    def test_native_reads_and_tightly_parsed_shell_reads_are_allowed(self):
        self.enroll()
        for tool, arguments in [('Read', {}), ('Grep', {}), ('Glob', {}),
                                ('Bash', {'command': 'git status --short'}),
                                ('Bash', {'command': 'rg -n value behavior.py'})]:
            with self.subTest(tool=tool, arguments=arguments):
                result = self.hook(tool=tool, arguments=arguments)
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_edit_hint_uses_target_repository_instead_of_workspace_cwd(self):
        result = self.hook(required=self.fixture.root, cwd=str(self.fixture.root))
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn('--repo ' + str(self.repo.resolve()) + ' --base', result.stderr)

    def test_non_repository_edit_does_not_suggest_initializing_workspace_as_repository(self):
        result = self.hook(required=self.fixture.root, cwd=str(self.fixture.root),
                           arguments={'file_path': str(self.fixture.root / 'notes.md')})
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn('no Git repository', result.stderr)
        self.assertNotIn(' init ', result.stderr)

    def test_stale_record_cannot_prevent_questions_or_investigation_handoff(self):
        self.enroll()
        self.fixture.record.unlink()
        self.assertEqual(self.hook(tool='request_user_input_async', arguments={'questions': []}).returncode, 0)
        result = self.hook(event='Stop', last_assistant_message='I need the affected table to continue.')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('no acceptance is implied', result.stdout)
        self.assertEqual(self.hook().returncode, 2)

    def test_wrong_session_cannot_borrow_another_sessions_enrollment(self):
        self.enroll()
        self.assertEqual(self.hook(session_id='different-session').returncode, 0)

    def test_stop_advises_without_implying_acceptance_or_forcing_continuation(self):
        self.enroll()
        for message in ('Complete.', 'Which table is affected?', 'Existing code has the same behavior.'):
            with self.subTest(message=message):
                result = self.hook(event='Stop', last_assistant_message=message, stop_hook_active=False)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('no acceptance is implied', result.stdout)

    def test_explicit_incomplete_handoff_can_end_without_claiming_acceptance(self):
        self.enroll()
        result = self.hook(event='Stop', last_assistant_message='EVIDENCE INCOMPLETE: awaiting Luis.',
                           stop_hook_active=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('incomplete', result.stdout.lower())

    def test_malformed_native_input_fails_closed(self):
        result = subprocess.run([sys.executable, str(HOOK)], input='not JSON', text=True, capture_output=True)
        self.assertEqual(result.returncode, 2)


if __name__ == '__main__':
    unittest.main()
