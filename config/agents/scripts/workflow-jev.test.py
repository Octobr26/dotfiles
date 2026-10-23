import math
import copy
from pathlib import Path
import runpy
import unittest


JEV = runpy.run_path(str(Path(__file__).with_name('workflow-jev.py')))


class UncertaintyTests(unittest.TestCase):
    def test_uncertain_correction_remains_unknown(self):
        self.assertEqual(JEV['resolved_choice']({'choice': 'correction', 'confidence': 0.35}), 'unknown')

    def test_confident_correction_is_preserved(self):
        self.assertEqual(JEV['resolved_choice']({'choice': 'correction', 'confidence': 0.95}), 'correction')

    def test_nonfinite_confidence_is_not_actionable(self):
        self.assertEqual(JEV['resolved_choice']({'choice': 'acceptance', 'confidence': math.nan}), 'unknown')


class ResponseBoundaryTests(unittest.TestCase):
    def test_invalid_provider_choices_are_rejected(self):
        questions = {'kind': {'criteria': {'correction': 'repair', 'unknown': 'insufficient'}}}
        response = {'model': 'jev-1.13.0', 'usage': {'input_tokens': 100, 'output_tokens': 20},
                    'answers': {'kind': {'type': 'choice', 'choice': 'correction', 'confidence': 0.9,
                                         'probabilities': {'correction': 0.9, 'unknown': 0.1}}}}
        JEV['validate_answers'](response, questions)
        for invalid in [[], 'acceptance']:
            with self.subTest(choice=invalid):
                candidate = copy.deepcopy(response)
                candidate['answers']['kind']['choice'] = invalid
                with self.assertRaisesRegex(ValueError, 'invalid-choice'):
                    JEV['validate_answers'](candidate, questions)
        for probabilities in [{'correction': math.nan, 'unknown': 0.1},
                              {'correction': 0.7, 'unknown': 0.7},
                              {'correction': 0.9}, {'correction': 0.2, 'unknown': 0.8}]:
            with self.subTest(probabilities=probabilities):
                candidate = copy.deepcopy(response)
                candidate['answers']['kind']['probabilities'] = probabilities
                with self.assertRaisesRegex(ValueError, 'invalid-choice'):
                    JEV['validate_answers'](candidate, questions)

    def test_boolean_token_count_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'invalid-usage'):
            JEV['validate_answers']({'model': 'jev', 'usage': {'input_tokens': True, 'output_tokens': 0},
                                      'answers': {}}, {})

    def test_failures_consume_the_automatic_call_budget(self):
        calls = [{'purpose': 'followup-classification', 'status': 'failed'},
                 {'purpose': 'weekly-triage', 'status': 'success'},
                 {'purpose': 'skill-route', 'status': 'success'}]
        self.assertEqual(JEV['enrichment_calls_remaining']({'max_calls_per_day': 2}, calls), 0)
        self.assertEqual(JEV['enrichment_calls_remaining']({'max_calls_per_day': 3}, calls), 1)


