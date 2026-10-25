#!/usr/bin/env python3
"""Le raccordement du Caddy conserve les réseaux implicites et explicites du voisin."""

import json
from pathlib import Path
import subprocess
import tempfile

override = Path(__file__).resolve().parents[1] / "demo/compose.caddy.yml"
for explicit in (False, True):
    base = {
        "services": {"caddy": {"image": "caddy:2-alpine"}, "app": {"image": "nginx:alpine"}},
    }
    if explicit:
        base["networks"] = {"apprenti": {}}
        for service in base["services"].values():
            service["networks"] = ["apprenti"]
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / "compose.json"
        source.write_text(json.dumps(base))
        result = subprocess.run([
            "docker", "compose", "-p", "voisin-test", "-f", str(source), "-f", str(override),
            "config", "--format", "json",
        ], capture_output=True, text=True, check=True)
        merged = json.loads(result.stdout)
    expected = "apprenti" if explicit else "default"
    assert expected in merged["services"]["caddy"]["networks"]
    assert expected in merged["services"]["app"]["networks"]
    assert "openresto-demo-caddy" in merged["services"]["caddy"]["networks"]
    assert "openresto-demo-caddy" not in merged["services"]["app"]["networks"]
print("OK : surcharge Caddy compatible avec les réseaux implicites et explicites d'Apprenti.")
