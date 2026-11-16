# Referência da API de suplementos

Complementa o [guia do autor](09-guia-do-autor.md) e a [especificação](08-suplementos-v2.md). Tipos TypeScript: `sdk/hestia-plugin.d.ts`. Unidades: comprimento em metro (m), área em metro quadrado (m2), volume em metro cúbico (m3), ângulo em radiano (rad), tempo em milissegundos (ms), memória em mebibytes (MiB), tamanhos em bytes.

## 1. Versão da API

`hestiaApi` no manifesto é `"major.minor"`. O Hestia aceita o mesmo `major` e `minor` menor ou igual ao seu (hoje `"1.0"`). `"2.0"` é recusado (`api_incompatible`).

## 2. O `ctx` do script

Primeiro argumento de **todo** handler. Objeto congelado; criado a cada chamada com as portas concedidas.

| Membro | Existe se | Descrição |
|---|---|---|
| `ctx.pluginId` | sempre | id do manifesto |
| `ctx.log.info/warn/error(texto)` | sempre | entrada no log do suplemento (visível só no gerenciador); 500 caracteres |
| `ctx.model.read()` | `model.read` | `Promise<Project>`: cópia imutável do projeto (`levels`, `elements`, tipos, materiais...) |
| `ctx.model.apply(label, commands)` | `model.write` (e `model.read`) | `Promise<{ ok: true, applied } \| { ok: false, index, error }>`; atômico; **um** passo de Desfazer com o rótulo `<nome do suplemento>: <label>` |
| `ctx.model.newId(prefix)` | `model.write` (e `model.read`) | `Promise<string>`; prefixo `[a-z][a-z0-9]{0,15}`; ids novos de elementos **precisam** vir daqui |
| `ctx.data.get(key)` | `plugindata.rw` | `Promise<json \| undefined>` |
| `ctx.data.set(key, value)` | `plugindata.rw` | `Promise<void>`; rejeita se somente leitura (projeto com `dataSchema` maior) ou se passar dos limites |
| `ctx.data.delete(key)` | `plugindata.rw` | `Promise<void>` |

Não existe `ctx.ui`: a interface é **declarada** em `contributes` (comandos, botões, painéis, diálogos, ferramentas) e o Hestia a desenha; o script só reage por handlers. O host confere a permissão **a cada chamada** de porta, além de o `ctx` esconder as portas não concedidas.

Funções exportadas especiais: `activate(ctx)` é opcional e chamada ao ativar (erro = suplemento "falhou"). As demais exportações são handlers chamados pelo manifesto.

## 3. Handlers: argumentos e convenção do resultado

| Origem | Assinatura | O que devolver |
|---|---|---|
| `commands[].run`, `dialogs[].actions[].run`, botão de painel (`{ type: 'handler' }`) | `(ctx, valores?)` | resultado de handler (abaixo) |
| `tools[].onCommit` | `(ctx, evento)` | `{ draft?, commit?, message?, done? }` |
| `checks[].handler` | `(ctx)` | `[{ elementId?, message? }]` |
| `exporters[].handler` | `(ctx, { project, fileName })` | texto, `Uint8Array` ou `{ data, name? }` |
| `importers[].handler` | `(ctx, { name, bytes })` | `commands[]` ou `{ commands, report? }` |

**Resultado de handler de ação** (dado não confiável, só vira texto): `string`; `{ title?, message }` com `PluginText`; ou qualquer JSON (mostrado formatado, até 4000 caracteres). `null` ou `undefined` não abre caixa. `PluginText` é `string` (vale para os dois idiomas) ou `{ pt, en }`.

**`valores`** (diálogo ou painel): objeto `chave -> valor` já validado (tipo, `min`/`max`, opção válida, texto até 200 caracteres). `length` chega em metro e `angle` em radiano, mesmo que o usuário digite nas unidades do projeto. Botão de painel recebe também `$selection` (ids dos elementos selecionados).

**Eventos de ferramenta** (`tools`): `start` (`tool`, `prompts`, `values?`), `point` (`key`, `kind`, `point {x, y}` em metro, `elementId?`, `complete`, `collected` por `key`), `move` (`key`, `point`, `collected`), `key` (`Enter`, `Tab` ou `Space`) e `cancel` (Esc). Tipos de `prompts[].kind`: `point`, `line` (2 cliques), `polyline` (termina com Enter) e `pick-element`. Movimentos seguidos se fundem no último. **Resposta**: `draft { lines[], points[], labels[] }` (até 500 linhas, 500 pontos, 50 rótulos de 80 caracteres; coordenadas finitas até 1e6 m), `commit { label (até 80), commands }` (vai por `model.apply`), `message` (até 200 caracteres, barra de estado) e `done`. Respostas atrasadas são ignoradas.

**Verificação por handler**: sem `message`, vale a da verificação preenchida com os campos do elemento; `elementId` inexistente perde o vínculo; até 200 itens por verificação.

