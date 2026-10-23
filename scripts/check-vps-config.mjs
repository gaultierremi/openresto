import { appendFileSync } from "node:fs";

const requiredSecrets = [
  "VPS_HOST",
  "VPS_USER",
  "VPS_SSH_KEY",
  "VPS_DEPLOY_PATH",
];
const missing = requiredSecrets.filter((name) => !process.env[name]?.trim());
const configured = missing.length === 0;

appendFileSync(process.env.GITHUB_OUTPUT, `configured=${configured}\n`);
appendFileSync(
  process.env.GITHUB_STEP_SUMMARY,
  configured
    ? "### Déploiement VPS\n\nConfiguration présente : le job de déploiement peut démarrer.\n"
    : [
        "### Déploiement VPS ignoré",
        "",
        "Le serveur n’est pas configuré : le job « Deploy to VPS » est sauté, sans connexion SSH ni création de déploiement GitHub.",
        "",
        "Secrets GitHub à renseigner dans les paramètres du dépôt :",
        ...missing.map((name) => `- \`${name}\``),
        "",
        "`VPS_PORT` est facultatif (22 par défaut). Une fois les quatre secrets obligatoires renseignés, le déploiement sera activé au prochain push sur main ou lancement manuel de ce workflow.",
        "",
      ].join("\n"),
);
