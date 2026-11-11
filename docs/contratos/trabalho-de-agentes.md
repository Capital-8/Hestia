# Contrato de trabalho de agentes

Regras permanentes sobre como implementar sem deixar rastro. Complementa `familias-e-ferramentas.md`.

## Regra 5. Não deixar lixo ao implementar

- **Build Rust fora do worktree.** Compile sempre com `CARGO_TARGET_DIR=E:\hestia-target-<frente>`. Nunca deixe
  `crates/*/target` dentro do worktree (o disco já encheu por causa disso).
- **Temporários só em lugar certo.** Arquivos temporários, prints e scripts de depuração ficam no scratchpad da sessão
  ou em pastas `tmp-*`, que nunca são commitadas (o `.gitignore` cobre `target/` e `tmp-*`).
- **Ao concluir a frente:** apague o seu `E:\hestia-target-<frente>`, encerre os servidores vite que abriu e apague as
  pastas `tmp-*`.
- **Relatório final:** informe o que foi apagado.

Teste-guarda: `tests/contratoLixo.test.ts`, que chama `scripts/check-lixo.mjs` (também roda sozinho com
`node scripts/check-lixo.mjs`). Falha se houver `crates/*/target` dentro do repositório, pasta `tmp-*` rastreada pelo
git, `.log` versionado, ou `.png`/`.mjs` solto fora de `docs/`, `tests/`, `scripts/`, `desktop/` e `reports/`.
