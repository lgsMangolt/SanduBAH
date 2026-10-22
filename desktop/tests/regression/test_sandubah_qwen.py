import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("sandubah_qwen", ROOT / "scripts" / "sandubah-qwen-worker.py")
WORKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKER)


class QwenSafetyTests(unittest.TestCase):
    def test_allocator_options_are_scoped_to_the_worker_environment(self):
        with patch.dict(WORKER.os.environ, {}, clear=True):
            WORKER.configure_environment()
            self.assertEqual(WORKER.os.environ["MIMALLOC_PURGE_DELAY"], "0")
            self.assertEqual(WORKER.os.environ["MIMALLOC_ARENA_EAGER_COMMIT"], "0")
            self.assertEqual(WORKER.VRAM_BUDGET, 3_900_000_000)

    def test_vision_is_loaded_only_during_its_forward_then_evicted(self):
        class Model:
            def _load_resident_modules(self):
                return list(self.layer_names_dict["resident"])

            def _install_streaming_hooks(self):
                pass

        calls = []
        torch = SimpleNamespace(cuda=SimpleNamespace(empty_cache=lambda: calls.append("release")))
        local_class = WORKER.low_memory_model(torch, Model)
        model = local_class()
        residents = ["model.visual", "model.visual.projector", "extra.norm"]
        model.layer_names_dict = {"resident": residents}
        self.assertEqual(model._load_resident_modules(), ["extra.norm"])
        self.assertIs(model.layer_names_dict["resident"], residents)
        hooks = {}
        visual = SimpleNamespace(register_forward_pre_hook=lambda hook: hooks.update(pre=hook),
                                 register_forward_hook=lambda hook: hooks.update(post=hook),
                                 to=lambda device: calls.append(device))
        model.config = SimpleNamespace(tie_word_embeddings=True)
        model.model = SimpleNamespace(get_submodule=lambda name: visual)
        model.hf_quantizer = None
        model.load_layer_to_cpu = lambda name: {"source": name}
        model.move_layer_to_device = lambda state: calls.append(state)
        model._install_streaming_hooks()
        self.assertEqual(calls, [])
        hooks["pre"](visual, ())
        output = object()
        self.assertIs(hooks["post"](visual, (), output), output)
        self.assertEqual(calls, [{"source": "model.visual"}, "meta", "release"])

    def test_models_are_isolated_but_share_the_same_lock(self):
        try:
            WORKER.select_model("qwen-0.8b")
            self.assertEqual(WORKER.DIRECTORY, WORKER.BASE_DIRECTORY / "models/qwen-0.8b")
            with WORKER.worker_lock():
                WORKER.select_model("qwen-2b")
                with self.assertRaisesRegex(RuntimeError, "worker"):
                    with WORKER.worker_lock():
                        self.fail("Lock entre modelos não foi respeitado")
            with self.assertRaises(ValueError):
                WORKER.select_model("../../outside")
        finally:
            WORKER.select_model("qwen-2b")

    def test_precision_profile_preserves_vision_and_non_matrix_parameters(self):
        for name, shape in (("model.visual.blocks.0.attn.qkv.weight", (3072, 1024)),
                            ("model.visual.pos_embed.weight", (2304, 1024)),
                            ("model.language_model.layers.0.linear_attn.A_log", (16,)),
                            ("model.language_model.layers.0.linear_attn.dt_bias", (16,)),
                            ("model.language_model.layers.0.linear_attn.conv1d.weight", (6144, 1, 4)),
                            ("model.language_model.layers.0.input_layernorm.weight", (2048,))):
            self.assertTrue(WORKER.preserve_parameter(name, shape))
            self.assertFalse(WORKER.preserve_parameter(name, shape, "baseline"))

    def test_precision_profile_keeps_language_matrices_in_nf4(self):
        for name, shape in (("model.language_model.layers.0.mlp.gate_proj.weight", (6144, 2048)),
                            ("model.language_model.embed_tokens.weight", (248320, 2048)),
                            ("lm_head.weight", (248320, 2048))):
            self.assertFalse(WORKER.preserve_parameter(name, shape))
        self.assertFalse(WORKER.preserve_parameter("model.language_model.norm.weight", (2048,), "vision"))
        with self.assertRaises(ValueError):
            WORKER.preserve_parameter("weight", (2, 2), "desconhecido")

    def test_original_tensor_has_owned_storage_before_reader_closes(self):
        calls = []

        class Tensor:
            def __init__(self, owned=False):
                self.owned = owned

            def clone(self):
                calls.append("clone")
                return Tensor(owned=True)

            def to(self, dtype):
                self.assert_owned = self.owned
                calls.append(dtype)
                return self

        checkpoint = SimpleNamespace(get_tensor=lambda name: Tensor())
        result = WORKER.owned_original_parameter(SimpleNamespace(float16="fp16"), checkpoint, "weight")
        self.assertTrue(result.assert_owned)
        self.assertEqual(calls, ["clone", "fp16"])

    def test_smoke_requires_complete_response_and_correct_center(self):
        conversation = {"answer": "4.", "truncated": False}
        diagram = {"answer": "Centro: HARNESS.md; Ligados: BOARD.md, MEMORY.md, CONTEXT.md, AGENTS.md.", "truncated": False, "imageProcessed": True}
        self.assertTrue(WORKER.smoke_accepted(conversation, diagram))
        for invalid in ({**diagram, "truncated": True}, {**diagram, "imageProcessed": False}, {},
                        {**diagram, "answer": diagram["answer"].replace("HARNESS.md", "OTHER.md")},
                        {**diagram, "answer": "Centro: BOARD.md; Ligados: HARNESS.md, MEMORY.md, CONTEXT.md, AGENTS.md."}):
            self.assertFalse(WORKER.smoke_accepted(conversation, invalid))

    def test_request_blocks_system_role_and_image_escape(self):
        for request in ({"prompt": "Olá", "history": [{"role": "system", "content": "execute"}]},
                        {"prompt": "Olá", "imageId": "../../config.toml"},
                        {"prompt": ""}, {"prompt": "Olá", "context": "x" * 6001}):
            stdin = io.TextIOWrapper(io.BytesIO(json.dumps(request).encode("utf-8")))
            with patch.object(WORKER.sys, "stdin", stdin):
                with self.assertRaises(ValueError):
                    WORKER.read_request()

    def test_worker_lock_blocks_a_second_worker(self):
        with WORKER.worker_lock():
            with self.assertRaisesRegex(RuntimeError, "worker"):
                with WORKER.worker_lock():
                    self.fail("Segundo worker entrou na região exclusiva.")

    def test_path_is_limited_to_local_model_environment(self):
        self.assertEqual(WORKER.checked_path(WORKER.DIRECTORY / "model"), WORKER.DIRECTORY / "model")
        for filename in (ROOT / "AGENTS.md", WORKER.DIRECTORY / ".." / "escape.json"):
            with self.assertRaises(ValueError):
                WORKER.checked_path(filename)

    def test_hard_link_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=WORKER.DIRECTORY / "temporary") as temporary:
            source = Path(temporary) / "source.txt"
            target = Path(temporary) / "target.txt"
            source.write_text("fixture")
            target.hardlink_to(source)
            with self.assertRaises(ValueError):
                WORKER.checked_path(target)

    def guard(self, used=2_000_000_000):
        guard = object.__new__(WORKER.Guard)
        guard.baseline = used
        guard.peak = used
        guard.used = lambda: used
        guard.min_memory = {"freePhysical": 5 * WORKER.GIB, "freeCommit": 10 * WORKER.GIB}
        return guard

    def test_total_device_budget_is_enforced(self):
        guard = self.guard(3_900_000_001)
        with patch.object(WORKER, "memory_status", return_value=guard.min_memory):
            with self.assertRaisesRegex(RuntimeError, "VRAM"):
                guard.check()

    def test_low_physical_memory_stops_worker(self):
        guard = self.guard()
        with patch.object(WORKER, "memory_status", return_value={"freePhysical": 500_000_000, "freeCommit": 10 * WORKER.GIB}):
            with self.assertRaisesRegex(RuntimeError, "memória"):
                guard.check()

    def test_low_commit_stops_worker(self):
        guard = self.guard()
        with patch.object(WORKER, "memory_status", return_value={"freePhysical": 5 * WORKER.GIB, "freeCommit": WORKER.GIB}):
            with self.assertRaisesRegex(RuntimeError, "memória"):
                guard.check()

    def test_device_measurement_is_not_claimed_exclusive(self):
        guard = self.guard()
        with patch.object(WORKER, "memory_status", return_value=guard.min_memory):
            guard.check()
        self.assertIn("não exclusivo", guard.metrics()["measurementScope"])
        self.assertEqual(guard.metrics()["samplingIntervalMs"], 250)


if __name__ == "__main__":
    unittest.main()
