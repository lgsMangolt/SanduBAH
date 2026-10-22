import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import sys
import time
import urllib.request


SPEC = importlib.util.spec_from_file_location("qwen_worker", Path(__file__).with_name("sandubah-qwen-worker.py"))
WORKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKER)
MODELS = {
    "qwen-0.8b": ("Qwen/Qwen3.5-0.8B", "2fc06364715b967f1860aea9cf38778875588b17", 8),
    "qwen-2b": ("Qwen/Qwen3.5-2B", "15852e8c16360a2fea060d615a32b45270f8a8fc", 10),
}


def manifest(metadata, revision):
    if metadata.get("sha") != revision:
        raise ValueError("Revisão oficial divergente.")
    entries = []
    for entry in metadata["siblings"]:
        name = entry["rfilename"]
        if not (name.endswith((".json", ".safetensors", ".jinja", ".txt")) or name == "LICENSE"):
            continue
        if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*", name) or ".." in name:
            raise ValueError("Nome inválido no manifesto.")
        if type(entry.get("size")) is not int or not 0 < entry["size"] <= 6_000_000_000:
            raise ValueError("Tamanho inválido no manifesto.")
        expected = entry.get("lfs", {}).get("sha256")
        if expected:
            if not re.fullmatch(r"[a-f0-9]{64}", expected):
                raise ValueError("SHA-256 inválido.")
        elif name.endswith(".safetensors") or not re.fullmatch(r"[a-f0-9]{40}", entry.get("blobId", "")):
            raise ValueError("Hash oficial ausente.")
        entries.append(entry)
    if not entries or len(entries) > 30 or sum(entry["size"] for entry in entries) > 6_000_000_000:
        raise ValueError("Manifesto fora do perfil local.")
    return entries


def digest(filename):
    sha256 = hashlib.sha256()
    git_blob = hashlib.sha1(f"blob {filename.stat().st_size}\0".encode())
    with filename.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024**2), b""):
            sha256.update(chunk)
            git_blob.update(chunk)
    return sha256.hexdigest(), git_blob.hexdigest()


def verified(filename, entry):
    if not filename.is_file() or filename.stat().st_size != entry["size"]:
        return False
    sha256, git_blob = digest(filename)
    expected = entry.get("lfs", {}).get("sha256")
    return sha256 == expected if expected else git_blob == entry["blobId"]


def download(model_id):
    repository, revision, minimum_disk = MODELS[model_id]
    WORKER.select_model(model_id)
    with WORKER.worker_lock():
        if shutil.disk_usage(WORKER.ROOT).free < minimum_disk * 1024**3:
            raise RuntimeError(f"Libere {minimum_disk} GiB em disco antes do download. Nada foi apagado.")
        WORKER.configure_environment()
        directory = WORKER.checked_path(WORKER.DIRECTORY / "model")
        directory.mkdir(parents=True, exist_ok=True)
        url = f"https://huggingface.co/api/models/{repository}/revision/{revision}?blobs=true"
        with urllib.request.urlopen(url, timeout=60) as response:
            raw = response.read(2 * 1024**2 + 1)
        if len(raw) > 2 * 1024**2:
            raise ValueError("Manifesto acima do limite.")
        entries = manifest(json.loads(raw), revision)
        total = sum(entry["size"] for entry in entries)
        completed = 0
        receipts = []
        last_event = 0
        for entry in entries:
            filename = WORKER.checked_path(directory / entry["rfilename"])
            if not verified(filename, entry):
                partial = WORKER.checked_path(filename.with_name(filename.name + ".part"))
                request = urllib.request.Request(f"https://huggingface.co/{repository}/resolve/{revision}/{filename.name}", headers={"User-Agent": "SanduBAH-local-model-installer"})
                received = 0
                with urllib.request.urlopen(request, timeout=60) as response, partial.open("wb") as stream:
                    while chunk := response.read(1024**2):
                        received += len(chunk)
                        if received > entry["size"]:
                            raise ValueError("Download maior que o manifesto.")
                        stream.write(chunk)
                        if time.monotonic() - last_event >= 1:
                            WORKER.emit("progress", message=f"Baixando {filename.name}: {(completed + received) / 1e9:.2f} / {total / 1e9:.2f} GB", percent=100 * (completed + received) / total)
                            last_event = time.monotonic()
                if not verified(WORKER.checked_path(partial), entry):
                    raise ValueError(f"Verificação do arquivo falhou: {filename.name}")
                WORKER.checked_path(partial).replace(WORKER.checked_path(filename))
            completed += entry["size"]
            sha256, _ = digest(filename)
            receipts.append({"file": filename.name, "bytes": entry["size"], "sha256": sha256, "lfsVerified": bool(entry.get("lfs"))})
            WORKER.emit("progress", message=f"Verificado: {filename.name}", percent=100 * completed / total)
        receipt = {"model": repository, "revision": revision, "downloadVerified": True, "files": receipts}
        WORKER.checked_path(WORKER.DIRECTORY / "model-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        WORKER.emit("result", ok=True, modelId=model_id, downloadVerified=True, bytes=total)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=tuple(MODELS), required=True)
    try:
        download(parser.parse_args().model)
    except Exception as error:
        WORKER.emit("error", message=str(error))
        sys.exit(1)