## 4. Comandos permitidos em `model.apply`

Lista branca de `Command` de `packages/model` (qualquer outro tipo recusa o lote inteiro com `index` do item). Máximo de 5000 comandos e 8 MiB de JSON por lote; profundidade 64.

- **Criar elemento** (o `id` do elemento deve ter sido emitido por `model.newId`): `addWall`, `addCadDrawing`, `addGeneric`, `addOpening`, `addFloor`, `addSlab`, `addRoof`, `addCeiling`, `addRoom`, `addStair`, `addRamp`, `addGuardaCorpo`, e `addCeilings` (lista de forros).
- **Atualizar `{ id, patch }`**: `updateCadDrawing`, `updateGeneric`, `updateCeiling`, `updateRoom`, `updateGuardaCorpo`. `patch` não altera `id`, `kind` nem `order`.
- **Sobre elemento existente**: `detachOutline`, `relinkOutline`, `setWallEnds`, `updateElements`, `deleteElements`, `transform`, `splitWall`, `setJoin`, `setOpeningHost`.
- **Tipos e materiais** (só sob o prefixo `<pluginId>:` do próprio suplemento): `upsertWallType`, `upsertCeilingType`, `upsertRoofType`, `upsertStairType`, `upsertRampType`, `upsertSlabType`, `upsertFloorType`, `upsertOpeningType`, `upsertTipoGuardaCorpo`, `upsertMullionType`, `upsertCurtainPanelType`, `upsertMaterial`; e `deleteWallType`, `deleteCeilingType`, `deleteRoofType`, `deleteStairType`, `deleteRampType`, `deleteSlabType`, `deleteFloorType`, `deleteTipoGuardaCorpo`, `deleteMullionType`, `deleteCurtainPanelType`, `deleteOpeningType`, `deleteMaterial`.
- **Dados do suplemento**: `setPluginData`, `deletePluginData` (o host força `pluginId`, `schema` e versão; prefira `ctx.data`).

Fora da lista: apagar níveis, importar em massa, mexer em dados de outro suplemento. Depois de aplicar numa cópia, o host roda `validateProject`; erro novo recusa o lote (nada muda e nada entra no histórico).

## 5. Verificações e quantitativos: expressões e campos

**Expressões** (`rule`, `filter`, `columns[].expr`) são JSONLogic **restrito**: JSON puro, operadores em inglês, sem laços, sem recursão, sem sintaxe própria. Até 500 caracteres, profundidade 12, 20000 nós avaliados.

Operadores: `var`, `+`, `-`, `*`, `/`, `==`, `!=`, `===`, `!==` (todos **estritos**, sem coerção), `<`, `<=`, `>`, `>=`, `and`, `or`, `!`, `!!`, `if`, `in`, `round`, `min`, `max`, e as agregações `sum` e `count` (só em quantitativos). Campo ausente vale `null`; aritmética com `null` dá `null`, comparação com `null` dá `false`; divisão por zero dá `null`; falsos: `null`, `false`, `0`, `""`, `[]`. `var` só enxerga os campos abaixo (nunca o projeto nem protótipos).

**Campos consultáveis** (`applyTo` de `checks`; `source` de `schedules`). Medidas em m, m2 e m3.

| Origem | Campos |
|---|---|
| todas (`common`) | `id`, `kind`, `mark`, `levelId`, `levelName` |
| `wall` | `typeId`, `typeName`, `length`, `height`, `thickness`, `area`, `volume`, `material`, `materials`, `cost`, `thermalU`, `acousticRw` |
| `opening` (porta e janela), `door`, `window` | `typeId`, `typeName`, `typeCode`, `hostId`, `width`, `height`, `sill`, `area`, `leaves` |
| `floor` | `typeId`, `typeName`, `area`, `material`, `materials` |
| `room` | `name`, `number` |
| qualquer outro `kind` | só os campos comuns |

**Verificações (`checks`)**: `{ id, title, severity: 'info' | 'warning' | 'error', applyTo, message, rule? | handler? }`. **Regra FALSA gera um item** no painel de problemas (para cada elemento de `applyTo`); a regra descreve o que está certo. Código do item: `plugin:<id do suplemento>:<id da verificação>`. `message` aceita `{campos}` do elemento (ex.: `{mark}`, `{width}`). Até 200 itens por verificação; mensagem até 300 caracteres. Expressão inválida ignora a verificação e registra no log do suplemento.

**Quantitativos (`schedules`)**: `{ id, title, source, columns[{ key, title, expr, unit?, total?: 'sum' | 'count' }], filter?, groupBy?: [chave de coluna] }`. Sem `groupBy`, uma linha por elemento; com `groupBy`, uma por grupo e `sum`/`count` agregam. `total` gera a linha de totais. Até 5000 linhas (a tabela avisa o corte). Célula que falha vira vazia e é contada. A tela exporta CSV.

