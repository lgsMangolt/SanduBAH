import argparse
import contextlib
import faulthandler
import gc
import hashlib
import importlib.util
import json
from pathlib import Path
import time


SPEC = importlib.util.spec_from_file_location("sandubah_qwen", Path(__file__).with_name("sandubah-qwen-worker.py"))
WORKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKER)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("baseline", "vision", "sensitive"), required=True)
    parser.add_argument("--tokens", type=int, choices=(16, 48, 96), default=16)
    arguments = parser.parse_args()
    WORKER.configure_environment()
    with WORKER.worker_lock():
        guard = WORKER.Guard()
        try:
            guard.start()
            with contextlib.redirect_stdout(WORKER.sys.stderr):
                torch, model_class = WORKER.load_runtime(guard)
                from transformers import AutoProcessor
                model_type = WORKER.low_memory_model(torch, model_class, arguments.profile)
                started = time.monotonic()
                model = model_type(str(WORKER.checked_path(WORKER.DIRECTORY / "model")), dtype=torch.float16,
                                   max_seq_len=2048, compression="4bit", prefetching=False,
                                   layer_shards_saving_path=str(WORKER.checked_path(WORKER.DIRECTORY / "shards")), delete_original=False)
                processor = AutoProcessor.from_pretrained(str(WORKER.DIRECTORY / "model"), local_files_only=True, trust_remote_code=False)
                prompt = "Qual é o nome do arquivo no centro da imagem? Responda somente o nome do arquivo." if arguments.tokens == 16 else "Leia os nomes dos arquivos no diagrama. Responda somente em uma linha curta: Centro: nome; Ligados: nomes separados por vírgulas. Sem introdução, explicações, direções ou perguntas. Transcreva apenas o que consegue ver."
                answer = WORKER.generate(torch, model, processor, prompt, WORKER.DIRECTORY / "images/harness-diagram.png", arguments.tokens)
                guard.check()
                receipt = {"profile": arguments.profile, "diagnosticOnly": True, "answer": answer,
                           "workerSha256": hashlib.sha256(Path(WORKER.__file__).read_bytes()).hexdigest(),
                           "diagnosticSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                           "seconds": round(time.monotonic() - started, 2), **guard.metrics()}
                WORKER.checked_path(WORKER.DIRECTORY / f"receipts/diagnose-{arguments.profile}-{arguments.tokens}.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
                WORKER.emit("diagnostic", **receipt)
                del model, processor
                gc.collect()
                torch.cuda.empty_cache()
        finally:
            guard.close()


if __name__ == "__main__":
    faulthandler.enable()
    WORKER.PROTOCOL.reconfigure(encoding="utf-8")
    WORKER.sys.stderr.reconfigure(encoding="utf-8")
    main()
