import argparse
import csv
import hashlib
import importlib.metadata
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import threading
import time
from contextlib import contextmanager
from decimal import Decimal
from datetime import datetime, timezone
from uuid import uuid4


REVISION = "1cfe254e8d25b15f37048c3730134686abe60335"


def within(root, filename):
    return Path(filename).resolve().is_relative_to(Path(root).resolve())


def verify_installation(base):
    source = base / "source"
    if not within(base, sys.prefix) or Path(sys.prefix).name != "venv":
        raise ValueError("Execute com o Python do ambiente virtual desta instalação.")
    environment = {name: value for name, value in os.environ.items() if name.upper() in {
        "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "PATH",
    }}
    environment.update(GIT_CONFIG_GLOBAL="NUL" if os.name == "nt" else "/dev/null", GIT_CONFIG_NOSYSTEM="1")
    git = shutil.which("git")
    if not git:
        raise ValueError("Git local necessário para verificar a revisão; nada será instalado.")
    revision = subprocess.run([git, "-C", str(source), "rev-parse", "HEAD"], check=True,
                              capture_output=True, text=True, env=environment, timeout=15).stdout.strip()
    if revision != REVISION:
        raise ValueError("Revisão upstream diferente da estudada.")
    subprocess.run([git, "-C", str(source), "diff", "--no-ext-diff", "--no-textconv", "--exit-code", "HEAD", "--", "harness2", "pyproject.toml", "LICENSE"],
                   check=True, capture_output=True, env=environment, timeout=15)
    if (source / ".env").exists():
        raise ValueError("Não use uma cópia com .env nesta demonstração sem credenciais.")
    distribution = importlib.metadata.distribution("harness2")
    if distribution.version != "0.1.0":
        raise ValueError("Versão instalada não corresponde à revisão estudada.")
    packages = sorted(item.metadata["Name"] for item in importlib.metadata.distributions())
    if packages != ["harness2"]:
        raise ValueError("O ambiente isolado contém pacotes além do núcleo aprovado.")
    manifest = {}
    installed = Path(distribution.locate_file("harness2"))
    archive = subprocess.run([git, "-C", str(source), "archive", "--format=tar", "HEAD", "harness2"],
                             check=True, capture_output=True, env=environment, timeout=15).stdout
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as snapshot:
        sources = {member.name.removeprefix("harness2/"): snapshot.extractfile(member).read()
                   for member in snapshot.getmembers() if member.isfile() and member.name.endswith(".py")}
    targets = {filename.relative_to(installed).as_posix(): filename for filename in installed.rglob("*.py")}
    if sources.keys() != targets.keys():
        raise ValueError("Conjunto de módulos instalado diverge dos fontes.")
    for name, content in sources.items():
        target = targets[name].read_bytes()
        if target.replace(b"\r\n", b"\n") != content.replace(b"\r\n", b"\n"):
            raise ValueError("Módulo instalado alterado: " + name)
        manifest[name] = {"sourceSha256": hashlib.sha256(content).hexdigest(),
                          "installedSha256": hashlib.sha256(target).hexdigest(),
                          "lfSha256": hashlib.sha256(content.replace(b"\r\n", b"\n")).hexdigest()}
    wheels = list((base / "wheels").glob("harness2-0.1.0-*.whl"))
    if len(wheels) != 1:
        raise ValueError("Esperado um único wheel local desta versão.")
    return {"revision": revision, "version": distribution.version, "packages": packages, "modules": manifest,
            "wheelSha256": hashlib.sha256(wheels[0].read_bytes()).hexdigest(), "pythonVersion": sys.version.split()[0]}


def isolate_environment(root):
    keep = {name: value for name, value in os.environ.items() if name.upper() in {
        "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "PATH", "PROCESSOR_ARCHITECTURE", "OS",
    }}
    for name in ("home", "tmp"):
        (root / name).mkdir()
    keep.update(HOME=str(root / "home"), USERPROFILE=str(root / "home"),
                APPDATA=str(root / "home" / "roaming"), LOCALAPPDATA=str(root / "home" / "local"),
                TEMP=str(root / "tmp"), TMP=str(root / "tmp"), PYTHONUTF8="1", PYTHONDONTWRITEBYTECODE="1")
    os.environ.clear()
    os.environ.update(keep)
    os.chdir(root)
    sys.dont_write_bytecode = True


