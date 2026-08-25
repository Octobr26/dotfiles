import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "tmux-ai-attention.py"
SPEC = importlib.util.spec_from_file_location("tmux_ai_attention", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ClassifyClaudePaneTest(unittest.TestCase):
    def test_prompt_without_background_agent_is_idle(self):
        self.assertEqual(MODULE.classify("✳ Claude Code", "❯ next task\n"), "idle")


class HookStateTest(unittest.TestCase):
    def test_claude_stop_with_background_work_is_done(self):
        payload = {
            "hook_event_name": "Stop",
            "background_tasks": [
                {"id": "agent-1", "type": "subagent", "status": "running"}
            ],
        }

        self.assertEqual(MODULE.hook_state(payload), "done")

    def test_claude_stop_without_background_work_is_done(self):
        self.assertEqual(MODULE.hook_state({"hook_event_name": "Stop"}), "done")

    def test_claude_subagent_stop_is_done(self):
        self.assertEqual(
            MODULE.hook_state({"hook_event_name": "SubagentStop"}), "done"
        )


if __name__ == "__main__":
    unittest.main()
