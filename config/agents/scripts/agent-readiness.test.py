"""Subprocess tests of readiness decisions using real temporary Git worktrees."""
import json
import hashlib
import os
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
        return subprocess.run([sys.executable, str(CLI), *args], capture_output=True, text=True,
                              env={**os.environ, 'AGENT_READINESS_STATE_DIR': str(self.root / 'state')})

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
            record['clarification'] = {
                'status': 'clear', 'reason': 'The requested scalar result is explicit; no policy choice remains.',
                'questions': [],
                'evidence': [{'source': 'contract', 'quote': 'The requested value must equal one.'}],
            }
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

    def plan_reviewer(self, **overrides):
        record = self.read()
        draft = json.loads(self.phase('plan').stdout)
        references = {case[key] for case in record['cases'] for key in ('source', 'authority_source')}
        references.update(ref['source'] for ref in record.get('clarification', {}).get('evidence', []))
        references.update(ref for finding in record['findings'] if finding['kind'] == 'decision'
                          for ref in finding.get('evidence', []))
        report = {'reviewer': 'plan-peer', 'verdict': 'accept', 'plan_sha256': draft['plan_sha256'],
                  'evidence': sorted(references),
                  'clarification': {'status': 'verified', 'reason': 'The captured requirement explicitly settles the value.'},
                  'coverage': {'status': 'verified', 'reason': 'All six applicability entries are assessed for this scalar change.'},
                  'cases': {case['id']: {'status': 'verified', 'reason': 'Expected value follows the captured requirement.'}
                            for case in record['cases']}}
        report.update(overrides)
        name = 'plan-peer-' + str(len(record['captures']))
        result = self.capture(name, 'plan-review', 'print(' + repr(json.dumps(report)) + ')',
                              '--reviewer', report['reviewer'])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.edit(lambda r: r.update(plan_reviews=[name]))
        return name

    def accepted_plan(self):
        self.plan_reviewer()
        result = self.phase('plan')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def reviewer(self, evidence=None, verdict='accept', cases=None, identity='peer', name='peer'):
        record = self.read()
        case = record['cases'][0]
        source = case['source']
        result_id = case.get('result') if case['method'] == 'runtime' else source
        discrimination = [source, result_id]
        if record['mode'] == 'implementation' and case['method'] == 'runtime':
            discrimination.append(case['baseline'])

        def observations(names):
            return [{'capture': key, 'quote': Path(record['captures'][key]['artifact']).read_text().strip()}
                    for key in dict.fromkeys(names)]

        validation = {
            'path': {'status': 'verified', 'reason': 'Protocol fixture: inspect the selected observation, not exit status alone.',
                     'evidence': observations([result_id])},
            'discrimination': {'status': 'verified', 'reason': 'Protocol fixture: source and observed outcome distinguish the scalar case.',
                               'evidence': observations(discrimination)},
            'causality': {'status': 'not_claimed', 'reason': 'No failure mechanism is claimed by this protocol fixture.', 'evidence': []},
        }
        report = {'reviewer': identity, 'verdict': verdict,
                  'evidence': evidence or ['contract', 'green'],
                  'cases': cases or {'value': {'status': 'verified', 'reason': 'Compared code and evidence.',
                                              'validation': validation}}}
        result = self.capture(name, 'review', 'print(' + repr(json.dumps(report)) + ')',
                              '--reviewer', identity)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.edit(lambda r: r.update(reviews=[name]))

    def complete_review(self):
        self.initialize()
        self.source()
        self.accepted_plan()
        self.assertEqual(self.capture('green', 'check', "print('observed behavior')").returncode, 0)
        self.reviewer()
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)

    def test_init_requires_an_explicit_review_base(self):
        result = self.run_cli('init', '--repo', str(self.repo), '--record', str(self.record),
            '--mode', 'review', '--task', 'Review committed branch changes', '--actor', 'author')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.record.exists())

    def test_concurrent_repository_enrollment_preserves_each_record(self):
        processes, expected = [], {}
        for number in range(6):
            worktree = self.root / ('worktree-' + str(number))
            self.git('worktree', 'add', '--detach', str(worktree), 'HEAD')
            record = self.root / 'state' / ('record-' + str(number) + '.json')
            expected[str(worktree.resolve())] = str(record.resolve())
            processes.append(subprocess.Popen([sys.executable, str(CLI), 'init', '--repo', str(worktree),
                '--record', str(record), '--base', 'HEAD', '--task', 'Check enrollment', '--mode', 'review',
                '--actor', 'same-session'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                env={**os.environ, 'AGENT_READINESS_STATE_DIR': str(self.root / 'state')}))
        for process in processes:
            output, errors = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 0, output + errors)
        index = self.root / 'state' / 'sessions' / (hashlib.sha256(b'same-session').hexdigest() + '.json')
        self.assertEqual(json.loads(index.read_text())['records'], expected)

    def test_empty_record_cannot_claim_complete(self):
        self.record.parent.mkdir()
        self.record.write_text('{}')
        result = self.run_cli('check', '--record', str(self.record), '--phase', 'final')
        self.assertNotEqual(result.returncode, 0, result.stdout)

    def test_author_only_plan_cannot_authorize_implementation(self):
        self.initialize('implementation')
        self.source()
        result = self.phase('plan')
        self.assertNotEqual(result.returncode, 0,
                            'Author-only plan authorized implementation: ' + result.stdout)
        self.assertIn('independent plan assessment', result.stdout)
        self.assertNotIn('plan', self.read())

    def test_plan_review_is_bound_to_expectations_decisions_and_evidence(self):
        self.initialize('implementation')
        self.source()
        self.accepted_plan()
        original = self.read()
        for change in (
            lambda r: r['cases'][0].update(expected='value equals zero'),
            lambda r: r['clarification'].update(reason='Author chose a different policy'),
            lambda r: r['captures']['contract'].update(argv=['different', 'source']),
            lambda r: r['findings'].append({'id': 'new-policy', 'kind': 'decision', 'status': 'fixed',
                'reason': 'Policy changed after the assessment', 'evidence': ['contract'],
                'resolution': {'kind': 'requirement', 'source': 'contract', 'quote': 'The requested value must equal one.'}}),
        ):
            self.record.write_text(json.dumps(original))
            self.edit(change)
            self.assertNotEqual(self.phase('plan').returncode, 0)
        self.record.write_text(json.dumps(original))
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.assertNotEqual(self.phase('plan').returncode, 0)

    def test_green_check_cannot_override_rejected_policy_plan(self):
        self.initialize('implementation')
        self.source()
        self.edit(lambda r: r['cases'][0].update(expected='value equals zero'))
        self.capture('green', 'check', "from pathlib import Path; exec(Path('behavior.py').read_text()); assert value == 0")
        self.plan_reviewer(verdict='changes_required', cases={
            'value': {'status': 'unresolved', 'reason': 'Expected zero contradicts the requirement that the value equal one.'}})
        result = self.phase('plan')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('reviewer has not accepted', result.stdout)
        self.assertNotIn('plan', self.read())

    def test_plan_needs_distinct_assessment_of_clarification_and_coverage(self):
        self.initialize('implementation')
        self.source()
        for overrides in ({'clarification': {}}, {'coverage': {}}, {'plan_sha256': 'wrong-plan'}):
            with self.subTest(overrides=overrides):
                self.plan_reviewer(**overrides)
                self.assertNotEqual(self.phase('plan').returncode, 0)
        self.accepted_plan()
        name = self.read()['plan_reviews'][0]
        self.edit(lambda r: r['captures'][name].update(reviewer='author'))
        self.assertNotEqual(self.phase('implementation').returncode, 0)

    def test_final_assessment_cannot_substitute_for_plan_review(self):
        self.initialize()
        self.source()
        self.capture('green', 'check', "print('observed behavior')")
        self.reviewer()
        self.edit(lambda r: r.update(plan_reviews=['peer']))
        self.assertNotEqual(self.phase('plan').returncode, 0)

    def test_implementation_gate_allows_code_changes_but_not_changed_plan_or_unknowns(self):
        self.initialize('implementation')
        self.source()
        self.accepted_plan()
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.assertEqual(self.phase('implementation').returncode, 0, self.phase('implementation').stdout)
        self.edit(lambda r: r['clarification'].update(status='needs_user'))
        self.assertNotEqual(self.phase('implementation').returncode, 0)
        self.edit(lambda r: r['clarification'].update(status='clear'))
        self.edit(lambda r: r['cases'][0].update(expected='value equals two'))
        self.assertNotEqual(self.phase('implementation').returncode, 0)

    def test_changed_historical_plan_evidence_invalidates_final(self):
        self.complete_review()
        historical = self.read()['plan']['reviews'][0]
        artifact = Path(self.read()['captures'][historical]['artifact'])
        artifact.write_text('{}')
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_probe_activated_by_implementation_preserves_original_red_baseline(self):
        self.initialize('implementation')
        self.source()
        probe_code = "from pathlib import Path; import json; exec(Path('behavior.py').read_text()); print(json.dumps({'probe': 'semantic', 'status': 'pass' if value == 1 else 'fail'}))"
        self.attach_probe_policy(probe_code)
        self.assertEqual(json.loads(self.phase('plan').stdout)['required_probes'], [])
        code = "from pathlib import Path; exec(Path('behavior.py').read_text()); assert value == 1, 'expected value 1'; print('value 1 verified')"
        self.assertNotEqual(self.capture('red', 'baseline', code).returncode, 0)
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.assertEqual(self.phase('implementation').returncode, 0, self.phase('implementation').stdout)
        self.source('final-contract')
        self.edit(lambda r: r['cases'][0].update(source='final-contract', authority_source='final-contract'))
        self.edit(lambda r: r['clarification']['evidence'][0].update(source='final-contract'))
        self.assertEqual(self.capture('green', 'check', code).returncode, 0)
        self.assertNotEqual(self.phase('final').returncode, 0)
        self.assertEqual(self.capture('probe-result', 'check', probe_code).returncode, 0)
        self.edit(lambda r: r.update(probe_results={'semantic': 'probe-result'}))
        self.reviewer(evidence=['final-contract', 'red', 'green', 'probe-result'])
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)

    def test_plan_needs_captured_authority_and_rejects_unknown_contract(self):
        self.initialize()
        self.assertNotEqual(self.phase('plan').returncode, 0)
        self.source()
        self.accepted_plan()
        self.edit(lambda r: r['cases'][0].update(authority_status='unknown'))
        self.assertNotEqual(self.phase('plan').returncode, 0)

    def test_plan_blocks_unresolved_owner_save_policy_before_implementation(self):
        self.initialize('implementation')
        self.source()
        self.edit(lambda r: r.update(
            clarification={'status': 'clear', 'reason': 'The author assumed a personal save.',
                           'questions': ['Does owner adoption change personal preferences or the shared report?'],
                           'evidence': [{'source': 'contract', 'quote': 'The requested value must equal one.'}]},
            findings=[{'id': 'owner-save-target', 'kind': 'decision', 'status': 'open',
                       'reason': 'Save as my view could update personal preferences or the shared report; ask Luis.',
                       'evidence': ['contract']}]))
        result = self.phase('plan')
        self.assertNotEqual(result.returncode, 0,
                            'Unresolved owner-save decision was accepted before implementation: ' + result.stdout)
        self.assertIn('owner-save-target: unresolved', result.stdout)
        self.assertNotIn('plan', self.read())
        self.assertEqual((self.repo / 'behavior.py').read_text(), 'value = 0\n')

    def test_plan_requires_an_explicit_sourced_clarification_assessment(self):
        self.initialize('implementation')
        self.source()
        clear = self.read()['clarification']
        for status in ('unchecked', 'needs_user', 'needs_evidence'):
            with self.subTest(status=status):
                self.edit(lambda r: r['clarification'].update(status=status))
                result = self.phase('plan')
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn('clarification', result.stdout.lower())
        self.edit(lambda r: r.pop('clarification'))
        result = self.phase('plan')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('clarification', result.stdout.lower())
        self.edit(lambda r: r.update(clarification=clear))
        self.accepted_plan()

    def test_clarification_evidence_must_quote_the_captured_source(self):
        self.initialize()
        self.source()
        for evidence in ([], [{'source': 'missing', 'quote': 'approved'}],
                         [{'source': 'contract', 'quote': 'Luis approved changing the shared report.'}]):
            with self.subTest(evidence=evidence):
                self.edit(lambda r: r['clarification'].update(evidence=evidence))
                self.assertNotEqual(self.phase('plan').returncode, 0)
        self.edit(lambda r: r['clarification'].update(
            evidence=[{'source': 'contract', 'quote': 'The requested value must equal one.'}]))
        self.accepted_plan()

    def test_resolved_decision_needs_quoted_authority_before_plan_acceptance(self):
        self.initialize('implementation')
        self.source()
        self.edit(lambda r: r['findings'].append({
            'id': 'requested-value', 'kind': 'decision', 'status': 'fixed',
            'reason': 'Use the explicit requested value.', 'evidence': ['contract']}))
        self.assertNotEqual(self.phase('plan').returncode, 0)
        self.edit(lambda r: r['findings'][0].update(resolution={
            'kind': 'requirement', 'source': 'contract', 'quote': 'The requested value must equal one.'}))
        self.accepted_plan()
        self.edit(lambda r: r['findings'][0]['resolution'].update(kind='agent_assumption'))
        self.assertNotEqual(self.phase('plan').returncode, 0)

    def test_planning_a_known_defect_and_nonblocking_followup_remains_allowed(self):
        self.initialize('implementation')
        self.source()
        self.edit(lambda r: r['findings'].extend([
            {'id': 'wrong-value', 'kind': 'blocker', 'status': 'open',
             'reason': 'The implementation task is to correct this value.', 'evidence': ['contract']},
            {'id': 'copy', 'kind': 'nonblocking', 'status': 'deferred',
             'reason': 'Independent optional copy cleanup.', 'evidence': ['contract']},
        ]))
        self.accepted_plan()

    def test_newly_resolved_review_decision_does_not_require_replanning(self):
        self.complete_review()
        self.edit(lambda r: r['findings'].append({
            'id': 'requested-value', 'kind': 'decision', 'status': 'fixed',
            'reason': 'The original requirement already settles this reviewer question.', 'evidence': ['contract'],
            'resolution': {'kind': 'requirement', 'source': 'contract',
                           'quote': 'The requested value must equal one.'}}))
        self.reviewer(name='peer-decision')
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)

    def test_changed_plan_decision_or_clarification_invalidates_acceptance(self):
        self.initialize()
        self.source()
        self.edit(lambda r: r['findings'].append({
            'id': 'requested-value', 'kind': 'decision', 'status': 'fixed',
            'reason': 'The requirement settles this decision.', 'evidence': ['contract'],
            'resolution': {'kind': 'requirement', 'source': 'contract',
                           'quote': 'The requested value must equal one.'}}))
        self.accepted_plan()
        self.capture('green', 'check', "print('observed behavior')")
        self.reviewer()
        self.assertEqual(self.phase('final').returncode, 0)
        original = self.read()
        self.edit(lambda r: r['findings'][0].update(reason='A different policy is now proposed.'))
        self.assertNotEqual(self.phase('final').returncode, 0)
        self.edit(lambda r: r['findings'].clear())
        self.assertNotEqual(self.phase('final').returncode, 0)
        self.edit(lambda r: r.update(findings=original['findings']))
        self.edit(lambda r: r['clarification'].update(reason='New unresolved policy conflict.'))
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_final_needs_current_reviewed_clarification_evidence(self):
        self.complete_review()
        self.source('decision-source')
        self.edit(lambda r: r['clarification'].update(evidence=[{
            'source': 'decision-source', 'quote': 'The requested value must equal one.'}]))
        self.assertNotEqual(self.phase('final').returncode, 0)
        self.reviewer(evidence=['contract', 'green', 'decision-source'], name='peer-decision')
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)
        self.edit(lambda r: r['captures']['decision-source']['after'].update(tree='stale-source'))
        self.assertNotEqual(self.phase('final').returncode, 0)
        self.source('fresh-decision-source')
        self.edit(lambda r: r['clarification'].update(evidence=[{
            'source': 'fresh-decision-source', 'quote': 'The requested value must equal one.'}]))
        self.reviewer(evidence=['contract', 'green', 'fresh-decision-source'], name='peer-fresh-decision')
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)

    def test_selected_state_cannot_disappear_from_cases(self):
        self.initialize()
        self.source()
        self.edit(lambda r: r['applicability']['transitions'].update(
            applies=True, reason='The retry can fail.', cases=['failed_retry']))
        self.assertNotEqual(self.phase('plan').returncode, 0)

    def test_runtime_evidence_needs_current_independent_assessment(self):
        self.initialize()
        self.source()
        self.accepted_plan()
        self.assertEqual(self.capture('green', 'check', "print('observed behavior')").returncode, 0)
        self.assertNotEqual(self.phase('final').returncode, 0)
        self.reviewer()
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)

    def test_changed_expectation_invalidates_the_plan(self):
        self.complete_review()
        self.edit(lambda r: r['cases'][0].update(expected='a different outcome'))
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_final_validation_rejects_generic_acceptance(self):
        self.complete_review()
        self.reviewer(cases={'value': {'status': 'verified', 'reason': 'Tests passed.'}}, name='legacy')
        result = self.phase('final')
        self.assertNotEqual(result.returncode, 0, 'Generic acceptance must not bypass validation')
        self.assertIn('validation', result.stdout)
        self.assertEqual(self.phase('implementation').returncode, 0, 'Final validation must not change edit authorization')

    def test_final_validation_rejects_unobserved_healthy_path_and_cause(self):
        self.complete_review()
        self.capture('fallback', 'check', "print('resolver failed; fallback value=0')")
        self.edit(lambda r: r['cases'][0].update(result='fallback'))
        self.reviewer(evidence=['contract', 'fallback'], name='fallback-peer')
        report = json.loads(Path(self.read()['captures']['fallback-peer']['artifact']).read_text())
        for field in ('path', 'causality'):
            with self.subTest(field=field):
                cases = json.loads(json.dumps(report['cases']))
                cases['value']['validation'][field] = {
                    'status': 'verified', 'reason': 'Claims successful dependency or a demonstrated failure cause.',
                    'evidence': [{'capture': 'fallback', 'quote': 'resolver succeeded'}],
                }
                self.reviewer(evidence=['contract', 'fallback'], cases=cases, name='unsupported-' + field)
                result = self.phase('final')
                self.assertNotEqual(result.returncode, 0, 'An absent observation cannot support a verification claim')
                self.assertIn('quote is absent', result.stdout)

    def test_final_validation_requires_discrimination_but_allows_unknown_cause(self):
        self.complete_review()
        report = json.loads(Path(self.read()['captures']['peer']['artifact']).read_text())
        cases = report['cases']
        cases['value']['validation']['causality'] = {
            'status': 'unknown', 'reason': 'Mechanism remains unknown; this case claims only the independently observed outcome.',
            'evidence': [],
        }
        self.reviewer(cases=cases, name='unknown-cause')
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)
        cases['value']['validation']['discrimination']['status'] = 'unresolved'
        cases['value']['validation']['discrimination']['reason'] = 'The assertion only checks deleted text and survives removal of the behavior.'
        self.reviewer(cases=cases, name='ineffective-test')
        result = self.phase('final')
        self.assertNotEqual(result.returncode, 0, 'An ineffective assertion cannot support readiness')
        self.assertIn('discrimination', result.stdout)

    def test_final_validation_rejects_missing_malformed_or_unbound_observations(self):
        self.complete_review()
        report = json.loads(Path(self.read()['captures']['peer']['artifact']).read_text())
        self.capture('extra', 'check', "print('extra observation')")
        variants = [None, {}, [], {'status': 'verified', 'reason': 'No references', 'evidence': []},
                    {'status': 'verified', 'reason': 'Malformed reference', 'evidence': ['green']},
                    {'status': 'verified', 'reason': 'Unbound reference',
                     'evidence': [{'capture': 'extra', 'quote': 'extra observation'}]},
                    {'status': 'verified', 'reason': 'Source alone cannot establish runtime execution',
                     'evidence': [{'capture': 'contract', 'quote': 'value = 0'}]}]
        for index, path in enumerate(variants):
            with self.subTest(path=path):
                cases = json.loads(json.dumps(report['cases']))
                cases['value']['validation']['path'] = path
                self.reviewer(cases=cases, name='malformed-' + str(index))
                self.assertNotEqual(self.phase('final').returncode, 0, 'Invalid validation must remain incomplete')

    def test_final_validation_checks_supplemental_case_and_state_bindings(self):
        self.complete_review()
        self.capture('extra', 'check', "print('extra observation')")
        record = self.read()
        report = json.loads(Path(record['captures']['peer']['artifact']).read_text())
        report['cases']['value']['validation']['path']['evidence'].append({'capture': 'extra', 'quote': 'extra observation'})
        for label in ('other-case', 'stale-state'):
            self.record.write_text(json.dumps(record))
            if label == 'other-case':
                self.edit(lambda r: r['captures']['extra'].update(cases=['unrelated']))
            else:
                def stale(r):
                    r['captures']['extra']['before']['tree'] = 'old-state'
                    r['captures']['extra']['after']['tree'] = 'old-state'
                self.edit(stale)
                report['evidence'] = ['contract', 'green', 'extra']
                result = self.capture(label, 'review', 'print(' + repr(json.dumps(report)) + ')', '--reviewer', 'peer')
                self.assertNotEqual(result.returncode, 0, 'Stale validation evidence must be rejected at capture')
                self.assertIn('stale evidence: extra', result.stdout + result.stderr)
                continue
            self.reviewer(evidence=['contract', 'green', 'extra'], cases=report['cases'], name=label)
            result = self.phase('final')
            self.assertNotEqual(result.returncode, 0, 'Supplemental validation must bind the case and current state')
            self.assertIn('does not cover case', result.stdout)

    def test_source_review_validation_does_not_require_runtime_execution(self):
        self.initialize()
        self.edit(lambda r: r['cases'][0].update(method='source'))
        self.source()
        self.accepted_plan()
        self.reviewer(evidence=['contract'])
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)

    def test_final_validation_checks_optional_cause_citations_and_baseline_selection(self):
        self.complete_review()
        self.capture('unselected-baseline', 'baseline', "print('historical observation')")
        report = json.loads(Path(self.read()['captures']['peer']['artifact']).read_text())
        cases = report['cases']
        for status, reference, quote, expected in (
            ('verified', 'green', 'observed behavior', 0),
            ('unknown', 'green', 'absent mechanism', 1),
            ('not_claimed', 'unselected-baseline', 'historical observation', 1),
        ):
            with self.subTest(status=status, reference=reference):
                cases['value']['validation']['causality'] = {
                    'status': status, 'reason': 'Protocol fixture: check supplied citation eligibility.',
                    'evidence': [{'capture': reference, 'quote': quote}],
                }
                self.reviewer(evidence=['contract', 'green', 'unselected-baseline'], cases=cases, name='cause-' + status)
                self.assertEqual(self.phase('final').returncode, expected)

    def test_implementation_cannot_switch_to_review_after_plan(self):
        self.initialize('implementation')
        self.edit(lambda r: r['cases'][0].update(method='source'))
        self.source()
        self.accepted_plan()
        self.edit(lambda r: r.update(mode='review'))
        self.reviewer(evidence=['contract'])
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_source_only_implementation_does_not_become_verified(self):
        self.initialize('implementation')
        self.edit(lambda r: r['cases'][0].update(method='source'))
        self.source()
        self.accepted_plan()
        self.reviewer(evidence=['contract'])
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_real_regression_requires_matching_red_green_commands(self):
        self.initialize('implementation')
        self.source()
        self.accepted_plan()
        code = "from pathlib import Path; exec(Path('behavior.py').read_text()); assert value == 1, 'expected value 1'; print('value 1 verified')"
        red = self.capture('red', 'baseline', code)
        self.assertNotEqual(red.returncode, 0)
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.source('final-contract')
        self.edit(lambda r: r['cases'][0].update(source='final-contract', authority_source='final-contract'))
        self.edit(lambda r: r['clarification']['evidence'][0].update(source='final-contract'))
        self.assertEqual(self.capture('green', 'check', code).returncode, 0)
        self.reviewer(evidence=['final-contract', 'red', 'green'])
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)
        report = json.loads(Path(self.read()['captures']['peer']['artifact']).read_text())
        report['cases']['value']['validation']['discrimination']['evidence'] = [
            citation for citation in report['cases']['value']['validation']['discrimination']['evidence']
            if citation['capture'] != 'red']
        self.reviewer(evidence=['final-contract', 'red', 'green'], cases=report['cases'], name='missing-baseline')
        result = self.phase('final')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('validation discrimination: cite the selected case evidence: red', result.stdout)
        self.edit(lambda r: r['findings'].append({
            'id': 'requested-value', 'kind': 'decision', 'status': 'fixed',
            'reason': 'The review question is settled by the original requirement.', 'evidence': ['final-contract'],
            'resolution': {'kind': 'requirement', 'source': 'final-contract',
                           'quote': 'The requested value must equal one.'}}))
        self.reviewer(evidence=['final-contract', 'red', 'green'], name='peer-decision')
        self.assertEqual(self.phase('final').returncode, 0, self.phase('final').stdout)
        self.edit(lambda r: r['captures']['red'].update(argv=[sys.executable, '-c', 'a different command']))
        self.assertNotEqual(self.phase('final').returncode, 0)

    def test_setup_failure_does_not_count_as_intended_regression(self):
        self.initialize('implementation')
        self.edit(lambda r: r['cases'][0].update(failure='some unrelated failure'))
        self.source()
        self.accepted_plan()
        code = "from pathlib import Path; exec(Path('behavior.py').read_text()); assert value == 1, 'expected value 1'; print('verified')"
        self.capture('red', 'baseline', code)
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.source('final-contract')
        self.edit(lambda r: r['cases'][0].update(source='final-contract', authority_source='final-contract'))
        self.edit(lambda r: r['clarification']['evidence'][0].update(source='final-contract'))
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
        self.accepted_plan()
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
        self.accepted_plan()
        (self.repo / 'behavior.py').write_text('value = 2\n')
        code = "from pathlib import Path; exec(Path('behavior.py').read_text()); assert value == 1, 'expected value 1'; print('value 1 verified')"
        self.capture('red', 'baseline', code)
        (self.repo / 'behavior.py').write_text('value = 1\n')
        self.source('final-contract')
        self.edit(lambda r: r['cases'][0].update(source='final-contract', authority_source='final-contract'))
        self.edit(lambda r: r['clarification']['evidence'][0].update(source='final-contract'))
        self.capture('green', 'check', code)
        self.reviewer(evidence=['final-contract', 'red', 'green'])
        self.assertNotEqual(self.phase('final').returncode, 0)

    def attach_probe_policy(self, code, paths=None):
        policy = self.root / 'probe-policy.json'
        policy.write_text(json.dumps({'version': 1, 'probes': [{
            'id': 'semantic', 'paths': paths or ['behavior.py'],
            'argv': [sys.executable, '-c', code], 'expectation': 'Actual semantic probe must pass.'}]}))
        self.edit(lambda r: r.update(probe_policy=str(policy)))
        self.accepted_plan()

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
        self.accepted_plan()
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
                self.accepted_plan()
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