## 6. Declarações de interface

**`dialogs[]`**: `{ id, title, fields[{ key, label, type, default?, min?, max?, options? }], actions[{ id, label, run }] }`. Tipos de campo: `number`, `text` (até 200 caracteres), `choice` (`options` obrigatório), `bool`, `length` (m), `angle` (rad).

**`panels[]`**: `{ id, title, dock: 'properties' | 'browser', when?: { kind, minSelected? }, view }`. `view` é uma lista de blocos: `{ type: 'text', text }`, `{ type: 'value', field, label?, unit?: 'length' | 'angle' }`, `{ type: 'row', children }`, `{ type: 'table', columns[{ title, field, unit? }] }`, `{ type: 'button', label, run }` e `{ type: 'input', key, label, input: <tipo de campo>, default?, min?, max?, options? }`. Profundidade 6, 200 nós, texto até 400 caracteres. `field` é caminho de propriedades próprias (`a.b`), nunca `__proto__`, `constructor` nem `prototype`.

**Ações** (`run`): `{ type, ref }`, com `type` em `handler`, `dialog`, `tool`, `exporter`, `importer`, `check`, `schedule`. `ref` é o id da contribuição (ou o nome da função, em `handler`). Ação sem suporte avisa e o app segue.

**`ribbon`**: sempre vai para a aba **Suplementos** (o suplemento não escolhe a aba). **`families[]`**: `{ id, category: wall | opening | floor | slab | ceiling | roof | stair | ramp, types[] }`; os tipos passam pelo validador do app e entram sob `<pluginId>:<id>` quando o usuário clica em **Carregar conteúdo**. **`materials[]`**: `{ id, name, color: '#rrggbb', gloss?, opacity? }` (0 a 1).

## 7. Códigos de erro

**Validação do manifesto** (`npm run suplementos:empacotar`, instalação): `not_object`, `manifest_too_large` (256 KiB), `bad_manifest_version`, `bad_field`, `unknown_capability`, `bad_api_version`, `api_incompatible`, `capability_not_allowed`, `missing_dependency`, `too_many`, `duplicate_id`, `unknown_ref`, `missing_capability`, `runtime_conflict`; do empacotador: `handler_missing`.

**Pacote** (`openPackage`): `not_zip`, `zip64`, `encrypted`, `corrupt`, `too_many_files`, `too_big_file`, `too_big_total`, `too_big_pkg`, `bad_path`, `no_manifest`, `manifest_big`, `manifest_json`, `manifest_field`, `file_type`, `wasm`, `entry_missing`.

**Instalação e gerenciador**: `manifest_invalid`, `id_mismatch` (atualizar com pacote de outro id), `unexpected`; ao conceder: `unknown`, `not_requested` (permissão que o manifesto não pede), `missing_dependency` (`model.write -> model.read`), `activation_failed`.

**Script** (`ScriptError.code`): `timeout` (passou de `timeoutMs`; o Worker é encerrado e recriado), `memory` (passou de `memoryMiB`), `script_error` (exceção do handler), `load_failed` (código inválido), `failed` (suplemento em "falhou"), `stopped` (desativado), `worker_error`. Três falhas em 60000 ms levam ao estado "falhou".

**Portas**: `permission_denied: <permissão>` (porta sem concessão); `model.apply` devolve `{ ok: false, index, error }` (`index: -1` = lote inteiro: formato, tamanho, permissão).

**Importar e exportar** (`PluginIoCode`): `too_large` (64 MiB), `bad_bytes`, `bad_name`, `bad_extension`, `bad_result`, `too_many_commands` (5000), `no_commands`; no host: `handler`, `denied`, `unknown`, `busy`, `apply`.

## 8. Estados no gerenciador

`active` (ativo), `disabled` (desativado), `needs-grant` (nada concedido, tendo o manifesto pedido), `failed` (falhou; veja o motivo e **Reativar**), `installed` (instalado, ainda não ativado). Concessão parcial ativa só o concedido.

## 9. SDK

| Item | Onde | Uso |
|---|---|---|
| Tipos | `sdk/hestia-plugin.d.ts` | `import('./hestia-plugin').HestiaContext` |
| Modelo | `sdk/template/` | `npm run suplementos:novo -- <id>` |
| Validador | `sdk/validar.ts` (`validarArquivos`, `descreverProblema`) | usado pelo empacotador e pelo testkit |
| Testkit | `sdk/testkit.ts` (`carregarPasta`, `carregarArquivos`, `criarTeste`) | `t.call`, `t.store`, `t.lotes`, `t.logs`, `t.registry`, `t.dados()`, `t.temPermissao()` |
| Empacotador | `npm run suplementos:empacotar -- [--validar] [pasta]` | valida e gera `.hestiapkg` |
