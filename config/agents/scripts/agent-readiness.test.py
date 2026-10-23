"""Subprocess tests of readiness decisions using real temporary Git worktrees."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

CLI = Path(__file__).resolve().parents[3] / 'scripts/agent-readiness'


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.record = self.root / 'state' / 'record.json'
        for args in [('init', '-q'), ('config', 'user.email', 'test@example.invalid'),
                     ('config', 'user.name', 'Test'), ('config', 'commit.gpgsign', 'false')]:
            self.git(*args)
        (self.repo / 'behavior.py').write_text('value = 0\n')
        (self.repo / 'contract.txt').write_text('The requested value must equal one.\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'baseline')

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], text=True)

    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(CLI), *args], capture_output=True, text=True)

    def read(self):
        return json.loads(self.record.read_text())

    def edit(self, update):
        record = self.read()
        update(record)
        self.record.write_text(json.dumps(record))

    def initialize(self, mode='review'):
        result = self.run_cli('init', '--base', 'HEAD', '--repo', str(self.repo), '--record', str(self.record),
                              '--mode', mode, '--task', 'Preserve the requested value', '--actor', 'author')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        def fill(record):
            record['cases'] = [{'id': 'value', 'authority': 'The requested value is one.',
                                'authority_status': 'confirmed', 'authority_source': 'contract',
                                'input': 'Read the value', 'expected': 'value equals one',
                                'check': 'Execute the real module and assert its value.',
                                'method': 'runtime', 'failure': 'AssertionError: expected value 1',
                                'source': 'contract', 'baseline': 'red', 'result': 'green',
                                'observed': 'value equals one'}]
            for name, scenario in record['applicability'].items():
                scenario.update(applies=name == 'producer_consumer',
                                reason='One scalar value; no other behavior is changed.',
                                cases=['value'] if name == 'producer_consumer' else [])
        self.edit(fill)

    def capture(self, name, kind, code, *extra):
        return self.run_cli('capture', '--record', str(self.record), '--id', name,
                            '--kind', kind, '--case', 'value', *extra, '--', sys.executable, '-c', code)

    def source(self, name='contract'):
        result = self.capture(name, 'source', "from pathlib import Path; print(Path('contract.txt').read_text()); print(Path('behavior.py').read_text())")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def phase(self, phase):
        return self.run_cli('check', '--record', str(self.record), '--phase', phase)

    def reviewer(self, evidence=None, verdict='accept', cases=None, identity='peer', name='peer'):
        report = {'reviewer': identity, 'verdict': verdict,
                  'evidence': evidence or ['contract', 'green'],
                  'cases': cases or {'value': {'status': 'verified', 'reason': 'Compared code and evidence.'}}}
        result = self.capture(name, 'review', 'print(' + repr(json.dumps(report)) + ')',
                              '--reviewer', identity)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.edit(lambda r: r.update(reviews=[name]))

    def complete_review(self):
        self.initialize()
        self.source()
        self.assertEqual(self.phase('plan').returncode, 0)
        self.assertEqual(self.capture('green', 'check', "print('observed behavior')").returncode, 0)
        self.reviewer()
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)

    def test_init_requires_an_explicit_review_base(self):
        result = self.run_cli('init', '--repo', str(self.repo), '--record', str(self.record),
            '--mode', 'review', '--task', 'Review committed branch changes', '--actor', 'author')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.record.exists())

    def test_empty_record_cannot_claim_complete(self):
        self.record.parent.mkdir()
        self.record.write_text('{}')
        result = self.run_cli('check', '--record', str(self.record), '--phase', 'final')
        self.assertNotEqual(result.returncode, 0, result.stdout)

    def test_plan_needs_captured_authority_and_rejects_unknown_contract(self):
        self.initialize()
        self.assertNotEqual(self.phase('plan').returncode, 0)
        self.source()
        self.assertEqual(self.phase('plan').returncode, 0)
        self.edit(lambda r: r['cases'][0].update(authority_status='unknown'))
        self.assertNotEqual(self.phase('plan').returncode, 0)

    def test_selected_state_cannot_disappear_from_cases(self):
        self.initialize()
        self.source()
        self.edit(lambda r: r['applicability']['transitions'].update(
            applies=True, reason='The retry can fail.', cases=['failed_retry']))
        self.assertNotEqual(self.phase('plan').returncode, 0)

    def test_runtime_evidence_needs_current_independent_assessment(self):
        self.initialize()
        self.source()
        self.assertEqual(self.phase('plan').returncode, 0)
        self.assertEqual(self.capture('green', 'check', "print('observed behavior')").returncode, 0)
        self.assertNotEqual(self.phase('final').returncode, 0)
        self.reviewer()
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)

    def test_changed_expectation_invalidates_the_plan(self):
        self.complete_review()
        self.edit(lambda r: r['cases'][0].update(expected='a different outcome'))
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_implementation_cannot_switch_to_review_after_plan(self):
        self.initialize('implementation')
        self.edit(lambda r: r['cases'][0].update(method='source'))
        self.source()
        self.assertEqual(self.phase('plan').returncode, 0)
        self.edit(lambda r: r.update(mode='review'))
        self.reviewer(evidence=['contract'])
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_source_only_implementation_does_not_become_verified(self):
        self.initialize('implementation')
        self.edit(lambda r: r['cases'][0].update(method='source'))
        self.source()
        self.assertEqual(self.phase('plan').returncode, 0)
        self.reviewer(evidence=['contract'])
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_real_regression_requires_matching_red_green_commands(self):
        self.initialize('implementation')
        self.source()
        self.assertEqual(self.phase('plan').returncode, 0)
        code = "from pathlib import Path; exec(Path('behavior.py').read_text()); assert value == 1, 'expected value 1'; print('value 1 verified')"
        red = self.capture('red', 'baseline', code)
        self.assertNotEqual(red.returncode, 0)
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.source('final-contract')
        self.edit(lambda r: r['cases'][0].update(source='final-contract', authority_source='final-contract'))
        self.assertEqual(self.capture('green', 'check', code).returncode, 0)
        self.reviewer(evidence=['final-contract', 'red', 'green'])
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)
        self.edit(lambda r: r['captures']['red'].update(argv=[sys.executable, '-c', 'a different command']))
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_setup_failure_does_not_count_as_intended_regression(self):
        self.initialize('implementation')
        self.edit(lambda r: r['cases'][0].update(failure='some unrelated failure'))
        self.source()
        self.assertEqual(self.phase('plan').returncode, 0)
        code = "from pathlib import Path; exec(Path('behavior.py').read_text()); assert value == 1, 'expected value 1'; print('verified')"
        self.capture('red', 'baseline', code)
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.source('final-contract')
        self.edit(lambda r: r['cases'][0].update(source='final-contract', authority_source='final-contract'))
        self.capture('green', 'check', code)
        self.reviewer(evidence=['final-contract', 'red', 'green'])
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_changes_in_tracked_untracked_or_staged_content_are_stale(self):
        for change in ('tracked', 'untracked', 'staged', 'head', 'mode'):
            with self.subTest(change=change):
                self.setUp()
                self.complete_review()
                if change == 'untracked':
                    (self.repo / 'new.py').write_text('unreviewed = True')
                elif change == 'staged':
                    (self.repo / 'behavior.py').write_text('value = 2\n')
                    self.git('add', '.')
                    (self.repo / 'behavior.py').write_text('value = 0\n')
                elif change == 'head':
                    self.git('commit', '--allow-empty', '-qm', 'new head')
                elif change == 'mode':
                    (self.repo / 'behavior.py').chmod(0o755)
                else:
                    (self.repo / 'behavior.py').write_text('value = 2\n')
                self.assertNotEqual(self.phase('final').returncode, 0)

    def test_capture_rejects_commands_that_change_the_target(self):
        self.initialize()
        result = self.capture('mutation', 'check',
                              "from pathlib import Path; Path('behavior.py').write_text('value = 1')")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotEqual(self.read()['captures']['mutation']['before'],
                            self.read()['captures']['mutation']['after'])

    def test_output_corruption_and_timeout_fail_closed(self):
        self.complete_review()
        Path(self.read()['captures']['green']['artifact']).write_text('altered')
        self.assertNotEqual(self.phase('final').returncode, 0)
        result = self.capture('slow', 'check', 'import time; time.sleep(20)', '--timeout', '0.05')
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.read()['captures']['slow']['timed_out'])

    def test_timeout_stops_descendant_work_and_output_is_bounded(self):
        self.initialize()
        child = "import time; from pathlib import Path; time.sleep(0.8); Path('escaped').write_text('orphan')"
        code = "import subprocess, sys, time; subprocess.Popen([sys.executable, '-c', " + repr(child) + "]); print('spawned', flush=True); time.sleep(20)"
        result = self.capture('children', 'check', code, '--timeout', '0.2')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('spawned', Path(self.read()['captures']['children']['artifact']).read_text())
        time.sleep(0.85)
        self.assertFalse((self.repo / 'escaped').exists())
        result = self.capture('large', 'check', "print('x' * (3 * 1024 * 1024))")
        self.assertNotEqual(result.returncode, 0)
        entry = self.read()['captures']['large']
        self.assertTrue(entry['truncated'])
        self.assertLessEqual(Path(entry['artifact']).stat().st_size, 2 * 1024 * 1024)

    def test_records_stay_outside_the_project_and_existing_records_are_preserved(self):
        result = self.run_cli('init', '--base', 'HEAD', '--repo', str(self.repo), '--record', str(self.repo / 'record.json'),
                              '--mode', 'review', '--task', 'task', '--actor', 'author')
        self.assertNotEqual(result.returncode, 0)
        self.initialize()
        original = self.record.read_bytes()
        result = self.run_cli('init', '--base', 'HEAD', '--repo', str(self.repo), '--record', str(self.record),
                              '--mode', 'review', '--task', 'replace', '--actor', 'author')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.record.read_bytes(), original)

    def test_argv_metacharacters_are_not_shell_interpreted(self):
        self.initialize()
        result = self.run_cli('capture', '--record', str(self.record), '--id', 'literal',
                              '--kind', 'source', '--case', 'value', '--', sys.executable,
                              '-c', 'import sys; print(sys.argv[1])', '$(touch injected); echo secret')
        self.assertEqual(result.returncode, 0)
        self.assertFalse((self.repo / 'injected').exists())
        artifact = Path(self.read()['captures']['literal']['artifact']).read_text()
        self.assertIn('$(touch injected); echo secret', artifact)

    def test_review_cannot_anticipate_future_evidence(self):
        self.initialize()
        self.source()
        self.assertEqual(self.phase('plan').returncode, 0)
        report = {'reviewer': 'peer', 'verdict': 'accept', 'evidence': ['contract', 'future'],
                  'cases': {'value': {'status': 'verified', 'reason': 'claimed before observation'}}}
        result = self.capture('early-peer', 'review', 'print(' + repr(json.dumps(report)) + ')',
                              '--reviewer', 'peer')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('early-peer', self.read()['captures'])

    def test_review_binds_the_evidence_manifest_as_well_as_output(self):
        self.complete_review()
        self.edit(lambda r: r['captures']['green'].update(argv=['a different observation']))
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_regression_baseline_cannot_move_after_the_plan(self):
        self.initialize('implementation')
        self.source()
        self.assertEqual(self.phase('plan').returncode, 0)
        (self.repo / 'behavior.py').write_text('value = 2\n')
        code = "from pathlib import Path; exec(Path('behavior.py').read_text()); assert value == 1, 'expected value 1'; print('value 1 verified')"
        self.capture('red', 'baseline', code)
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.source('final-contract')
        self.edit(lambda r: r['cases'][0].update(source='final-contract', authority_source='final-contract'))
        self.capture('green', 'check', code)
        self.reviewer(evidence=['final-contract', 'red', 'green'])
        self.assertNotEqual(self.phase('final').returncode, 0)

    def attach_probe_policy(self, code, paths=None):
        policy = self.root / 'probe-policy.json'
        policy.write_text(json.dumps({'version': 1, 'probes': [{
            'id': 'semantic', 'paths': paths or ['behavior.py'],
            'argv': [sys.executable, '-c', code], 'expectation': 'Actual semantic probe must pass.'}]}))
        self.edit(lambda r: r.update(probe_policy=str(policy)))
        self.assertEqual(self.phase('plan').returncode, 0)

    def test_registered_probe_cannot_be_omitted_by_author_cases(self):
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.complete_review()
        code = 'print(' + repr(json.dumps({'probe': 'semantic', 'status': 'pass'})) + ')'
        self.attach_probe_policy(code)
        self.assertNotEqual(self.phase('final').returncode, 0)
        self.assertEqual(self.capture('semantic-result', 'check', code).returncode, 0)
        self.edit(lambda r: r.update(probe_results={'semantic': 'semantic-result'}))
        self.reviewer(evidence=['contract', 'green', 'semantic-result'], name='peer-final')
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)

    def test_changed_probe_program_invalidates_captured_result(self):
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.complete_review()
        program = self.root / 'probe.py'
        program.write_text('print(' + repr(json.dumps({'probe': 'semantic', 'status': 'pass'})) + ')')
        policy = self.root / 'bound-policy.json'
        policy.write_text(json.dumps({'version': 1, 'probes': [{'id': 'semantic', 'paths': ['behavior.py'],
            'argv': [sys.executable, str(program)], 'files': [str(program)]}]}))
        self.edit(lambda r: r.update(probe_policy=str(policy)))
        self.assertEqual(self.phase('plan').returncode, 0)
        result = self.run_cli('capture', '--record', str(self.record), '--id', 'bound-probe',
            '--kind', 'check', '--case', 'value', '--', sys.executable, str(program))
        self.assertEqual(result.returncode, 0)
        self.edit(lambda r: r.update(probe_results={'semantic': 'bound-probe'}))
        self.reviewer(evidence=['contract', 'green', 'bound-probe'], name='peer-final')
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)
        program.write_text(program.read_text() + '\n# changed verification implementation\n')
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_registered_probe_rejects_a_lookalike_command(self):
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.complete_review()
        self.attach_probe_policy("print('real probe')")
        substitute = 'print(' + repr(json.dumps({'probe': 'semantic', 'status': 'pass'})) + ')'
        self.capture('substitute', 'check', substitute)
        self.edit(lambda r: r.update(probe_results={'semantic': 'substitute'}))
        self.reviewer(evidence=['contract', 'green', 'substitute'], name='peer-final')
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_failed_registered_probe_blocks_even_with_accepted_author_evidence(self):
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.complete_review()
        code = 'import sys; print(' + repr(json.dumps({'probe': 'semantic', 'status': 'fail'})) + '); sys.exit(1)'
        self.attach_probe_policy(code)
        self.assertNotEqual(self.capture('failed-probe', 'check', code).returncode, 0)
        self.edit(lambda r: r.update(probe_results={'semantic': 'failed-probe'}))
        result = self.phase('final')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('probe', result.stdout)

    def test_not_applicable_needs_explicit_policy_permission(self):
        for allowed in (False, True):
            with self.subTest(allowed=allowed):
                self.setUp()
                (self.repo / 'behavior.py').write_text('value = 1\n')
                self.complete_review()
                code = 'print(' + repr(json.dumps({'probe': 'semantic', 'status': 'not_applicable'})) + ')'
                self.attach_probe_policy(code)
                policy = self.root / 'probe-policy.json'
                data = json.loads(policy.read_text())
                data['probes'][0]['allow_not_applicable'] = allowed
                policy.write_text(json.dumps(data))
                self.assertEqual(self.phase('plan').returncode, 0)
                self.capture('conditional-probe', 'check', code)
                self.edit(lambda r: r.update(probe_results={'semantic': 'conditional-probe'}))
                self.reviewer(evidence=['contract', 'green', 'conditional-probe'], name='peer-final')
                self.assertEqual(self.phase('final').returncode == 0, allowed)

    def test_unrelated_changes_do_not_require_registered_probe(self):
        self.complete_review()
        self.attach_probe_policy("print('not applicable')", paths=['unrelated/**'])
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)

    def test_reviewer_cannot_accept_a_known_blocker_or_omit_a_case(self):
        self.complete_review()
        self.edit(lambda r: r['findings'].append({'id': 'partial-period', 'kind': 'blocker',
                  'status': 'open', 'reason': 'Partial observation looks final.', 'evidence': ['contract']}))
        self.assertNotEqual(self.phase('final').returncode, 0)
        self.edit(lambda r: r['findings'].clear())
        peer = self.read()['captures']['peer']
        self.edit(lambda r: r['captures']['peer'].update(reviewer='author'))
        self.assertNotEqual(self.phase('final').returncode, 0)
        self.edit(lambda r: r['captures']['peer'].update(reviewer=peer['reviewer']))
        self.edit(lambda r: r['cases'].append({**r['cases'][0], 'id': 'partial-value'}))
        self.edit(lambda r: r['applicability']['producer_consumer']['cases'].append('partial-value'))
        self.assertNotEqual(self.phase('final').returncode, 0)


if __name__ == '__main__':
    unittest.main()
