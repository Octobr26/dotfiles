import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


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


class SoundNotificationsTest(unittest.TestCase):
    def test_explicit_off_disables_sound_notifications(self):
        self.assertFalse(MODULE.sound_notifications_enabled("off"))
        self.assertFalse(MODULE.sound_notifications_enabled(" OFF "))

    def test_unset_or_on_keeps_sound_notifications_enabled(self):
        self.assertTrue(MODULE.sound_notifications_enabled(""))
        self.assertTrue(MODULE.sound_notifications_enabled("on"))


class GitRootCacheTest(unittest.TestCase):
    @staticmethod
    def pane(
        path: str,
        *,
        pane_id: str = "%1",
        window: str = "@1",
        metadata_project: str = "",
    ):
        return MODULE.Pane(
            "session",
            window,
            pane_id,
            "123",
            "zsh",
            "zsh",
            path,
            "shell",
            "",
            metadata_project,
            "",
            "",
            "",
            "",
        )

    @staticmethod
    def git_result(args, returncode: int, stdout: str):
        return MODULE.subprocess.CompletedProcess(args, returncode, stdout, "")

    def test_reuses_git_root_until_the_cache_entry_expires(self):
        cache = {}
        result = self.git_result(["git"], 0, "/repo\n")

        with (
            patch.object(MODULE.subprocess, "run", return_value=result) as run,
            patch.object(MODULE.time, "monotonic", side_effect=[100.0, 110.0, 161.0]),
        ):
            self.assertEqual(MODULE.git_root("/repo/src", cache), "/repo")
            self.assertEqual(MODULE.git_root("/repo/src", cache), "/repo")
            self.assertEqual(MODULE.git_root("/repo/src", cache), "/repo")

        self.assertEqual(run.call_count, 2)

    def test_negative_git_result_is_cached_until_expiry(self):
        cache = {}
        result = self.git_result(["git"], 1, "")

        with (
            patch.object(MODULE.subprocess, "run", return_value=result) as run,
            patch.object(MODULE.time, "monotonic", side_effect=[100.0, 110.0]),
        ):
            self.assertEqual(MODULE.git_root("/not-a-repo", cache), "")
            self.assertEqual(MODULE.git_root("/not-a-repo", cache), "")

        run.assert_called_once()

    def test_changed_paths_resolve_immediately_and_inactive_paths_are_pruned(self):
        watcher = MODULE.Watcher({}, {}, {}, set())
        first = self.pane("/repo/first")
        second = self.pane("/repo/second")

        def resolve(args, **_kwargs):
            return self.git_result(args, 0, "/repo\n")

        with (
            patch.object(MODULE.subprocess, "run", side_effect=resolve) as run,
            patch.object(MODULE.time, "monotonic", return_value=100.0),
        ):
            watcher.assign_projects([first])
            watcher.assign_projects([first])
            self.assertEqual(run.call_count, 1)

            watcher.assign_projects([second])

        self.assertEqual(run.call_count, 2)
        self.assertNotIn(first.path, watcher.git_roots)
        self.assertIn(second.path, watcher.git_roots)

    def test_project_selection_keeps_metadata_and_window_root_priority(self):
        watcher = MODULE.Watcher({}, {}, {}, set())
        preferred = self.pane(
            "/repo/src", pane_id="%1", metadata_project="/chosen/project"
        )
        window_peer = self.pane("/not-a-repo", pane_id="%2")

        def resolve(args, **_kwargs):
            root = "/repo" if args[2] == "/repo/src" else ""
            return self.git_result(args, 0 if root else 1, f"{root}\n" if root else "")

        with (
            patch.object(MODULE.subprocess, "run", side_effect=resolve),
            patch.object(MODULE.time, "monotonic", return_value=100.0),
        ):
            watcher.assign_projects([preferred, window_peer])

        self.assertEqual(preferred.project, "project")
        self.assertEqual(window_peer.project, "repo")


if __name__ == "__main__":
    unittest.main()
