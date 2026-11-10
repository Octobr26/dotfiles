"""Check reference-rate estimates for tiered and newly added models."""
from pathlib import Path
import runpy
import unittest

PRICING = runpy.run_path(str(Path(__file__).resolve().parent / 'workflow-pricing.py'))


def price(provider, model, **tokens):
    base = {'input': 0, 'read': 0, 'output': 0}
    base.update({'write': 0} if provider == 'codex' else {'write5m': 0, 'write1h': 0})
    result = PRICING['estimate']({'provider': provider, 'model': model, 'tokens': {**base, **tokens}})
    assert result['status'] == 'priced', result
    return result


class PricingTests(unittest.TestCase):
    def test_haiku_5_5_switches_tier_when_cache_reads_push_the_prompt_over_100k(self):
        short = price('claude', 'claude-haiku-5-5', input=50_000, output=50_000)
        long = price('claude', 'claude-haiku-5-5', input=50_000, read=60_000, output=50_000)
        self.assertAlmostEqual(short['usd'], 0.03)
        self.assertAlmostEqual(long['usd'], 50_000 * 0.5e-6 + 60_000 * 0.05e-6 + 50_000 * 2.5e-6)
        self.assertIn('long-prompt-tier', long['assumptions'])

    def test_haiku_5_5_prompt_at_the_threshold_stays_in_the_short_tier(self):
        self.assertNotIn('long-prompt-tier', price('claude', 'claude-haiku-5-5', input=100_000)['assumptions'])

    def test_codex_terra_models_are_priced_with_cache_and_write_rates(self):
        self.assertAlmostEqual(price('codex', 'gpt-6.1-terra', input=100_000, read=100_000, output=100_000)['usd'], 0.605)
        self.assertAlmostEqual(price('codex', 'gpt-5.6-terra', input=100_000, write=100_000, output=100_000)['usd'], 1.65)

    def test_sonnet_5_5_cache_reads_cost_five_percent_of_input(self):
        self.assertAlmostEqual(price('claude', 'claude-sonnet-5-5', read=1_000_000)['usd'], 0.1)

    def test_unknown_models_stay_unpriced(self):
        result = PRICING['estimate']({'provider': 'codex', 'model': 'no-such-model', 'tokens': {}})
        self.assertEqual(result, {'status': 'unpriced', 'reason': 'unknown-model'})


unittest.main()
