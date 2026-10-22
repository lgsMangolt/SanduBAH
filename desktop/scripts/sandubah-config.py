import copy
import pathlib
import re
import sys
import tomllib


MANAGED_ENV = {
    "CLAUDE_FLOW_AUTO_UPDATE", "RUFLO_HELPERS_LOCKED", "RUFLO_DAEMON_AUTOSTART",
    "RUFLO_MCP_SKIP_NPX", "RUFLO_MCP_CLI_OVERRIDE",
}


def parse_document(content):
    return tomllib.loads(content.decode("utf-8-sig"))


def prepare_configuration(content):
    document = parse_document(content)
    text = content.decode("utf-8-sig")
    newline = "\r\n" if "\r\n" in text else "\n"
    for plugin_name in ("ruflo-core@ruflo", "ruflo-swarm@ruflo"):
        plugin = document.get("plugins", {}).get(plugin_name)
        if plugin is None or plugin.get("enabled") is False:
            continue
        header = f'[plugins."{plugin_name}"]'
        section = re.search(
            r"(?m)(^" + re.escape(header) + r"[\t ]*(?:#[^\r\n]*)?\r?\n)([\s\S]*?)(?=^\[|\Z)", text,
        )
        if section is None:
            raise ValueError(f"Unsupported plugin table format: {plugin_name}")
        body, replacement_count = re.subn(
            r"(?m)^([\t ]*enabled[\t ]*=[\t ]*)(true|false)([\t ]*(?:#[^\r\n]*)?)(\r?$)",
            r"\g<1>false\g<3>\g<4>", section.group(2),
        )
        if replacement_count != 1:
            raise ValueError(f"Expected exactly one enabled field: {plugin_name}")
        text = text[: section.start(2)] + body + text[section.end(2) :]
    server = document.get("mcp_servers", {}).get("ruflo")
    if server is None:
        raise ValueError("The staged configuration has no ruflo MCP server")
    if "startup_timeout_sec" not in server:
        header = re.search(r"(?m)^\[mcp_servers\.ruflo\][\t ]*(?:#[^\r\n]*)?(?:\r?\n|\Z)", text)
        if header is None:
            raise ValueError("Unsupported ruflo MCP table format")
        separator = "" if header.group().endswith("\n") else newline
        text = text[: header.end()] + separator + "startup_timeout_sec = 60.0" + newline + text[header.end() :]
    prepared = text.encode("utf-8")
    if content.startswith(b"\xef\xbb\xbf"):
        prepared = b"\xef\xbb\xbf" + prepared
    parse_document(prepared)
    return prepared


def unrelated_configuration(document):
    remaining = copy.deepcopy(document)
    for plugin_name in ("ruflo-core@ruflo", "ruflo-swarm@ruflo"):
        plugin = remaining.get("plugins", {}).get(plugin_name)
        if plugin is not None:
            plugin.pop("enabled", None)
    servers = remaining.get("mcp_servers", {})
    server = servers.get("ruflo")
    if server is not None:
        for field in ("command", "args", "startup_timeout_sec"):
            server.pop(field, None)
        environment = server.get("env", {})
        for field in MANAGED_ENV:
            environment.pop(field, None)
        if "env" in server and not environment:
            server.pop("env")
        if not server:
            servers.pop("ruflo")
        if "mcp_servers" in remaining and not servers:
            remaining.pop("mcp_servers")
    return remaining


def validate_configuration(original, candidate, node_executable, launcher_path, cli_entry):
    original_document = parse_document(original)
    candidate_document = parse_document(candidate)
    if unrelated_configuration(original_document) != unrelated_configuration(candidate_document):
        raise ValueError("Refusing to change unrelated Codex settings")
    original_timeout = original_document.get("mcp_servers", {}).get("ruflo", {}).get("startup_timeout_sec")
    server = candidate_document["mcp_servers"]["ruflo"]
    if original_timeout is not None and server.get("startup_timeout_sec") != original_timeout:
        raise ValueError("Refusing to change the existing startup timeout")
    if server.get("command") != node_executable or server.get("args") != [launcher_path]:
        raise ValueError("The MCP server does not point at the local launcher")
    if server.get("enabled") is False:
        raise ValueError("The ruflo MCP server is disabled; enable it explicitly before installing")
    environment = server.get("env", {})
    expected_environment = {
        "CLAUDE_FLOW_AUTO_UPDATE": "false", "RUFLO_HELPERS_LOCKED": "true",
        "RUFLO_DAEMON_AUTOSTART": "0", "RUFLO_MCP_SKIP_NPX": "1",
        "RUFLO_MCP_CLI_OVERRIDE": cli_entry,
    }
    for name, value in expected_environment.items():
        if environment.get(name) != value:
            raise ValueError(f"Incorrect local MCP environment setting: {name}")
    for plugin_name in ("ruflo-core@ruflo", "ruflo-swarm@ruflo"):
        plugin = candidate_document.get("plugins", {}).get(plugin_name)
        if plugin is not None and plugin.get("enabled") is not False:
            raise ValueError(f"The upstream plugin is still enabled: {plugin_name}")


def main():
    action, *arguments = sys.argv[1:]
    if action == "prepare":
        config_path = pathlib.Path(arguments[0])
        config_path.write_bytes(prepare_configuration(config_path.read_bytes()))
        print("STAGED_TOML_VALID")
    elif action == "validate":
        original_path, candidate_path, node_executable, launcher_path, cli_entry = arguments
        validate_configuration(pathlib.Path(original_path).read_bytes(), pathlib.Path(candidate_path).read_bytes(), node_executable, launcher_path, cli_entry)
        print("UNRELATED_CODEX_SETTINGS_PRESERVED")
    else:
        raise ValueError(f"Unknown action: {action}")


if __name__ == "__main__":
    main()