class SerialEvidence:
    def __init__(self):
        self.lock = threading.Lock()
        self.active = 0
        self.maximum = 0
        self.executions = 0
        self.editors = 0

    @contextmanager
    def enter(self, kind):
        with self.lock:
            self.active += 1
            self.maximum = max(self.maximum, self.active)
            if self.active != 1:
                self.active -= 1
                raise RuntimeError("Concorrência maior que um bloqueada.")
            if kind == "execution":
                self.executions += 1
            else:
                self.editors += 1
        try:
            yield
        finally:
            with self.lock:
                self.active -= 1


def portable_tree_reader(tree):
    original = tree.read_tree

    def read(surface, directory, *, rejected=None):
        skipped = []
        result = original(surface, directory, rejected=skipped)
        stubs = {tree.normalize_rel(name) for name, _content in surface.stubs}
        normalized = {tree.normalize_rel(name): content for name, content in result.items()
                      if tree.normalize_rel(name) not in stubs}
        if rejected is not None:
            rejected.extend(tree.normalize_rel(name) for name in skipped if tree.normalize_rel(name) not in stubs)
        return normalized

    return read


def constrain_demo(root, base_script):
    accepted = {base_script, base_script.replace(" if amount > 0", "")}
    approved = set()
    original_run = subprocess.run

    def local_run(command, *arguments, **keywords):
        if (not isinstance(command, (list, tuple)) or len(command) != 3
                or Path(command[0]).resolve() != Path(sys.executable).resolve()
                or not within(root, command[1]) or not within(root, command[2])
                or Path(command[1]).name != "summarize.py" or Path(command[2]).name != "ledger.csv"
                or Path(command[1]).read_text(encoding="utf-8") not in accepted
                or keywords.get("shell") or keywords.get("cwd") and not within(root, keywords["cwd"])):
            raise PermissionError("Somente o script determinístico revisado pode ser executado.")
        key = subprocess.list2cmdline(command)
        approved.add(key)
        try:
            return original_run(command, *arguments, **keywords)
        finally:
            approved.remove(key)

    def audit(event, arguments):
        if event.startswith("socket.") or event in {"os.system", "os.startfile", "os.posix_spawn"}:
            raise PermissionError("Rede e ferramentas externas não são permitidas neste ensaio.")
        if event == "subprocess.Popen":
            executable, command, *_rest = arguments
            key = command if isinstance(command, str) else subprocess.list2cmdline(command)
            if key not in approved or executable is not None and Path(executable).resolve() != Path(sys.executable).resolve():
                raise PermissionError("Somente o script determinístico revisado pode ser executado.")
        if event == "open":
            filename, mode, flags = arguments
            writes = isinstance(mode, str) and any(character in mode for character in "wax+")
            writes = writes or isinstance(flags, int) and bool(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            if writes and isinstance(filename, (str, bytes, os.PathLike)) and not within(root, os.fsdecode(filename)):
                raise PermissionError("Gravação fora da saída exclusiva do ensaio.")

    subprocess.run = local_run
    sys.addaudithook(audit)


def method_probe(root):
    from harness2 import config
    config.PHASE_WIDTH = 1
    config.PROPOSER_CONCURRENCY = 1
    from harness2.core import recursion, selection, tree
    from harness2.core.library import Library
    from harness2.core.spec import RunView
    from harness2.demo import BASE_SCRIPT, DemoAdapter, DemoProposer

    tree.read_tree = portable_tree_reader(tree)

    counter = SerialEvidence()

    class SerialAdapter(DemoAdapter):
        def execute(self, *arguments, **keywords):
            with counter.enter("execution"):
                return super().execute(*arguments, **keywords)

    class SerialProposer(DemoProposer):
        def call(self, *arguments, **keywords):
            with counter.enter("editor"):
                return super().call(*arguments, **keywords)

    adapter = SerialAdapter(root / "method")
    proposer = SerialProposer(adapter.spec.channels["proposer"])
    surface = adapter.substrate.surface()
    baseline = tree.read_tree(surface, adapter.base_harness())
    library = Library(root=root / "method" / "library", domain="accounting", surface=surface)
    constrain_demo(root, BASE_SCRIPT)
    rows = []
    for task in adapter.tasks():
        before = len(library.entries())
        baseline_id = task + "/base1"
        baseline_directory = adapter.execute(task, None, baseline_id)
        base_view = RunView(label="base1", run_id=baseline_id, run_dir=baseline_directory,
                            ok=True, delivered=adapter.delivered(baseline_directory))
        work = root / "method" / "work" / task
        started = time.monotonic()
        result = recursion.run_sequential(task, 1, [base_view], adapter=adapter, prop=proposer,
                                          work_dir=work, run_id_of=lambda label: task + "/" + label,
                                          base_tree=baseline, library_dir=library.context_dir(),
                                          propose_workers=1, rollout_workers=1)
        (work / "observed.json").write_text(json.dumps(result.to_dict(), indent=2), encoding="utf-8")
        if not result.ok:
            raise RuntimeError("O método não concluiu: " + str(result.errors))
        pool = selection.selection_pool("seq", 1, result.rollouts, [base_view])
        chosen = selection.trivial_selection(task, 1, "seq", pool, adapter=adapter, work_dir=work)
        if not chosen.ok:
            raise RuntimeError("Não houve uma entrega válida para comparar.")
        with (adapter.task_files(task) / "ledger.csv").open(encoding="utf-8", newline="") as source:
            expected = "Total: {:.2f}".format(sum((Decimal(row["amount"]) for row in csv.DictReader(source)), Decimal(0)))
        actual = adapter.deliverable_text(pool[chosen.chosen_label].run_dir).strip()
        initial = adapter.deliverable_text(baseline_directory).strip()
        if actual != expected or initial == expected:
            raise AssertionError("A comparação independente não confirmou a correção esperada.")
        selection.reflect_adoption(task, chosen, result.rollouts, adapter=adapter, prop=proposer,
                                   work_dir=work, decisions={stage.label: stage.notes or stage.error for stage in result.stages})
        saved = library.add(task, result.trees[chosen.chosen_label], why=chosen.why,
                            label=chosen.chosen_label, run_id=chosen.chosen_run_id, experience=chosen.experience)
        if saved is None:
            raise AssertionError("Nenhuma lição rastreável foi salva.")
        rows.append({"task": task, "baseline": initial, "candidate": actual, "expected": expected,
                     "pass": actual == expected, "libraryBefore": before,
                     "libraryAfter": len(library.entries()), "ledger": result.ledger.to_dict(),
                     "elapsedSeconds": round(time.monotonic() - started, 3)})
    return {"kind": "upstream-core-with-portable-serial-adapter", "tasks": rows,
            "adaptations": ["explicit-phase-workers-1", "posix-tree-keys", "no-posix-scheduler"],
            "maximumActiveOperations": counter.maximum, "pythonExecutions": counter.executions,
            "deterministicEditorCalls": counter.editors, "modelCalls": 0, "modelTokens": None,
            "limits": "Demonstração aritmética determinística; não valida LLM, benchmarks, runner completo ou projetos privados."}


def native_probe(root):
    from harness2 import config
    config.PHASE_WIDTH = 1
    config.PROPOSER_CONCURRENCY = 1
    from harness2.core import recursion
    original = recursion.run_mode

    def serial_mode(mode, *arguments, **keywords):
        keywords.update(propose_workers=1, rollout_workers=1)
        return original(mode, *arguments, **keywords)

    recursion.run_mode = serial_mode
    from harness2.demo import BASE_SCRIPT
    from harness2.cli.demo import main
    constrain_demo(root, BASE_SCRIPT)
    code = main(["--output", str(root / "native"), "--k", "1", "--mode", "sequential"])
    return {"kind": "upstream-cli-serial-parameters", "exitCode": code,
            "report": json.loads((root / "native" / "demo.json").read_text(encoding="utf-8"))}


def main():
    parser = argparse.ArgumentParser(description="Verificação local do núcleo Harness²; não instala nem chama modelos.")
    parser.add_argument("--installation", required=True, type=Path)
    parser.add_argument("--demo", choices=("native", "method"))
    parser.add_argument("--confirm-local-demo", action="store_true")
    args = parser.parse_args()
    base = args.installation.resolve(strict=True)
    identity = verify_installation(base)
    if not args.demo:
        print(json.dumps({"verified": True, "revision": identity["revision"], "version": identity["version"],
                          "modules": len(identity["modules"]), "packages": identity["packages"]}))
        return 0
    if not args.confirm_local_demo:
        parser.error("Execução requer --confirm-local-demo após revisão; nada foi executado.")
    root = base / "runs" / (args.demo + "-" + uuid4().hex[:8])
    root.mkdir(parents=True, exist_ok=False)
    isolate_environment(root)
    try:
        result = native_probe(root) if args.demo == "native" else method_probe(root)
    except Exception as error:
        result = {"kind": args.demo, "exitCode": 1, "errorType": type(error).__name__, "error": str(error)}
    receipt = {"createdAt": datetime.now(timezone.utc).isoformat(),
               "probeSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               "identity": identity, "result": result}
    (root / "receipt.json").write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"receipt": str(root / "receipt.json"), "result": result}, ensure_ascii=False))
    return result.get("exitCode", 0)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError, AssertionError, OSError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
