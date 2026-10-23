import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "probe-sandubah-harness2.py"
SPEC = importlib.util.spec_from_file_location("sandubah_harness2_probe", SCRIPT)
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)


class Harness2ProbeTests(unittest.TestCase):
    def test_second_operation_fails_without_corrupting_counter(self):
        counter = PROBE.SerialEvidence()
        with counter.enter("execution"):
            with self.assertRaises(RuntimeError):
                with counter.enter("editor"):
                    self.fail("A segunda operação não deveria iniciar.")
            self.assertEqual(counter.active, 1)
        self.assertEqual(counter.active, 0)
        self.assertEqual(counter.executions, 1)
        self.assertEqual(counter.editors, 0)

    def test_windows_tree_keys_preserve_rejections_and_ignore_only_known_stubs(self):
        def upstream(_surface, _directory, rejected):
            rejected.extend(["scripts\\README.md", "outside.exe"])
            return {"scripts\\summarize.py": "print('fixture')", "AGENTS.md": "fixture"}

        tree = types.SimpleNamespace(read_tree=upstream, normalize_rel=lambda name: name.replace("\\", "/"))
        surface = types.SimpleNamespace(stubs=[("scripts/README.md", "stub")])
        rejected = []
        result = PROBE.portable_tree_reader(tree)(surface, "fixture", rejected=rejected)
        self.assertEqual(result, {"scripts/summarize.py": "print('fixture')", "AGENTS.md": "fixture"})
        self.assertEqual(rejected, ["outside.exe"])

    def test_guards_deny_network_outside_writes_shell_and_arbitrary_programs(self):
        code = '''
import importlib.util,json,pathlib,subprocess,socket,sys,tempfile
spec=importlib.util.spec_from_file_location('probe',sys.argv[1])
probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
with tempfile.TemporaryDirectory(prefix='h2-guard-') as temporary:
    root=pathlib.Path(temporary).resolve()
    script=root/'summarize.py'; ledger=root/'ledger.csv'
    content="print('fixture')\\n"
    script.write_text(content,encoding='utf-8');ledger.write_text('amount\\n1\\n',encoding='utf-8')
    probe.constrain_demo(root,content)
    result=subprocess.run([sys.executable,str(script),str(ledger)],capture_output=True,text=True,check=True)
    assert result.stdout.strip()=='fixture'
    denied=[]
    operations=[lambda:socket.getaddrinfo('example.invalid',443),
        lambda:(root.parent/(root.name+'-outside.txt')).write_text('blocked'),
        lambda:subprocess.run([sys.executable,'-c',"print('blocked')"]),
        lambda:subprocess.run([sys.executable,str(script),str(ledger)],shell=True)]
    for operation in operations:
        try:operation()
        except PermissionError:denied.append(True)
        else:raise AssertionError('Operação não foi bloqueada')
    print(json.dumps({'denied':len(denied),'fixtureExecuted':True}))
'''
        result = subprocess.run([sys.executable, "-I", "-X", "utf8", "-c", code, str(SCRIPT)],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"denied": 4, "fixtureExecuted": True})


if __name__ == "__main__":
    unittest.main()
