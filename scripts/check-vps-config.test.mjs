import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";

const exampleSecrets = {
  VPS_HOST: "vps.example.com",
  VPS_USER: "example-deployer",
  VPS_SSH_KEY: "example-key\nexample-key-second-line",
  VPS_DEPLOY_PATH: "/srv/example-openresto",
};
const names = Object.keys(exampleSecrets);

function checkConfiguration(secrets) {
  const directory = mkdtempSync(join(tmpdir(), "vps-config-"));
  const output = join(directory, "output");
  const summary = join(directory, "summary");
  try {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./check-vps-config.mjs", import.meta.url))],
      {
        env: {
          ...process.env,
          ...Object.fromEntries(names.map((name) => [name, ""])),
          VPS_PORT: "",
          ...secrets,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    const report = readFileSync(summary, "utf8");
    const decision = readFileSync(output, "utf8");
    for (const value of Object.values(exampleSecrets)) {
      assert.ok(!`${report}${decision}`.includes(value));
    }
    return { report, decision };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (let mask = 0; mask < 1 << names.length; mask++) {
  const present = names.filter((_, index) => mask & (1 << index));
  const missing = names.filter((name) => !present.includes(name));
  it(`enables deployment only with all four secrets: ${present.join(", ") || "none"}`, () => {
    const { report, decision } = checkConfiguration(
      Object.fromEntries(present.map((name) => [name, exampleSecrets[name]])),
    );
    assert.equal(decision, `configured=${missing.length === 0}\n`);
    if (missing.length === 0) {
      assert.match(report, /le job de déploiement peut démarrer/);
    } else {
      assert.match(report, /Déploiement VPS ignoré/);
      assert.match(
        report,
        /sans connexion SSH ni création de déploiement GitHub/,
      );
      assert.match(report, /22 par défaut/);
      for (const name of names) {
        assert.equal(report.includes(`- \`${name}\``), missing.includes(name));
      }
    }
  });
}

it("treats whitespace-only secrets as missing", () => {
  const { report, decision } = checkConfiguration({
    ...exampleSecrets,
    VPS_HOST: " \t\n",
  });
  assert.equal(decision, "configured=false\n");
  assert.match(report, /- `VPS_HOST`/);
});