class FollowupTests(unittest.TestCase):
    def test_recheck_keeps_a_provisional_category_and_its_uncertainty(self):
        event = {'event_id': 'id', 'provider': 'codex', 'session_id': 's', 'turn_id': 't',
                 'timestamp': 1, 'context_sha256': 'hash', 'context': {'followup': 'private text'}}
        answers = {name: {'type': 'choice', 'choice': choice, 'confidence': confidence,
                         'probabilities': {choice: 1}, 'explanation': 'private text'}
                   for name, choice, confidence in [('kind0', 'clarification', 0.6),
                      ('category0', 'review', 0.9), ('friction0', 'communication', 0.9)]}
        row = JEV['recheck_rows']([event], {'call_id': 'call', 'model': 'jev-1.13.0', 'answers': answers})[0]
        self.assertEqual(row['predictions'], {'kind': 'clarification', 'category': 'review', 'friction': 'communication'})
        self.assertEqual(row['uncertain_fields'], ['kind'])
        self.assertEqual(row['source'], 'jev-inferred-recheck')
        self.assertNotIn('context', row)
        self.assertNotIn('explanation', row['judgments']['kind'])

    def test_codex_native_turns_skip_instructions_and_duplicate_users(self):
        rows = [
            {'type': 'session_meta', 'payload': {'id': 'session', 'cwd': '/work/project'}},
            {'type': 'event_msg', 'payload': {'type': 'task_started', 'turn_id': 'first'}},
            {'type': 'response_item', 'timestamp': '2026-10-07T01:00:00Z',
             'payload': {'type': 'message', 'role': 'user', 'content': '<environment_context>setup'}},
            {'type': 'response_item', 'timestamp': '2026-10-07T01:00:01Z',
             'payload': {'type': 'message', 'role': 'user', 'content': 'Fix the error'}},
            {'type': 'response_item', 'payload': {'type': 'message', 'role': 'assistant',
             'channel': 'analysis', 'content': 'private reasoning'}},
            {'type': 'response_item', 'payload': {'type': 'message', 'role': 'assistant',
             'channel': 'final', 'content': 'Fixed and checked'}},
            {'type': 'event_msg', 'payload': {'type': 'task_started', 'turn_id': 'second'}},
            {'type': 'response_item', 'timestamp': '2026-10-07T01:01:00Z',
             'payload': {'type': 'message', 'role': 'user', 'content': 'The error still happens'}},
        ]
        events = JEV['followups'](rows + [rows[-1]], 'codex', '/work', 0)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['event_id'], 'codex:session:second')
        self.assertEqual(events[0]['context'], {'previous_request': 'Fix the error',
            'previous_response': 'Fixed and checked', 'followup': 'The error still happens'})

    def test_claude_uses_latest_text_and_ignores_tool_results(self):
        rows = [
            {'type': 'user', 'sessionId': 'session', 'cwd': '/work/project', 'uuid': 'first',
             'timestamp': '2026-10-07T01:00:00Z', 'message': {'content': 'Add a control'}},
            {'type': 'assistant', 'message': {'content': [{'type': 'text', 'text': 'Starting'}]}},
            {'type': 'user', 'uuid': 'tool-result', 'message': {'content': [{'type': 'tool_result', 'content': 'done'}]}},
            {'type': 'assistant', 'message': {'content': [{'type': 'text', 'text': 'Added and verified'}]}},
            {'type': 'user', 'uuid': 'second', 'timestamp': '2026-10-07T01:01:00Z',
             'message': {'content': 'Where is the control?'}},
        ]
        events = JEV['followups'](rows, 'claude', '/work', 0)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['turn_id'], 'second')
        self.assertEqual(events[0]['context']['previous_response'], 'Added and verified')

    def test_outside_workspace_breaks_previous_context(self):
        rows = [
            {'type': 'user', 'sessionId': 'session', 'cwd': '/work/project', 'uuid': 'first',
             'timestamp': '2026-10-07T01:00:00Z', 'message': {'content': 'Work here'}},
            {'type': 'assistant', 'message': {'content': 'Done'}},
            {'type': 'user', 'cwd': '/other', 'uuid': 'outside', 'timestamp': '2026-10-07T01:01:00Z',
             'message': {'content': 'Work elsewhere'}},
            {'type': 'assistant', 'message': {'content': 'Done elsewhere'}},
            {'type': 'user', 'cwd': '/work/project', 'uuid': 'return', 'timestamp': '2026-10-07T01:02:00Z',
             'message': {'content': 'Now back here'}},
        ]
        self.assertEqual(JEV['followups'](rows, 'claude', '/work', 0), [])

    def test_child_transcripts_are_excluded(self):
        rows = [{'type': 'session_meta', 'payload': {'id': 'child', 'cwd': '/work', 'source': {'subagent': 'parent'}}},
                {'type': 'event_msg', 'payload': {'type': 'task_started', 'turn_id': 'first'}},
                {'type': 'response_item', 'timestamp': '2026-10-07T01:00:00Z',
                 'payload': {'type': 'message', 'role': 'user', 'content': 'Task'}},
                {'type': 'response_item', 'payload': {'type': 'message', 'role': 'assistant', 'channel': 'final', 'content': 'Done'}},
                {'type': 'event_msg', 'payload': {'type': 'task_started', 'turn_id': 'second'}},
                {'type': 'response_item', 'timestamp': '2026-10-07T01:01:00Z',
                 'payload': {'type': 'message', 'role': 'user', 'content': 'Fix it'}}]
        self.assertEqual(JEV['followups'](rows, 'codex', '/work', 0), [])

    def test_excerpts_are_bounded_and_redact_common_credentials(self):
        text = 'api_key=credential Bearer credential password: credential ' + 'x' * 4000
        result = JEV['excerpt'](text, 1200)
        self.assertEqual(len(result), 1200)
        self.assertNotIn('credential', result)

    def test_persisted_labels_keep_uncertainty_and_discard_text(self):
        event = {'event_id': 'id', 'provider': 'codex', 'session_id': 's', 'turn_id': 't',
                 'timestamp': 1, 'context_sha256': 'hash', 'context': {'followup': 'private text'}}
        answers = {name: {'type': 'choice', 'choice': choice, 'confidence': confidence,
                         'probabilities': {choice: 1}, 'explanation': 'private text'}
                   for name, choice, confidence in [('kind0', 'correction', 0.4),
                      ('category0', 'debugging', 0.4), ('friction0', 'implementation', 0.9)]}
        row = JEV['interaction_rows']([event], {'call_id': 'call', 'answers': answers})[0]
        self.assertEqual((row['kind'], row['category'], row['friction']), ('unknown', 'unknown', 'unknown'))
        self.assertNotIn('context', row)
        self.assertNotIn('explanation', row['judgments']['kind'])


class TriageTests(unittest.TestCase):
    def test_no_experiment_is_invented_for_uncertain_or_accepted_followups(self):
        labels = [{'kind': 'unknown', 'friction': 'workflow'}, {'kind': 'acceptance', 'friction': 'workflow'}]
        state, questions = JEV['triage_request'](labels)
        self.assertEqual(state['candidates'], {})
        self.assertEqual(set(questions['experiment']['criteria']), {'gather-data'})

    def test_repeated_friction_has_traceable_evidence(self):
        labels = [{'kind': 'correction', 'friction': 'verification', 'provider': 'codex',
                   'session_id': session, 'category': 'implementation', 'event_id': event}
                  for session, event in [('a', 'one'), ('b', 'two')]]
        candidates = JEV['triage_candidates'](labels)
        self.assertEqual(candidates['verification']['observed_followups'], 2)
        self.assertEqual(candidates['verification']['sessions'], 2)
        self.assertEqual(candidates['verification']['evidence_ids'], ['one', 'two'])


if __name__ == '__main__':
    unittest.main()
