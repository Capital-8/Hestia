# Validação com o processo Rust separado

**Estado:** a troca de mensagens entre o Hestia e um processo Rust separado está validada por WebSocket real em loopback.
**Isto NÃO é o renderizador completo:** o processo mantém o espelho da cena e prova o protocolo; **não desenha**. A geometria
de um projeto real ainda não foi validada (ver "Próximo passo").

## O que existe
- `crates/hestia-renderer`: programa Rust independente (100% Rust; `tungstenite`, `serde_json`). Não é módulo do Hestia,
  tem `Cargo.toml` e `Cargo.lock` próprios e fica fora de qualquer workspace.
  - escuta só em `127.0.0.1` (nunca `0.0.0.0`), uma conexão por vez;
  - valida `Host` e `Origin` no aperto de mãos (seção Segurança);
  - fala o protocolo 1.0: `hello`, `ack`, `ping/pong`, snapshot, deltas com `scene.resync`, `camera.update`, `camera.mode`,
    `overrides.state`, `error`, `bye`; retomada por `hello.resume`;
  - **entradas de controle** por stdin (JSON, uma linha por comando): `set_mode`, `drive_camera`, `set_override`,
    `clear_override`, `resync`, `cancel`, `raw`, `quit`. São o que o usuário faria na interface do renderizador;
  - **relatório de estado** (`--state-file`, JSON escrito atomicamente) com versão negociada, permissões, revisão, entidades
    (tipo, vértices, triângulos, hash), materiais, câmera, modo, substituições, contadores e erros. É como o teste observa o outro processo.
- `tests/integration/rustRenderer.integ.ts`: o teste de integração.

## Como rodar
```
cd crates/hestia-renderer && cargo test          # 3 testes unitários da política Origin/Host
npm run test:rust-processo                       # compila o binário e roda a integração (precisa de cargo)
```
Argumentos do binário: `--port N`, `--state-file F`, `--control-stdin`, `--allow-origin O` (repetível), `--allow-no-origin`.

## O que o teste de integração prova (11 casos, dois processos do sistema operacional)
O lado Hestia é o Node do teste, com código real de `@hestia/plugin-api` (PluginHost, HostSession), o transporte WebSocket do
app e um `ProjectStore` real. O lado Rust é o binário, iniciado, comandado por stdin e lido pelo relatório. Nada usa o
transporte em memória; o PID do relatório é do processo filho e difere do PID do teste.

1. Segurança: `Origin` estranha, `null`, ausente e `Host` falso recebem 403; a origem do Hestia recebe 101; a porta não
   aceita conexão pelo IP não-loopback da máquina; o Hestia sem `Origin` fica "ausente" com motivo.
2. Negociação: protocolo 1.0, API 1.0, versão `0.1.0` do plugin, cinco permissões concedidas.
3. Snapshot real: ID do projeto, materiais do projeto, paredes (12 triângulos cada) e câmera.
4. Deltas reais por comandos do modelo (`addWall`, `upsertMaterial`, `deleteElements`), sem snapshot novo e sem `resync`.
5. Câmera Hestia→Rust no modo seguir; o Rust não consegue dirigir nesse modo (`bad_request`).
6. Modo de câmera pedido pelo Rust aparece no Hestia e volta ao seguir pelo Hestia.
7. Câmera Rust→Hestia aplicada **sem eco** (900 ms depois o Rust não recebeu nada de volta), e Hestia→Rust continua.
8. Substituição de material chega ao Rust e fica em `Project.plugins.viewOverrides`, com o material original idêntico;
   substituição inválida é recusada sem efeito; limpar remove.
9. Permissão negada (`camera.write`): o Rust recebe `permission_denied`, a câmera não muda; a sessão **retoma por delta**
   (`resumed: true`, nenhum snapshot novo).
10. Processo Rust encerrado: o Hestia sai de "conectado", reconecta sozinho a um processo novo e este recebe o snapshot.

## Defeito achado só com processos reais
Um quadro numerado com campos inválidos não consumia o `seq`; a mensagem válida seguinte virava `out_of_order` fatal e
derrubava a conexão. Corrigido em `Peer` (`transport.ts`): o `seq` é consumido e confirmado, e o erro volta com o `re` do
pedido. Teste de regressão em `plugins.test.ts`. O teste em memória não pegava isso porque as mensagens inválidas não eram
seguidas de válidas.

## Limitações
- **Geometria sintética:** no teste, cada parede real do projeto vira uma caixa (12 triângulos). A extração da cena 3D do
  app (`extractElementMeshes`) depende de THREE + GPU montada e **não** foi exercitada contra o Rust.
- O processo Rust não desenha; não há pipeline gráfico, texturas nem materiais PBR.
- Uma conexão por vez; conexões extras esperam na fila do `accept`.
- O teste usa `--allow-no-origin` porque o WebSocket do Node não envia `Origin`. A aceitação da origem do Hestia é provada
  por aperto de mãos HTTP cru; o fluxo completo com `Origin` de navegador/Tauri não foi exercitado.
- Dentro do sandbox do agente, processos filhos só escrevem dentro do projeto: o teste usa `crates/hestia-renderer/target/`.
- `clippy` acusa `result_large_err` em tipos de resposta HTTP do `tungstenite`; não é código nosso.
- Windows testado. Linux/macOS não.
- CI não foi alterado: o teste exige `cargo`; adicionar um job fica para a revisão.

## Próximo passo: geometria de um projeto real
1. No app (navegador ou Tauri), abrir um projeto real, habilitar o renderizador (iniciado com `--allow-origin` da origem
   do app) e capturar o relatório de estado.
2. Comparar, por elemento, contagem de entidades, caixa envolvente e triângulos do relatório com a cena 3D do Hestia;
   verificar paredes instanciadas sem faixas (`mesh: null`) e níveis ainda não montados.
3. Medir tamanho e tempo do snapshot de um projeto grande; se estourar, abrir a proposta de quadros binários (1.x).
4. Só depois ligar o desenho.
