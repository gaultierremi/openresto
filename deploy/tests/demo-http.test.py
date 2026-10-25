#!/usr/bin/env python3
"""Exerce la vraie chaîne Caddy → contrôle d'accès → nginx → API/front."""

import base64
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request

config = dict(line.strip().split("=", 1) for line in Path(sys.argv[1]).read_text().splitlines())
config = {key: value.strip("'") for key, value in config.items()}
origin = sys.argv[2]
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def request(path, password=None, data=None, cookie=None, neighbour=False):
    headers = {"Host": "apprenti.test" if neighbour else "openresto.134-209-92-233.sslip.io"}
    if password is not None:
        headers["Authorization"] = "Basic " + base64.b64encode(f"demo:{password}".encode()).decode()
    if cookie:
        headers["Cookie"] = cookie
    if data is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(data).encode()
    try:
        response = opener.open(urllib.request.Request(origin + path, data=data, headers=headers), timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.headers, response.read()


assert request("/", neighbour=True)[2] == b"apprenti-temoin"
for path in ("/", "/api/health", "/api/restaurants", "/media/inconnue.jpg", "/admin/login", "/openapi/v1.json"):
    status = request(path)[0]
    assert status == 401, f"{path}: attendu 401, reçu {status}"
    status = request(path, "incorrect")[0]
    assert status == 401, f"{path}: mot de passe incorrect, reçu {status}"
assert request("/api/bookings", data={})[0] == 401
assert request("/api/bookings", "incorrect", data={})[0] == 401
password = config["DEMO_PASSWORD"]
assert request("/api/health", password)[0] == 200
status, headers, body = request("/api/restaurants", password)
assert status == 200
restaurants = json.loads(body)
assert len(restaurants) == 1
assert "Nuages" in restaurants[0]["name"]
assert "noindex" in headers["X-Robots-Tag"]
assert "no-store" in headers["Cache-Control"]
assert request("/admin/login", password)[0] == 200
status, headers, body = request("/api/admin/auth/login", password, {
    "email": "admin@openresto-demo.example", "password": config["DEMO_ADMIN_PASSWORD"],
})
assert status == 200
cookie = headers["Set-Cookie"]
assert "secure" in cookie.lower() and "httponly" in cookie.lower()
assert request("/api/admin/auth/me", password, cookie=cookie.split(";", 1)[0])[0] == 200
assert request("/", neighbour=True)[2] == b"apprenti-temoin"
print("OK : voisin inchangé, site/API/médias protégés, données fictives, connexion admin et cookie Secure.")
