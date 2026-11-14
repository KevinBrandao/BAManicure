import fs from "node:fs";

/** Carrega .env.local e .env (sem sobrescrever variáveis já definidas). */
export function carregarEnv(): void {
  for (const arquivo of [".env.local", ".env"]) {
    if (fs.existsSync(arquivo)) process.loadEnvFile(arquivo);
  }
}
