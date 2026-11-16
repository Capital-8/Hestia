# Pareamento por token (protocolo 1.1)

**Estado:** IMPLEMENTADO (Fase I). O token de pareamento é **obrigatório** para todo suplemento de processo externo. O
contrato 1.0 não mudou: a 1.1 é aditiva (mudança de `minor`).

## Por que o `Origin` não basta
O renderizador valida `Host` e `Origin` ([06](06-validacao-processo-rust.md)). Isso barra páginas web arbitrárias e DNS
rebinding, mas **não** barra outro programa no mesmo computador (não envia `Origin`, ou envia um forjado). Só um segredo
compartilhado resolve.

## Como funciona
- **Token:** 256 bits aleatórios em hexadecimal (64 caracteres), gerado pelo renderizador na primeira execução e guardado
  em arquivo legível só pelo usuário (`0600` em Unix; no Windows, a pasta do perfil). É mostrado **uma única vez** (na
  saída de erro do processo) e reaproveitado nas execuções seguintes. Arquivo: `--token-file F`, ou
  `HESTIA_RENDERER_TOKEN_FILE`, ou `<config>/hestia-renderer/token`. Token editado à mão com menos de 32 caracteres é recusado.
- **Troca (desafio e resposta mútuos; o token nunca trafega).** Os nonces são 16 bytes aleatórios em base64:
  1. `hello` ganha `auth: { nonce: nonceP }` e fala só a 1.1.
  2. O host responde `auth { proof: HMAC-SHA256(token, "hestia-host|" + nonceP + "|" + nonceH), nonce: nonceH }`.
  3. O plugin confere (tempo constante) e responde `auth.ok { proof: HMAC-SHA256(token, "hestia-plugin|" + nonceP + "|" + nonceH) }`.
  4. O host confere. Só então o aperto de mãos termina (`welcome`, snapshot...).
  Diferença em relação à proposta original: as duas provas cobrem **os dois nonces** (e o rótulo separa host e plugin), o que
  impede repetir uma prova capturada contra outro desafio. `auth` e `auth.ok` são numerados e confirmados como os demais.
- **Antes da autenticação, nada é processado:** só `ack`, `ping`, `pong`, `bye` e `error` (e `auth`/`auth.ok`). Qualquer
  mensagem de cena, câmera ou substituição vira `error auth_failed` **fatal**, nos dois lados; o host não lê a cena nem aplica
  substituições.
- **Falha = `error auth_failed` fatal** e estado **Incompatível** com a causa na tela: `wrong_token`, `no_token`,
  `plugin_without_auth`, `timeout`, `locked`, `no_crypto`. Não há reconexão automática.
- **Bloqueio:** três falhas seguidas bloqueiam novas tentativas por 10 s (`AUTH_MAX_FAILURES`, `AUTH_LOCK_MS`), no host (por
  plugin; trocar o token zera) e no processo Rust (a porta deixa de responder; `--lock-seconds` só para testes).
- **Criptografia:** só WebCrypto no TypeScript (`pairing.ts`; navegador, Tauri e Node 20+) e `hmac`/`sha2`/`getrandom` no Rust.
  Sem WebCrypto o pareamento falha com a causa `no_crypto`.

## Compatibilidade e política
- Protocolo `1.1`; tipos novos `auth` e `auth.ok`; código de erro novo `auth_failed`; `hello.auth` opcional. Manifesto e
  cena não mudam.
- `negotiateProtocol(range, host, { requireToken })`: host 1.1 com plugin 1.0 negocia **1.0**; com token obrigatório
  (padrão da função) isso vira "incompatível" com `reason: 'token_required'`.
- **Política do host (`tokenPolicy`)**: `required` recusa plugin 1.0, plugin sem `hello.auth` e host sem token configurado.
  `optional` aceita plugin 1.0 sem autenticar (a sessão fica com `authenticated: false` e a tela mostra um aviso) e
  autentica quando os dois lados têm token. **O app usa `required` em uso real e `optional` só em desenvolvimento**
  (`import.meta.env.DEV`, o que inclui os testes). A biblioteca `@hestia/plugin-api` assume `optional` quando a opção é
  omitida, para o transporte em memória dos testes; o app sempre passa a política.
- Host 1.0 (antigo) com plugin 1.1: negocia 1.0 e o plugin que exige token fecha a conexão (`auth_failed`).
- Renderizador Rust: `--require-token` é o padrão. `--no-require-token` (protocolo 1.0, sem token) existe só para
  desenvolvimento e imprime aviso. `--allow-no-origin` também só para desenvolvimento e testes (o navegador e o Tauri sempre
  enviam `Origin`); fica fora do caminho de uso real e imprime aviso.

## Tela (Suplementos › Ferramentas externas)
Cada plugin tem um campo de token (mascarado), "Salvar token" e "Apagar token", o estado ("Token configurado", "Conexão
autenticada"), a mensagem da causa de falha e, em desenvolvimento, o aviso "Conectado SEM pareamento". O valor nunca volta
para a tela. Textos em pt/en em `pluginTokens.ts` e `ExternalToolsDialog.tsx`.

## Limitações
- **Cofre do sistema:** o desktop (Tauri) ainda não tem comando de cofre; o token fica no `localStorage` do webview/navegador
  (menos seguro) e a tela avisa. Trocar o armazenamento exige mudar só `lerToken`/`gravarToken` em `pluginTokens.ts`.
- O bloqueio do host vale por sessão do app (memória); o do processo Rust, por execução do processo.
- Não há rotação automática do token: apague o arquivo e reinicie o renderizador para gerar outro.
- O pareamento prova que o outro lado conhece o token; não cifra o canal (continua loopback, sem TLS).
