#!/usr/bin/env python3
"""Crée les secrets locaux sans les écrire sur stdout ni dans les arguments."""

import os
from pathlib import Path
import secrets
import subprocess
import sys


def prepare(destination):
    destination = Path(destination)
    if destination.exists():
        print("Configuration existante conservée.")
        return
    password = secrets.token_urlsafe(24)
    result = subprocess.run(
        ["docker", "run", "--rm", "-i", "--network", "none", "httpd:2.4-alpine",
         "htpasswd", "-niBC", "12", "demo"],
        input=password + "\n", text=True, capture_output=True, check=True,
    )
    hashed = result.stdout.strip().removeprefix("demo:")
    if not hashed.startswith(("$2y$", "$2b$")):
        raise RuntimeError("Empreinte bcrypt non reconnue")
    values = {
        "DEMO_PASSWORD": password,
        "DEMO_PASSWORD_HASH": hashed,
        "DEMO_ADMIN_PASSWORD": secrets.token_urlsafe(32),
        "DEMO_JWT_KEY": secrets.token_urlsafe(64),
    }
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        for key, value in values.items():
            output.write(f"{key}='{value}'\n")
    print(f"Secrets créés dans {destination} (permissions 600). Ne partagez pas ce fichier.")


if __name__ == "__main__":
    try:
        prepare(sys.argv[1])
    except (OSError, RuntimeError, subprocess.SubprocessError):
        sys.exit("Préparation refusée ; vérifiez Docker et l'image httpd:2.4-alpine.")
