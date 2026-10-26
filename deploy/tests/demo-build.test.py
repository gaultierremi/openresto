#!/usr/bin/env python3
"""Les builds sont séquentiels et une erreur arrête les services suivants."""

import json
import os
from pathlib import Path
import subprocess
import tempfile

script = Path(__file__).resolve().parents[1] / "demo.sh"
with tempfile.TemporaryDirectory() as directory:
    folder = Path(directory)
    docker = folder / "docker"
    docker.write_text("""#!/usr/bin/env python3
import json, os, sys
with open(os.environ['DEMO_BUILD_CALLS'], 'a') as output:
    output.write(json.dumps(sys.argv[1:]) + '\\n')
sys.exit(9 if sys.argv[-1] == os.environ.get('DEMO_BUILD_FAIL') else 0)
""")
    docker.chmod(0o755)
    calls = folder / "calls.jsonl"
    environment = {**os.environ, "PATH": str(folder) + os.pathsep + os.environ["PATH"], "DEMO_BUILD_CALLS": str(calls)}
    for failure, expected, code in (
        ("", ["backend", "frontend", "reverse-proxy"], 0),
        ("frontend", ["backend", "frontend"], 9),
    ):
        calls.write_text("")
        result = subprocess.run([str(script), "construire"], env={**environment, "DEMO_BUILD_FAIL": failure}, check=False)
        assert result.returncode == code
        recorded = [json.loads(line) for line in calls.read_text().splitlines()]
        assert [command[-2:] for command in recorded] == [["build", service] for service in expected]
print("OK : builds séquentiels, erreur propagée sans lancer le service suivant.")
