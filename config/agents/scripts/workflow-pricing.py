"""Reference-rate token estimates. No transcript text or network calls."""
import json
from pathlib import Path

RATE_FILE = Path(__file__).resolve().parents[1] / 'usage-pricing.json'
RATES = json.loads(RATE_FILE.read_text())


def select_rates(rates, tokens):
    """Return flat per-token rates, applying a prompt-length tier when the model defines one."""
    tier = rates.get('long_context')
    base = {key: value for key, value in rates.items() if key != 'long_context'}
    if not tier:
        return base, False
    # Prompt length counts every input token, including cache reads and writes.
    prompt = sum(tokens.get(key, 0) for key in ('input', 'read', 'write5m', 'write1h'))
    if prompt > tier['threshold']:
        return {**base, **{key: value for key, value in tier.items() if key != 'threshold'}}, True
    return base, False


def estimate(record):
    """Price one request; reasoning is already included in output."""
    rates = RATES['models'].get(record.get('model'))
    if not rates:
        return {'status': 'unpriced', 'reason': 'unknown-model'}
    if record.get('error'):
        return {'status': 'unpriced', 'reason': record['error']}
    tokens = record['tokens']
    multiplier = 1
    assumptions = ['current-reference-rates', 'API-equivalent-not-billed']
    tier = record.get('service_tier')
    speed = record.get('speed')
    if record['provider'] == 'codex':
        # Codex transcripts currently omit the served API tier and geography.
        assumptions.append('standard-global-rate')
        if tier not in (None, 'standard', 'default') or speed not in (None, 'standard'):
            return {'status': 'unpriced', 'reason': 'unsupported-service-modifier'}
        long = sum(tokens.get(k, 0) for k in ('input', 'read', 'write')) > 272000
        if long:
            assumptions.append('long-context-premium')
        value = sum(tokens.get(k, 0) * rates[k] * (1.5 if k == 'output' else 2 if long else 1)
                    for k in rates if k != 'output')
        value += tokens['output'] * rates['output'] * (1.5 if long else 1)
    else:
        if tier not in (None, 'standard') or speed not in (None, 'standard', 'fast'):
            return {'status': 'unpriced', 'reason': 'unsupported-service-modifier'}
        if speed == 'fast':
            if record['model'] != 'claude-opus-5-5':
                return {'status': 'unpriced', 'reason': 'unsupported-fast-model'}
            multiplier *= 2
        elif speed is None:
            assumptions.append('standard-speed')
        geo = record.get('inference_geo')
        if geo == 'us':
            multiplier *= 1.1
        elif geo in (None, 'not_available'):
            assumptions.append('global-rate-geography-unavailable')
        elif geo != 'global':
            return {'status': 'unpriced', 'reason': 'unsupported-geography'}
        rates, long_prompt = select_rates(rates, tokens)
        if long_prompt:
            assumptions.append('long-prompt-tier')
        value = sum(tokens.get(k, 0) * rate for k, rate in rates.items())
    return {'status': 'priced', 'usd': value * multiplier / 1000000,
            'rate_version': RATES['verified_at'], 'assumptions': assumptions}


def numeric(usage, key):
    value = usage.get(key)
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError('missing-or-invalid-token-count')
    return value


def normalize(provider, usage):
    try:
        if provider == 'codex':
            total = numeric(usage, 'input_tokens')
            read = numeric(usage, 'cached_input_tokens')
            write = numeric(usage, 'cache_write_input_tokens')
            if read + write > total:
                raise ValueError('invalid-cache-partitions')
            tokens = {'input': total - read - write, 'read': read, 'write': write,
                      'output': numeric(usage, 'output_tokens')}
        else:
            write = numeric(usage, 'cache_creation_input_tokens')
            ttl = usage.get('cache_creation') or {}
            if not isinstance(ttl, dict):
                raise ValueError('invalid-cache-write-partitions')
            if write and not ttl:
                raise ValueError('cache-write-TTL-unavailable')
            five = numeric(ttl, 'ephemeral_5m_input_tokens') if write else 0
            hour = numeric(ttl, 'ephemeral_1h_input_tokens') if write else 0
            if five + hour != write:
                raise ValueError('invalid-cache-write-partitions')
            tokens = {'input': numeric(usage, 'input_tokens'),
                      'read': numeric(usage, 'cache_read_input_tokens'),
                      'write5m': five, 'write1h': hour,
                      'output': numeric(usage, 'output_tokens')}
        return {'tokens': tokens}
    except ValueError as error:
        return {'error': str(error)}


def requests(path, provider, workspace, within, timestamp):
    """Deduplicate Claude streaming records and Codex native response usage."""
    cwd = model = session = turn = None
    result = {}
    with path.open(errors='replace') as stream:
        for line in stream:
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if not isinstance(row, dict):
                continue
            payload = row.get('payload') or {}
            if not isinstance(payload, dict):
                continue
            usage = event_id = None
            if provider == 'claude':
                cwd = row.get('cwd') or cwd
                session = row.get('sessionId') or session
                message = row.get('message') or {}
                if row.get('type') == 'assistant' and isinstance(message, dict):
                    usage = message.get('usage')
                    model = message.get('model')
                    event_id = message.get('id')
            else:
                if row.get('type') == 'session_meta':
                    cwd = payload.get('cwd') or cwd
                    session = payload.get('id') or session
                elif row.get('type') == 'turn_context':
                    cwd = payload.get('cwd') or cwd
                    model = payload.get('model')
                    turn = payload.get('turn_id')
                elif row.get('type') == 'token_usage_record':
                    usage = payload.get('usage')
                    response = payload.get('response_id')
                    thread = payload.get('thread_id') or session
                    event_id = f'{thread}:{response}' if thread and response else None
            if not event_id or not isinstance(usage, dict) or not within(cwd, workspace):
                continue
            when = timestamp(row.get('timestamp'))
            if not when or not session:
                continue
            record = {'provider': provider, 'event_id': event_id, 'session_id': session,
                      'timestamp': when, 'model': model, 'turn_id': turn,
                      **normalize(provider, usage)}
            for key in ('speed', 'service_tier', 'inference_geo'):
                record[key] = usage.get(key)
            # Some streaming records have provisional output counts: preserve maxima.
            previous = result.get(event_id)
            if previous and 'tokens' in previous and 'tokens' in record:
                record['tokens'] = {k: max(v, previous['tokens'].get(k, 0))
                                    for k, v in record['tokens'].items()}
                record['timestamp'] = min(when, previous['timestamp'])
            elif previous and 'tokens' in previous:
                record = previous
            result[event_id] = record
    return list(result.values())
