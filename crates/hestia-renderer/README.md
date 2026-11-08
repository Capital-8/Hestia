# hestia-renderer

Renderizador arquitetônico independente, plugin do Hestia em **processo separado** (protocolo de plugins 1.1,
`docs/plugins/`). Esta fatia mantém o espelho da cena e valida a conexão; **não desenha ainda**.

```
cargo run -- --init-token token.txt            # cria o token de pareamento (não o imprime)
cargo run -- --token-file token.txt --port 47800
cargo test
```
Segurança: escuta só em 127.0.0.1; confere `Host` e `Origin`; **exige pareamento por token** (HMAC mútuo, o token nunca
trafega nem vai a log). Cole o token em *Ferramentas externas* no Hestia. `--insecure-no-auth` desliga a autenticação e
existe **somente para testes locais**. Detalhes: `docs/plugins/07-pareamento-por-token.md`; validação: `06-...`.
