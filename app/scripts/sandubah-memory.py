import ctypes
import json
import sys


def ram_status():
    if sys.platform != "win32":
        return None

    class MemoryStatus(ctypes.Structure):
        _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
            (name, ctypes.c_ulonglong)
            for name in ("total", "free", "commitTotal", "commitFree", "virtualTotal", "virtualFree", "extendedFree")
        ]

    status = MemoryStatus()
    status.length = ctypes.sizeof(status)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        return None
    return {name: getattr(status, name) for name in ("total", "free", "commitTotal", "commitFree")}


def gpu_status():
    try:
        import pynvml

        pynvml.nvmlInit()
        try:
            memory = pynvml.nvmlDeviceGetMemoryInfo(pynvml.nvmlDeviceGetHandleByIndex(0))
            return {"total": memory.total, "free": memory.free, "used": memory.used}
        finally:
            pynvml.nvmlShutdown()
    except Exception:
        return None


if __name__ == "__main__":
    try:
        ram = ram_status()
    except Exception:
        ram = None
    print(json.dumps({"ram": ram, "gpu": gpu_status()}))
