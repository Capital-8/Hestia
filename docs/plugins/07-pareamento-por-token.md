# Pareamento por token (protocolo 1.1)

**Estado:** implementado no Hestia (`packages/plugin-api`) e no renderizador Rust de referência (`crates/hestia-renderer`),
validado entre processos separados (`npm run test:rust-processo`). **Autenticação é obrigatória por padrão nos dois lados.**
O protocolo 1.0 continua negociável, mas só quando o host a aceita de forma explícita (modo de teste).

## Por que o `Origin` não bastava
O renderizador valida `Host` e `Origin` ([06](06-validacao-processo-rust.md)). Isso barra páginas web e DNS rebinding, mas
**não** barra outro programa no mesmo computador (não envia `Origin`, ou o forja). Só um segredo compartilhado resolve.

## O protocolo (aditivo, `minor` 1.0 → 1.1)
O token **nunca trafega**: o pareamento é um desafio e resposta mútuos com HMAC-SHA256. Cada conexão usa dois nonces
novos (16 bytes, base64 padrão, 24 caracteres), um de cada lado, e as duas provas amarram **os dois** (refinamento em
relação ao esboço original, que usava só o nonce do plugin): uma prova capturada não vale em outra conexão.

```
plugin → host : hello   { protocol: {min:"1.1", max:"1.1"}, manifest, auth: { nonce: nP } }
host   → plugin: auth    { nonce: nH, proof: b64( HMAC-SHA256(token, "hestia-host|"   + nP + "|" + nH) ) }
plugin → host : auth.ok { proof: b64( HMAC-SHA256(token, "hestia-plugin|" + nP + "|" + nH) ) }
host   → plugin: welcome { ..., authenticated: true }       (só depois de conferir auth.ok)
```
- `auth` e `auth.ok` são numerados (`seq`/`ack`) como as demais mensagens; quadro duplicado é reconfirmado e ignorado.
- Antes do pareamento concluir, **nada** além de `auth`, `auth.ok`, `ack`, `ping`, `pong`, `error` e `bye` é aceito:
  qualquer outra mensagem recebe `error not_authenticated` (fatal) e a conexão fecha. O plugin que recebe `welcome` sem ter
  autenticado o host responde `auth_required`.
- Provas conferidas em tempo constante (`verify_slice` no Rust; `timingSafeEqual` no TypeScript).
- Códigos de erro novos: `auth_required`, `auth_failed`, `not_authenticated`. Campo novo em `welcome`: `authenticated`.
- Vetores fixos de teste (idênticos no Rust e no WebCrypto): token `0123…cdef` (64 hex), `nP = "A"×22 + "=="`,
  `nH = "B"×22 + "=="` ⇒ host `ee6ZJLkKce+oaVKpc8wRmc8AnOzpS+ror65AwTwKLSY=`, plugin `pkiqvzN+kIf4STO/1ClJqHrwtmVY2HPTihukJBJEqU0=`.

## Política e compatibilidade
| Host (Hestia) | Plugin | Resultado |
|---|---|---|
| exige token (padrão), token configurado | 1.1 com `auth` | pareia; protocolo 1.1 |
| exige token, **sem** token configurado | 1.1 | `auth_required` (incompatível; mostra como configurar) |
| exige token | 1.0 / sem `auth` | `auth_required` (incompatível) |
| exige token, token **diferente** | 1.1 | `auth_failed` (incompatível; a conexão não reconecta sozinha) |
| aceita não autenticado (`insecureAllowUnauthenticated`) | 1.0 / sem `auth` | conecta em **1.0**, sem autenticação |
| Hestia 1.0 antigo | plugin 1.1 | negocia 1.0; o plugin 1.1 que exige token fecha a conexão |

- `negotiateProtocol` escolhe a maior versão comum; o `PROTOCOL_VERSION` do Hestia passou a 1.1.
- **Modo sem autenticação, restrito a testes locais:** no Hestia é a opção de código `PluginHost({ insecureAllowUnauthenticated })`
  (padrão `false`, **sem controle na interface**). No Rust é `--insecure-no-auth` (exclusivo com `--token-file`; avisa em
  `stderr`; o relatório marca `insecure: true`). Sem `--token-file` e sem `--insecure-no-auth` o processo **não inicia**.
  Cliente sem `Origin` (não é navegador) só é aceito no Rust quando há token (ou com `--allow-no-origin` no modo de teste);
  `Origin` estranha segue recusada.

## O token
- Gerado pelo renderizador: `hestia-renderer --init-token ARQUIVO` (256 bits, hex; **não sobrescreve** arquivo existente;
  no Unix o arquivo fica `0600`). O token **não** aparece na saída, salvo com `--show-token` (pedido explícito, uma vez).
- O renderizador inicia com `--token-file ARQUIVO`. O usuário cola o token em *Ferramentas externas*.
- No Hestia o token fica numa chave própria (`hestia.plugins.v1.tokens`), **fora** da lista de plugins, e nunca é exposto:
  a visão do gerenciador só traz `hasToken`. Não vai a log, relatório de estado, erro ou mensagem do protocolo.
- Três falhas seguidas no Rust atrasam a próxima conexão (1 s por falha extra, até 5 s); autenticar zera o contador.

## Limitações conhecidas
- **No navegador o token fica em `localStorage`** (acessível a qualquer script da mesma origem). No Tauri, o lugar certo é o
  cofre do sistema: pendente (`desktop/`). Tratar o token como senha.
- Não há rotação nem revogação além de apagar o arquivo e gerar outro.
- O pareamento autentica as partes e impede repetição entre conexões, mas **não cifra** o tráfego (loopback, texto): quem
  já controla o computador ainda observa a cena. Cifra por sessão fica para uma versão futura.
- Uma conexão por vez no renderizador; o atraso por falhas vale para o processo todo.
