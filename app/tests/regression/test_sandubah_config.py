import importlib.util
import pathlib
import unittest


SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "sandubah-config.py"
MODULE_SPEC = importlib.util.spec_from_file_location("sandubah_config", SCRIPT_PATH)
config = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(config)


BASE_CONFIGURATION = '''model = "keep-my-model"
[plugins."ruflo-core@ruflo"]
enabled = false

[plugins."ruflo-swarm@ruflo"]
enabled = true # keep this explanation

[mcp_servers.other]
command = "keep-other-server"

[mcp_servers.ruflo]
command = "node-local"
args = ["launcher-local"]
tool_timeout_sec = 123
enabled_tools = ["memory_search"]

[mcp_servers.ruflo.env]
CUSTOM_SETTING = "keep"
CLAUDE_FLOW_AUTO_UPDATE = "false"
RUFLO_HELPERS_LOCKED = "true"
RUFLO_DAEMON_AUTOSTART = "0"
RUFLO_MCP_SKIP_NPX = "1"
RUFLO_MCP_CLI_OVERRIDE = "cli-local"
'''


class SanduBAHConfigTests(unittest.TestCase):
    def validate(self, original, candidate):
        config.validate_configuration(original, candidate, "node-local", "launcher-local", "cli-local")

    def test_preserves_newlines_comments_and_other_settings(self):
        for newline in ("\n", "\r\n"):
            for final_newline in (True, False):
                with self.subTest(newline=repr(newline), final_newline=final_newline):
                    text = BASE_CONFIGURATION if final_newline else BASE_CONFIGURATION.rstrip("\n")
                    original = text.replace("\n", newline).encode()
                    prepared = config.prepare_configuration(original)
                    self.validate(original, prepared)
                    self.assertIn(b"enabled = false # keep this explanation", prepared)
                    self.assertIn((newline + newline + "[mcp_servers.other]").encode(), prepared)
                    if newline == "\r\n":
                        self.assertNotIn(b"\n", prepared.replace(b"\r\n", b""))

    def test_preserves_bom_and_existing_timeout(self):
        original = b"\xef\xbb\xbf" + BASE_CONFIGURATION.replace('command = "node-local"', 'startup_timeout_sec = 75\ncommand = "node-local"').encode()
        prepared = config.prepare_configuration(original)
        self.assertTrue(prepared.startswith(b"\xef\xbb\xbf"))
        self.validate(original, prepared)
        self.assertEqual(config.parse_document(prepared)["mcp_servers"]["ruflo"]["startup_timeout_sec"], 75)

    def test_rejects_unrelated_changes_and_policy_weakening(self):
        original = BASE_CONFIGURATION.encode()
        prepared = config.prepare_configuration(original)
        for before, after in (
            (b"keep-my-model", b"different-model"),
            (b'tool_timeout_sec = 123', b'tool_timeout_sec = 999'),
            (b'enabled_tools = ["memory_search"]', b'enabled_tools = ["all"]'),
            (b'CUSTOM_SETTING = "keep"', b'CUSTOM_SETTING = "changed"'),
            (b'keep-other-server', b'changed-other-server'),
        ):
            with self.subTest(before=before):
                with self.assertRaisesRegex(ValueError, "unrelated"):
                    self.validate(original, prepared.replace(before, after))

    def test_is_idempotent_and_rejects_corrupt_input(self):
        prepared = config.prepare_configuration(BASE_CONFIGURATION.encode())
        self.assertEqual(config.prepare_configuration(prepared), prepared)
        with self.assertRaises(Exception):
            config.prepare_configuration(b'enabled = false[plugins."broken"]')

    def test_adjacent_sections_without_blank_line_stay_separate(self):
        original = BASE_CONFIGURATION.replace("\n\n[", "\n[").encode()
        prepared = config.prepare_configuration(original)
        self.validate(original, prepared)
        self.assertIn(b'explanation\n[mcp_servers.other]', prepared)


if __name__ == "__main__":
    unittest.main()
