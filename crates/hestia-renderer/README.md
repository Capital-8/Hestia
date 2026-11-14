# hestia-renderer

Renderizador arquitetônico independente, plugin do Hestia em **processo separado** (protocolo de plugins 1.1,
`docs/plugins/`). Esta fatia mantém o espelho da cena e valida a conexão; **não desenha ainda**.

```
cargo run -- --port 47800 --state-file estado.json --control-stdin
cargo test
```
Segurança: escuta só em 127.0.0.1; confere `Host` e `Origin` (`--allow-origin`; `--allow-no-origin` só para
desenvolvimento) e **exige o token de pareamento** (`--require-token`, padrão; gerado na primeira execução, arquivo só do
usuário, `--token-file`; `--no-require-token` só para desenvolvimento): ver `docs/plugins/07-pareamento-por-token.md`. Validação:
`docs/plugins/06-validacao-processo-rust.md`.
