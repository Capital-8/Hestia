# Protocolo (versão 1.2)

> **1.2 (aditiva):** acrescenta o **snapshot em partes** (`scene.snapshot.begin`, `scene.snapshot.part`, `scene.snapshot.end`), para cenas
> maiores que o quadro de 64 MiB. Usado só quando as duas pontas negociam 1.2; com 1.0 ou 1.1 o host segue enviando `scene.snapshot` inteiro.

> **1.1 (aditiva):** acrescenta o pareamento autenticado (`auth`, `auth.ok`, `hello.auth`, `welcome.authenticated`, erros
> `auth_required`, `auth_failed`, `not_authenticated`). Ver [07](07-pareamento-por-token.md). O host exige token por padrão; o 1.0
> continua negociável só quando o host aceita plugin sem autenticação (modo de teste). Tudo abaixo vale para as duas versões.

Quadros de **texto JSON** em transporte ordenado e bidirecional (WebSocket em loopback). O **plugin é o servidor**; o
Hestia conecta e o plugin fala primeiro (`hello`). Independente de linguagem; a referência em TypeScript é `protocol.ts`
e `transport.ts` (`Peer`).

Envelope: `{ "t": tipo, "seq"?: n, "id"?: correlação, "re"?: id respondido, ... }`.

## Tipos
| Sentido | Tipo | Capacidade exigida (concessão) |
|---|---|---|
| plugin→host | `hello` (`protocol` com `min` e `max`, `manifest`, `resume?`, `auth?` na 1.1) | — |
| host→plugin | `auth` (1.1: `nonce`, `proof`) e plugin→host `auth.ok` (1.1: `proof`) | — |
| host→plugin | `welcome` (`protocol`, `api`, `sessionId`, `granted`, `denied`, `heartbeatMs`, `cameraMode`, `resumed`) | — |
| host→plugin | `scene.snapshot` (1.0/1.1) ou `scene.snapshot.begin`/`.part`/`.end` (1.2), `scene.delta`, `event.connection` | `scene.read` (deltas também `events.subscribe`) |
| plugin→host | `scene.resync` | `scene.read` |
| host→plugin | `camera.update` (`camera`, `cameraRev`, `origin`) | `camera.read` e `events.subscribe` |
| plugin→host | `camera.set` (`camera`, `cameraRev`) | `camera.write` |
| ambos | `camera.mode.set` (plugin) e `camera.mode` (host) | `camera.write` |
| plugin→host | `overrides.set` (`materialId`, `override`), `overrides.clear` | `overrides.write` |
| host→plugin | `overrides.state` | — |
| plugin→host | `cancel` (`target`) | — |
| ambos | `ack`, `ping`, `pong`, `bye`, `error` | — |

## Regras
- **Versão:** `hello.protocol` é a faixa `[min, max]` do plugin. O host escolhe a maior versão comum (mesmo `major`).
  Sem interseção: `error unsupported_version` fatal e estado **incompatível**.
- **Confirmação:** toda mensagem exceto `ack`, `ping`, `pong`, `bye` e `error` leva `seq` crescente a partir de 1; o
  receptor responde `ack`. Duplicata: reconfirma e ignora. Salto: `out_of_order` fatal. Sem `ack` no prazo: `ack_timeout` fatal.
- **Heartbeat:** `ping` a cada `heartbeatMs` (padrão 5 s). Silêncio por mais de 2,5 vezes isso: `heartbeat_timeout` e fechamento.
- **Snapshot em partes (1.2):** `scene.snapshot.begin { snapshot (cabeçalho sem as listas), parts, counts }`, depois `parts` mensagens
  `scene.snapshot.part { index, entities?, materials?, textures? }` com `index` 0, 1, 2… e, por fim, `scene.snapshot.end { revision }`. O host
  fecha cada parte perto de 8 MiB de JSON (uma entidade nunca é dividida). O plugin só considera a cena válida no `end`, depois de
  conferir partes, revisão e contagens (`SnapshotAssembler`); inconsistência ⇒ `scene.resync`. O host não envia deltas entre `begin` e `end`
  (a ordem é garantida), e o primeiro delta parte de `end.revision`. Nenhum quadro passa do teto; o teto do snapshot deixa de ser 64 MiB.
- **Cena:** cada `scene.delta` tem `baseRevision` igual à revisão anterior. Se não casar, o plugin pede `scene.resync` e
  recebe novo snapshot. O host agrupa alterações (cerca de 300 ms) e nunca envia delta vazio.
- **Câmera:** modo `follow-hestia` (padrão): Hestia→plugin; `camera.set` é recusado (`bad_request`). Modo `plugin-drives`
  (exige `camera.write`): `camera.set` é aplicado; `cameraRev` menor ou igual ao último é ignorado. **Sem eco:** o host não
  devolve a câmera que acabou de aplicar (compara com tolerância e ignora alterações por 250 ms depois de aplicar); o
  plugin **não deve** reenviar como `camera.set` uma `camera.update` com `origin` `hestia`.
- **Cancelamento:** `cancel` com `target` cancela um pedido com `id` ainda não executado (hoje `scene.resync`) e devolve `error cancelled`.
- **Reconexão:** o Hestia reconecta com recuo (1, 2, 4, 8 e 15 s) enquanto habilitado e não incompatível. O plugin pode
  mandar `hello.resume` (`sessionId`, `lastRevision`); se a revisão casa com a retida, o host envia só o delta; senão, snapshot.
- **Erros:** `error` com `code` em `bad_frame`, `unknown_type`, `unsupported_version`, `bad_manifest`, `not_handshaken`,
  `permission_denied`, `bad_request`, `out_of_order`, `cancelled`, `ack_timeout`, `heartbeat_timeout`,
  `image_payload_forbidden`, `internal`; mais `message`, `fatal` e `detail?`. Fatal fecha a conexão.
- **Proibido:** imagem como sincronização. `findImagePayload` recusa `data:image/*` e as chaves `png`, `jpeg`, `image`,
  `frame`, `pixels`, `bitmap` e `screenshot`.
