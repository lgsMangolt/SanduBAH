import hashlib
import json
import os
from pathlib import Path
import shutil
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "build" / "sandubah" / "airllm"
MODEL_ID = "Qwen/Qwen3.5-2B"
REVISION = "15852e8c16360a2fea060d615a32b45270f8a8fc"


def local_directory(name):
    target = DIRECTORY / name
    if not target.resolve().is_relative_to(ROOT):
        raise RuntimeError("Diretório fora da cópia local.")
    cursor = target
    while cursor != ROOT:
        if cursor.is_symlink() or cursor.is_junction():
            raise RuntimeError("Links não são permitidos na instalação local.")
        cursor = cursor.parent
    target.mkdir(parents=True, exist_ok=True)
    return target


def file_digest(filename):
    checksum = hashlib.sha256()
    with filename.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def main():
    if shutil.disk_usage(ROOT).free < 10 * 1024**3:
        raise RuntimeError("O download exige pelo menos 10 GiB livres, incluindo margem.")
    for name in ("hf-home", "temporary", "model", "shards"):
        local_directory(name)
    os.environ.update({
        "HF_HOME": str(DIRECTORY / "hf-home"),
        "HF_HUB_DISABLE_IMPLICIT_TOKEN": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "HF_HUB_DISABLE_XET": "1",
        "HF_HUB_DOWNLOAD_TIMEOUT": "120",
        "DO_NOT_TRACK": "1",
        "TMP": str(DIRECTORY / "temporary"),
        "TEMP": str(DIRECTORY / "temporary"),
    })
    from huggingface_hub import snapshot_download

    metadata_url = f"https://huggingface.co/api/models/{MODEL_ID}/revision/{REVISION}?blobs=true"
    with urllib.request.urlopen(metadata_url, timeout=60) as response:
        metadata = json.load(response)
    if metadata["sha"] != REVISION:
        raise RuntimeError("Revisão oficial não corresponde à revisão fixada.")
    allowed = [entry for entry in metadata["siblings"] if entry["rfilename"].endswith((".json", ".safetensors", ".jinja", ".txt")) or entry["rfilename"] == "LICENSE"]
    for entry in allowed:
        path = Path(entry["rfilename"])
        if path.is_absolute() or ".." in path.parts or len(path.parts) != 1:
            raise RuntimeError("Arquivo inesperado no manifesto oficial.")
    snapshot_download(repo_id=MODEL_ID, revision=REVISION, local_dir=str(DIRECTORY / "model"),
                      allow_patterns=[entry["rfilename"] for entry in allowed], max_workers=1, token=False)
    receipts = []
    for entry in allowed:
        filename = DIRECTORY / "model" / entry["rfilename"]
        if filename.is_symlink() or filename.stat().st_size != entry["size"]:
            raise RuntimeError(f"Arquivo inválido: {filename.name}")
        checksum = file_digest(filename)
        expected = entry.get("lfs", {}).get("sha256")
        if expected and checksum != expected:
            raise RuntimeError(f"SHA-256 não confere: {filename.name}")
        receipts.append({"file": filename.name, "bytes": filename.stat().st_size, "sha256": checksum, "lfsVerified": bool(expected)})
    receipt = {"model": MODEL_ID, "revision": REVISION, "files": receipts,
               "downloadVerified": True, "inferenceTested": False, "compressionPrepared": False}
    (DIRECTORY / "model-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    settings = {"model": MODEL_ID, "revision": REVISION, "modelDirectory": "model", "shardsDirectory": "shards",
                "compression": "4bit", "runtimeDtype": "float16", "vramBudgetBytes": 3900000000,
                "workerLimit": 1, "maxContextTokens": 2048, "maxNewTokens": 256,
                "maxImages": 1, "offlineInference": True, "inferenceValidated": False,
                "status": "downloaded-awaiting-memory-check"}
    (DIRECTORY / "settings.json").write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"downloadVerified": True, "files": len(receipts), "weightBytes": sum(entry["bytes"] for entry in receipts),
                      "status": "Modelo baixado. Compressão e inferência ainda não executadas."}, ensure_ascii=False))


if __name__ == "__main__":
    main()
