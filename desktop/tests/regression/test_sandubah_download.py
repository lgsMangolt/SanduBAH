import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("model_download", ROOT / "scripts/download-sandubah-model.py")
DOWNLOAD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DOWNLOAD)


class DownloadTests(unittest.TestCase):
    def entry(self, name="model.safetensors", content=b"fixture"):
        return {"rfilename": name, "size": len(content), "lfs": {"sha256": hashlib.sha256(content).hexdigest()}}

    def test_manifest_rejects_paths_missing_hash_and_wrong_revision(self):
        for entry in (self.entry("../escape.json"), self.entry("C:escape.json"), {"rfilename": "model.safetensors", "size": 10}, {**self.entry(), "size": -1}):
            with self.assertRaises(ValueError):
                DOWNLOAD.manifest({"sha": "pin", "siblings": [entry]}, "pin")
        with self.assertRaises(ValueError):
            DOWNLOAD.manifest({"sha": "different", "siblings": [self.entry()]}, "pin")

    def test_git_blob_and_sha256_verification(self):
        with tempfile.TemporaryDirectory(dir=DOWNLOAD.WORKER.BASE_DIRECTORY / "temporary") as temporary:
            filename = Path(temporary) / "fixture.json"
            filename.write_bytes(b"fixture")
            self.assertTrue(DOWNLOAD.verified(filename, self.entry()))
            entry = {"size": 7, "blobId": hashlib.sha1(b"blob 7\0fixture").hexdigest()}
            self.assertTrue(DOWNLOAD.verified(filename, entry))
            filename.write_bytes(b"corrupt")
            self.assertFalse(DOWNLOAD.verified(filename, entry))

    def test_download_fixture_checks_bytes_records_receipt_and_reuses_verified_file(self):
        worker = DOWNLOAD.WORKER
        with tempfile.TemporaryDirectory(dir=worker.BASE_DIRECTORY / "temporary") as temporary:
            base = Path(temporary)
            content = b"fixture weight data"
            revision = DOWNLOAD.MODELS["qwen-0.8b"][1]
            metadata = json.dumps({"sha": revision, "siblings": [self.entry(content=content)]}).encode()
            with patch.object(worker, "BASE_DIRECTORY", base), patch.object(worker, "PROTOCOL", io.StringIO()), patch.object(worker, "configure_environment", side_effect=lambda: (worker.DIRECTORY / "model").mkdir(parents=True, exist_ok=True)), patch.object(DOWNLOAD.shutil, "disk_usage", return_value=type("Disk", (), {"free": 30 * 1024**3})()), patch.object(DOWNLOAD.urllib.request, "urlopen", side_effect=[io.BytesIO(metadata), io.BytesIO(content), io.BytesIO(metadata)]) as network:
                try:
                    DOWNLOAD.download("qwen-0.8b")
                    self.assertEqual(network.call_count, 2)
                    receipt = json.loads((worker.DIRECTORY / "model-receipt.json").read_text())
                    self.assertTrue(receipt["downloadVerified"])
                    self.assertTrue(receipt["files"][0]["lfsVerified"])
                    DOWNLOAD.download("qwen-0.8b")
                    self.assertEqual(network.call_count, 3)
                finally:
                    worker.DIRECTORY = base
        worker.select_model("qwen-2b")


if __name__ == "__main__":
    unittest.main()
