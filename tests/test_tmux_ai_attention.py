import contextlib
import importlib.util
import io
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

    def test_prompt_survives_trailing_blank_padding(self):
        """A tall or detached pane pads the screen with blank lines.

        classify() windowed the last 24 RAW lines, so on a 73-row pane holding
        16 lines of content the window was entirely blank, PROMPT never matched,
        and the pane fell through to the unconditional `working` fallback and
        stuck there permanently.
        """
        screen = "\u203a Ask Codex to do anything\n" + "\n" * 58
        self.assertEqual(MODULE.classify("codex", screen), "idle")

    def test_completed_marker_survives_trailing_blank_padding(self):
        screen = "\u2022 Done.\n\u203a Ask Codex to do anything\n" + "\n" * 58
        self.assertEqual(MODULE.classify("codex", screen), "done")


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

    def test_claude_subagent_stop_does_not_change_state(self):
        """A subagent finishing says nothing about the pane, so it must not override.

        Mapping it to `done` finishes a pane whose main agent is still running.
        Mapping it to `working` un-finishes a pane whose Stop already fired, which
        the background-work case above shows really happens.
        """
        self.assertIsNone(MODULE.hook_state({"hook_event_name": "SubagentStop"}))

    def test_stop_then_subagent_stop_leaves_the_pane_done(self):
        """The regression this guards: Stop -> done must survive a later SubagentStop."""
        self.assertEqual(MODULE.hook_state({"hook_event_name": "Stop"}), "done")
        self.assertIsNone(MODULE.hook_state({"hook_event_name": "SubagentStop"}))

    def test_stop_failure_is_blocked(self):
        """An API-ended turn needs the user; without this the pane sticks on working."""
        self.assertEqual(
            MODULE.hook_state({"hook_event_name": "StopFailure"}), "blocked"
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


class PollFocusedDoneTest(unittest.TestCase):
    """Regression cover for done -> idle, driven through Watcher.poll()."""

    @staticmethod
    def pane_row(pane_id: str, state: str, source: str) -> str:
        return MODULE.SEP.join(
            [
                "session", "@1", pane_id, "123", "codex", "codex", "/tmp",
                "title", "codex", "", "CODEX", "", state, source,
            ]
        )

    def poll_with(self, focused: str, state: str, pane_id: str = "%1"):
        """Run a real poll() against a fake tmux and return the option writes."""
        writes = []

        def fake_tmux(*args, **kwargs):
            if args[0] == "list-panes":
                return self.pane_row(pane_id, state, "codex-hook") + "\n"
            if args[0] == "display-message":
                return focused + "\n"
            if args[0] == "capture-pane":
                return "\u203a ready\n"
            if args[0] == "set-option":
                writes.append(args)
            return ""

        with (
            patch.object(MODULE, "tmux", side_effect=fake_tmux),
            patch.object(MODULE, "process_children", return_value={}),
            patch.object(MODULE, "git_root", return_value=""),
            patch.object(MODULE, "play"),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            MODULE.Watcher({}, {}, {}, set()).poll()
        return writes

    def pane_state_written(self, writes, pane_id: str = "%1"):
        for args in writes:
            if "@pane_state" in args and pane_id in args:
                return args[-1]
        return None

    def test_focused_done_becomes_idle(self):
        writes = self.poll_with(focused="%1", state="done")
        self.assertEqual(self.pane_state_written(writes), "idle")

    def test_unfocused_done_stays_done(self):
        writes = self.poll_with(focused="%9", state="done")
        self.assertIsNone(self.pane_state_written(writes))

    def test_focused_blocked_is_not_cleared(self):
        writes = self.poll_with(focused="%1", state="blocked")
        self.assertIsNone(self.pane_state_written(writes))

    def test_focused_working_is_not_cleared(self):
        writes = self.poll_with(focused="%1", state="working")
        self.assertIsNone(self.pane_state_written(writes))
