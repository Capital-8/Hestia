# Permissões e fluxo de conexão

## Capacidades
| Capacidade | Permite |
|---|---|
| `scene.read` | snapshot e `scene.resync` |
| `camera.read` | ler a câmera 3D |
| `events.subscribe` | deltas de cena e eventos de câmera (junto das leituras acima) |
| `camera.write` | `camera.set` e `camera.mode.set` (exige `camera.read`) |
| `overrides.write` | gravar e limpar substituições de visualização (exige `scene.read`) |

Não há escrita geral no documento. O renderizador pede as cinco, mas **nada vale até o usuário marcar**. Mensagem sem
concessão recebe `error permission_denied` (não fatal) e não tem efeito. Mudar as permissões reinicia a sessão (com retomada).

## Estados na tela
- **Ausente:** nunca visto e nada responde no endereço.
- **Desconectado:** já visto (versão conhecida), desligado ou fora do ar.
- **Conectando e Reconectando:** transitórios.
- **Conectado:** sessão ativa, com versão do plugin, permissões e modo de câmera.
- **Incompatível:** respondeu, mas protocolo, API, manifesto, tipo ou **token** não servem; mostra o motivo (inclusive a causa do pareamento: token errado, ausente, plugin sem token, bloqueio) e **não** reconecta sozinho.

## Fluxo
1. O usuário abre o programa externo (que escuta em `127.0.0.1:<porta>`).
2. Em **Suplementos › Ferramentas externas**, cola o **token de pareamento** (mostrado uma vez pelo programa externo), marca as permissões e **Habilita** (ou usa **Conectar**). Sem token o plugin fica Incompatível (`no_token`).
3. O Hestia abre o WebSocket; o plugin envia `hello`; o host negocia, faz o pareamento por token (`auth`/`auth.ok`), valida o manifesto, responde `welcome` e envia o snapshot. Três falhas seguidas de token bloqueiam novas tentativas por 10 s.
4. Alterações do modelo chegam como deltas; a câmera segue o modo escolhido; substituições são salvas no arquivo do projeto.
5. Queda: reconexão automática com retomada. **Desconectar** pausa; **Desabilitar** para de vez.
