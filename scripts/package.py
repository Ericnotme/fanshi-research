"""Package only the explicitly scanned public source files; no runtime data."""
import json
import pathlib
import subprocess
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
subprocess.run(["node", "scripts/scan.mjs"], cwd=root, check=True, stdout=subprocess.DEVNULL)
paths = json.loads((root / "PUBLIC_FILES.json").read_text())
out = root / "dist/fanshi-research-source.zip"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in paths:
        source = root / name
        if source.is_symlink() or not source.is_file() or root not in source.resolve().parents:
            raise ValueError("Unsafe source path")
        item = zipfile.ZipInfo("fanshi-research/" + name, (2026, 10, 11, 0, 0, 0))
        item.compress_type = zipfile.ZIP_DEFLATED
        item.external_attr = 0o644 << 16
        archive.writestr(item, source.read_bytes())
print(f"Packaged {len(paths)} public files: {out.name}")
