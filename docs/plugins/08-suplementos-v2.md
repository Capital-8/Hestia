# Suplementos 2.0: especificação

**Estado:** PROPOSTO. Nada deste documento está implementado, salvo o que vier marcado **EXISTE**. Decisão: [0057](../decisoes/0057-suplementos-geral.md); base: [0047](../decisoes/0047-plugins-de-integracao.md) e [01](01-api.md) a [07](07-pareamento-por-token.md).
Unidades em todo o documento: comprimentos em **metro**, ângulos em **radiano**, tempos em **milissegundos (ms)**, memória em **mebibytes (MiB)**, tamanhos de arquivo em **bytes** ou **MiB**.

## 1. Conceitos
- **Suplemento** (no código, `plugin`): unidade instalável descrita por um manifesto.
- **Runtime:** `declarative` (só JSON), `script` (Worker isolado) ou `external` (processo separado, WebSocket loopback; EXISTE).
- **Contribuição** (`contributes`): o que o suplemento acrescenta ao Hestia. **Permissão** (`capabilities`): o que ele pode fazer. Contribuir não concede nada; o usuário concede.

## 2. Manifesto 2.0 (`manifest.json`)
PROPOSTO: `PluginManifestV2` em `packages/plugin-api/src/manifestV2.ts`. O validador novo (`validateManifestAny`) aceita 1.x e 2.0; o manifesto é **dado não confiável**: objeto simples, campos desconhecidos **ignorados e descartados** (não repassados), tamanhos limitados, nada de caminho absoluto, `..`, URL de código nem `eval`.

| Campo | Tipo | Obrigatório | Regra e limite |
|---|---|---|---|
| `manifestVersion` | `2` | sim (2.0) | ausente = manifesto 1.x (§2.1) |
| `id` | texto | sim | reverso-DNS minúsculo, `^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$` (mesmo `ID_RE` de `manifest.ts`), até 100 caracteres |
| `name` | texto | sim | 1 a 80 caracteres |
| `version` | texto | sim | semver do suplemento `x.y.z` (até 40 caracteres) |
| `hestiaApi` | texto | sim | `major.minor` alvo (EXISTE: `apiSupports`); mesmo `major`, `minor` <= o do host |
| `runtime` | `'declarative' \| 'script' \| 'external'` | sim | define os campos abaixo |
| `description` | texto | não | até 400 caracteres |
| `author`, `homepage`, `license` | texto | não | até 120, 200 e 40 caracteres; `homepage` só `https://` e só exibido (nunca aberto sem clique) |
| `capabilities` | lista de permissões | sim (pode ser `[]`) | até 40 itens, sem repetição; desconhecida recusa o manifesto (como hoje) |
| `entry` | caminho relativo no pacote | só `script` | até 200 caracteres, `.js` ou `.mjs`, dentro do pacote |
| `limits` | objeto | não, só `script` | `timeoutMs` (padrão 2000, máx. 30000 por chamada), `memoryMiB` (padrão 64, máx. 256), `maxCommandsPerAction` (padrão 5000, máx. 50000); o host **limita** ao teto, nunca amplia |
| `external` | objeto | só `external` | `{ kind: 'renderer'\|'exporter'\|'analysis'; endpoint?: {host,port} }`; mesma regra de `validateEndpoint` (loopback, portas 1024 a 65535) |
| `dataSchema` | inteiro 1 a 9999 | não | versão do formato do **espaço de dados** do suplemento (§5); padrão 1 |
| `contributes` | objeto | não | pontos da §4; no máximo 200 entradas no total |
| `i18n` | `{ [lang]: { [chave]: texto } }` | não | até 4 línguas (`pt`, `en` ao menos), 200 chaves, 200 caracteres por texto; rótulos de contribuição usam `"%chave"` |

Regras cruzadas: `runtime: 'declarative'` **não pode** ter `entry`, `external` nem contribuições `tools` ou `importers`/`exporters` com `handler`; `runtime: 'script'` exige `entry`; `runtime: 'external'` exige `external`. Cada `contributes.*[].id` é único **dentro do suplemento**; o host o expõe como `<pluginId>:<id>`.

### 2.1 Compatibilidade com 1.x (EXISTE, não pode quebrar)
Um manifesto sem `manifestVersion` é lido por `validateManifest` atual, **sem mudança**, e tratado como `{ runtime: 'external', external.kind: <kind>, contributes: {} }`. A mensagem `hello` do protocolo 1.0 continua carregando o manifesto 1.x. Os 11 casos de `tests/integration/rustRenderer.integ.ts` e `packages/plugin-api/src/plugins.test.ts` devem passar **sem edição**; `PluginManifest`, `INTEGRATION_KINDS` e `CAPABILITIES` não perdem campo nem chave. Suplemento externo 2.0 usa `hello` protocolo 1.1 ([07](07-pareamento-por-token.md)), com `manifestVersion: 2`.

## 3. Permissões (`capabilities`)
EXISTE: as 5 abaixo marcadas "atual". PROPOSTO: as demais, em `packages/plugin-api/src/permissions.ts` (acréscimo a `CAPABILITIES`; a tabela atual não muda). Menor privilégio: o suplemento **pede**, o usuário **concede** por permissão na tela (estendendo `PluginHost.setGrants`), o host confere a **concessão** a cada chamada e falha com `permission_denied`.

| Permissão | Permite | Exige | Runtimes |
|---|---|---|---|
| `scene.read` (atual) | ler a cena 3D (snapshot, deltas) | n/a | external |
| `camera.read` (atual) | ler a câmera 3D | n/a | external |
| `events.subscribe` (atual) | eventos de alteração | n/a | todos |
| `camera.write` (atual) | dirigir a câmera 3D | `camera.read` | external |
| `overrides.write` (atual) | substituições de visualização (`setPluginViewOverride`) | `scene.read` | external |
| `model.read` | ler o projeto como dados imutáveis (cópia): níveis, elementos, tipos, materiais, quantitativos; consultar por id/tipo | n/a | todos |
| `model.write` | aplicar **lotes de comandos** validados (§6) como **um passo de desfazer** | `model.read` | script, external |
| `plugindata.rw` | ler e gravar o **próprio** espaço de dados em `Project.plugins.data[pluginId]` (§5) | n/a | todos |
| `ui.commands` | registrar comandos na busca de comandos | n/a | todos |
| `ui.ribbon` | acrescentar botões/painéis na aba Suplementos | `ui.commands` | todos |
| `ui.panels` | painéis laterais (propriedades/navegador) declarativos | n/a | todos |
| `ui.dialogs` | caixas de diálogo declarativas | n/a | todos |
| `ui.tools` | ferramentas de desenho interativas (§4, `tools`) | `model.write` | script, external |
| `io.import` | registrar importadores e ler o arquivo escolhido pelo usuário | `model.write` | script, external |
| `io.export` | registrar exportadores; receber o modelo e **devolver arquivo** ao usuário | `model.read` | todos |
| `checks.run` | registrar verificações (regras) e publicar avisos no painel de problemas | `model.read` | todos |
| `content.families` | contribuir famílias/tipos (paredes, aberturas, etc.) | n/a | todos |
| `content.materials` | contribuir materiais | n/a | todos |
| `content.schedules` | contribuir quantitativos/tabelas | `model.read` | todos |
| `net.fetch` | **reservado, não implementado nesta fase** (rede a partir de script) | n/a | nenhum |

Regras: (1) `declarative` só pode pedir `ui.*` (menos `ui.tools`), `content.*`, `checks.run`, `io.export` com formato declarativo, `plugindata.rw` e `model.read`; `model.write` é recusado. (2) Dependências: conceder a permissão sem as exigidas é impossível (a tela marca as exigidas junto) e o host trata a falta como `permission_denied`. (3) Mudar concessões reinicia a sessão/Worker do suplemento (como já ocorre em 03). (4) O manifesto é só um **pedido**; a lista concedida fica no `localStorage` (`hestia.plugins.v1`, EXISTE) e, para uso real, também registrada no projeto (§5) para auditoria.

## 4. Pontos de contribuição (`contributes`)
Todos PROPOSTOS. Textos visíveis aceitam `string` ou `{ pt, en }` (como `Txt`/`t()` em `apps/web/src/ui/ribbon/model.ts`) ou `"%chave"` do `i18n` do manifesto. Ícone: nome de ícone interno do Hestia (`Icon.tsx`); ícone próprio só como SVG do pacote, até 20 KiB, sem `<script>`.

| Ponto | Formato de cada entrada | Permissão | Runtime |
|---|---|---|---|
| `commands[]` | `{ id, title, keywords?: string[], run: <Ação> }` | `ui.commands` | todos |
| `ribbon` | `{ panels: [{ id, title, items: [{ command: <id>, size?: 'large'\|'small', icon? }] }] }`; vai sempre para a aba **Suplementos** (a aba não é escolhida pelo suplemento) | `ui.ribbon` | todos |
| `panels[]` | `{ id, title, dock: 'properties'\|'browser', when?: <Seletor>, view: <Visão declarativa> }` | `ui.panels` | todos |
| `dialogs[]` | `{ id, title, fields: [{ key, label, type: 'number'\|'text'\|'choice'\|'bool'\|'length'\|'angle', default?, min?, max?, options? }], actions: [{ id, label, run: <Ação> }] }` (`length` em metro, `angle` em radiano na API; mostrados nas unidades do projeto) | `ui.dialogs` | todos |
| `tools[]` | `{ id, title, icon?, prompts: [{ key, kind: 'point'\|'line'\|'polyline'\|'pick-element', label }], onCommit: <handler> }`; o host faz captura, prévia e cancelamento (Esc), o suplemento só recebe os pontos já capturados e devolve **comandos** (§6) | `ui.tools` | script, external |
| `importers[]` | `{ id, title, extensions: ['dxf',...], handler: <handler> }`; recebe os bytes (até 64 MiB) e devolve lote de comandos + relatório | `io.import` | script, external |
| `exporters[]` | `{ id, title, extension, mime, handler: <handler> \| template: <Modelo declarativo> }`; devolve bytes (até 64 MiB) que o host entrega como download | `io.export` | todos |
| `families[]` | `{ id, category: 'wall'\|'opening'\|'floor'\|'slab'\|'ceiling'\|'roof'\|'stair'\|'ramp', types: [<tipo no formato do modelo, sem id>] }`; os tipos são **validados pelo mesmo validador do app** (`wallType.ts`, `openingTypes.ts`, ...) e entram como tipos do projeto sob `<pluginId>:<id>` só quando o usuário os **carrega** | `content.families` | todos |
| `materials[]` | `{ id, name, color: '#rrggbb', gloss?: 0..1, opacity?: 0..1 }` | `content.materials` | todos |
| `schedules[]` | `{ id, title, source: 'wall'\|'opening'\|'room'\|'floor'\|..., columns: [{ key, title, expr, unit?, total?: 'sum'\|'count' }], filter?: <expr>, groupBy?: [key] }`; `expr` é uma expressão **JSONLogic** (JSON, operadores em inglês, sem sintaxe própria nem palavras em pt-BR; **não Turing-completa**), restrita a uma lista branca de operadores (`var`, `+ - * /`, comparações, `and`, `or`, `!`, `round`, `min`, `max`) e a campos do elemento | `content.schedules` | todos |
| `checks[]` | `{ id, title, severity: 'info'\|'warning'\|'error', applyTo: 'wall'\|'opening'\|..., rule: <expr JSONLogic booleana>, message: <Txt com {campos}> }` ou `handler` (só script/external); a violação vira item do painel de problemas (formato de `ValidationIssue`, EXISTE em `packages/model/src/validate.ts`) | `checks.run` | todos |

Auxiliares: **\<Ação\>** = `{ type: 'dialog'\|'tool'\|'exporter'\|'importer'\|'handler', ref: <id> }` (declarativo só usa os quatro primeiros). **\<handler\>** = nome de função exportada pelo `entry` (script) ou id de mensagem (external). **\<Seletor\>** = `{ kind: <tipo de elemento>, minSelected?: n }`. **\<Visão declarativa\>** = árvore de blocos `text`, `value` (campo do elemento), `row`, `table`, `button` (com `<Ação>`); sem HTML, sem script, sem URL.

Limites gerais: `contributes` com no máximo 200 entradas; texto de título 80 caracteres; `expr` 500 caracteres e profundidade 12; `families[].types` até 200 itens por entrada; tamanho do manifesto até 256 KiB.

### 4.1 Onde cada ponto aparece
`commands`: busca de comandos (`apps/web/src/ui/ribbon/commandSearch.ts`). `ribbon`: aba `suplementos` (hoje só `sup-externas`, em `tabsSoon.ts`). `dialogs`: novo `DialogKind` `'pluginDialog'` em `apps/web/src/editor/state.ts`, despachado em `App.tsx`. `checks`: painel de problemas (`IssuesButton.tsx`). `schedules`: caixa de quantitativos (como `'schedule'`/`'openingSchedule'` em `DialogKind`). `families`/`materials`: catálogos e `Project.materials`.

## 5. Dados do suplemento no projeto
PROPOSTO, em `packages/model/src/pluginData.ts` (EXISTE: `PluginProjectData` com `projectUid` e `viewOverrides`; `applyPluginDataCommand`). Acréscimos opcionais, **sem mudar `SCHEMA_VERSION`**:

```ts
interface PluginProjectData {
  projectUid?: string;                     // EXISTE
  viewOverrides?: Record<string, Record<Id, ViewMaterialOverrideData>>; // EXISTE
  data?: Record<string /*pluginId*/, PluginDataSpace>;  // PROPOSTO
  grants?: Record<string, string[]>;       // PROPOSTO: permissões concedidas ao salvar (auditoria)
}
interface PluginDataSpace {
  schema: number;                          // = manifest.dataSchema
  version: string;                         // versão do suplemento que gravou por último
  values: Record<string, JsonValue>;       // chave livre (<= 64 caracteres) -> JSON
}
```
Limites (aplicados pelo host em `applyPluginDataCommand`): 1 MiB por suplemento, 4 MiB no projeto, profundidade JSON 16, chaves até 64 caracteres, só JSON puro (sem `undefined`, funções, `NaN`). Comandos PROPOSTOS: `{ type: 'setPluginData', pluginId, key, value }` e `{ type: 'deletePluginData', pluginId, key }`; um suplemento só escreve no **seu** `pluginId` (o host força o id, o suplemento não o escolhe). Se `dataSchema` do suplemento instalado for **maior** que o salvo, ele migra (`onMigrate`, só script/external); se for **menor** (projeto de versão mais nova), o espaço fica **somente leitura** e o app avisa. Se o suplemento sumir, o espaço é **preservado** (nunca apagado sozinho). Isto é a mitigação para "tipos novos de elemento definidos por plugin" (não-objetivo): dados próprios por id de elemento, em `values`, sem entrar em `Project.elements`.

## 6. Escrita no modelo (API de comandos)
Porta PROPOSTA `ModelPort` em `packages/plugin-api/src/hostPorts.ts` (junto de `ScenePort`, EXISTE):
```ts
interface ModelPort {
  read(): ProjectSnapshot;                               // cópia imutável (model.read)
  apply(pluginId: string, label: string, commands: unknown[]): ApplyResult; // model.write
}
type ApplyResult = { ok: true; applied: number } | { ok: false; index: number; error: string };
```
Regras do host (implementação em `apps/web/src/plugins/appModelPort.ts`, PROPOSTO, ao lado de `appPorts.ts`, EXISTE):
1. O lote é `unknown[]`: cada item é **validado** contra uma lista branca de tipos de `Command` permitidos ao plugin (`packages/model/src/pluginCommands.ts`, PROPOSTO) e por `validateProject` depois de aplicar. Comando fora da lista (ex.: apagar o projeto, trocar `plugins` de outro id, `import` em massa) é recusado.
2. **Atômico:** `ProjectStore.transaction(label, fn)` (EXISTE em `history.ts`) executa `exec` de cada comando; se algum lançar erro ou `validateProject` achar erro novo, o lote inteiro é desfeito sem entrar no histórico. Sucesso = **um** passo de desfazer, rótulo `"<nome do suplemento>: <label>"`.
3. Limite: `maxCommandsPerAction` (padrão 5000) e 8 MiB por lote; ids novos devem vir de `newId` do host (o plugin pede ids por `model.newId(prefix)`; ids inventados pelo plugin são recusados).
4. O plugin **nunca** recebe o `Project` mutável nem o `ProjectStore`; só cópias (como nas portas atuais).
5. **IA desenha:** a IA devolve `commands[]`; o host mostra uma **prévia** (a transação roda, o resultado é desenhado, e só `confirmar` a mantém; `cancelar` faz `undo` silencioso) e aplica como um passo. Sem confirmação, nada fica.

## 7. Ciclo de vida
Estados PROPOSTOS (estendem `PluginState` de `pluginHost.ts`, EXISTE: `absent`, `disconnected`, `connecting`, `connected`, `reconnecting`, `incompatible`): `installed`, `needs-grant`, `active`, `failed`, `disabled`.

1. **Instalar:** o usuário escolhe um `.hestiapkg` (ou pasta, em desenvolvimento). O host lê o zip (limites em §8), valida `manifest.json` (dado não confiável) e **nada executa**. Resultado: `installed`, com a lista de permissões pedidas na tela. Falha de validação mostra o motivo e não instala.
2. **Conceder e ativar:** o usuário marca as permissões e ativa. `declarative`: contribuições registradas, sem código. `script`: cria o Worker, carrega `entry`, chama `activate(ctx)`. `external`: conecta como hoje (e exige token).
3. **Operação:** cada chamada ao script tem `timeoutMs`; excedeu = Worker **encerrado** e recriado na próxima chamada. `memoryMiB` estourado (medido pelo Worker/host quando disponível, e por tamanho de mensagens) = idem. Três falhas em 60 s (60000 ms) = `failed` e desativação automática com aviso.
4. **Falha:** erro de um suplemento **nunca** propaga ao editor: exceção do script vira entrada de log e aviso, a contribuição do suplemento é retirada, o app segue. Na abertura do app e do projeto, cada suplemento carrega **dentro de try/catch e fora do caminho crítico** (depois da primeira pintura); manifesto inválido ou pacote corrompido = `failed` e o app abre normalmente.
5. **Desativar:** remove contribuições, encerra Worker/conexão, **mantém** o espaço de dados e as concessões. **Desinstalar:** remove o pacote e as concessões; o espaço de dados no projeto **permanece** até o usuário pedir "limpar dados do suplemento".
6. **Log por suplemento:** anel de 500 entradas por suplemento (nível, hora, texto até 500 caracteres), visível no gerenciador; nunca grava dados do modelo.
7. **Atualização:** nova `version` com mesmo `id` substitui o pacote; se pediu **mais** permissões, volta a `needs-grant` só para as novas.

## 8. Formato `.hestiapkg`
Arquivo **zip** (método store ou deflate), extensão `.hestiapkg`, tipo `application/zip`. EXISTE só o **escritor** zip (`packages/io/src/zip.ts`, `ZipFile`, store); o **leitor** é PROPOSTO (`packages/io/src/zipRead.ts`, com inflate e proteção contra zip bomb).
```
meu-suplemento.hestiapkg
├── manifest.json        (obrigatório, na raiz, UTF-8, até 256 KiB)
├── main.js              (runtime script; o `entry`)
├── data/*.json          (declarativo: famílias, materiais, tabelas)
├── icons/*.svg          (opcional)
└── README.md            (opcional, mostrado ao instalar)
```
Limites: até 200 arquivos, 16 MiB descompactado no total, 8 MiB por arquivo, razão de compressão até 100:1; caminhos relativos com `/`, sem `..`, sem `/` inicial, sem links, sem nomes reservados. Tipos aceitos: `.json`, `.js`, `.mjs`, `.svg`, `.png`, `.md`, `.txt`. Sem binários executáveis (`.exe`, `.dll`, `.so`, `.wasm` fica **recusado** nesta fase). Assinatura e loja: não-objetivo. Em desenvolvimento: uma pasta com `manifest.json`, lida no desktop (Tauri, a ser feito em módulo novo `desktop/src-tauri/src/suplementos.rs`, no mesmo estilo de `biblioteca.rs`: raiz escolhida pelo usuário, nome como um único segmento) e, no navegador, por seletor de pasta/arquivo.

## 9. Exemplos
### 9.1 `manifest.json` declarativo (norma e verificação, sem código)
```json
{
  "manifestVersion": 2,
  "id": "dev.exemplo.norma-corrimao",
  "name": "Verificação de corrimão",
  "version": "1.0.0",
  "hestiaApi": "2.0",
  "runtime": "declarative",
  "description": "Avisa quando a altura do guarda-corpo é menor que 1,05 m.",
  "capabilities": ["model.read", "checks.run", "ui.commands", "content.schedules"],
  "contributes": {
    "checks": [{
      "id": "altura-minima", "title": "Altura mínima do guarda-corpo",
      "severity": "warning", "applyTo": "guardaCorpo",
      "rule": "height >= 1.05",
      "message": { "pt": "Guarda-corpo com {height} m; mínimo 1,05 m.", "en": "Railing at {height} m; minimum 1.05 m." }
    }],
    "schedules": [{
      "id": "gc-resumo", "title": "Guarda-corpos por nível", "source": "guardaCorpo",
      "groupBy": ["levelName"],
      "columns": [
        { "key": "levelName", "title": "Nível", "expr": "levelName" },
        { "key": "len", "title": "Comprimento", "expr": "length", "unit": "m", "total": "sum" }
      ]
    }]
  }
}
```
(Campos como `height` e `length` são os do elemento; a lista de campos consultáveis por tipo será definida na Fase E, tabelas geradas a partir dos tipos de `packages/model/src/types.ts`.)

### 9.2 `manifest.json` de script (ferramenta que desenha)
```json
{
  "manifestVersion": 2,
  "id": "dev.exemplo.grade-de-pilares",
  "name": "Grade de pilares",
  "version": "0.3.1",
  "hestiaApi": "2.0",
  "runtime": "script",
  "entry": "main.js",
  "capabilities": ["model.read", "model.write", "ui.commands", "ui.ribbon", "ui.dialogs"],
  "limits": { "timeoutMs": 3000, "memoryMiB": 64, "maxCommandsPerAction": 2000 },
  "contributes": {
    "dialogs": [{
      "id": "params", "title": "Grade de pilares",
      "fields": [
        { "key": "nx", "label": "Colunas", "type": "number", "default": 4, "min": 1, "max": 50 },
        { "key": "ny", "label": "Linhas", "type": "number", "default": 3, "min": 1, "max": 50 },
        { "key": "vao", "label": "Vão", "type": "length", "default": 4.0, "min": 0.5, "max": 20 }
      ],
      "actions": [{ "id": "gerar", "label": "Gerar", "run": { "type": "handler", "ref": "gerar" } }]
    }],
    "commands": [{ "id": "abrir", "title": "Grade de pilares...", "run": { "type": "dialog", "ref": "params" } }],
    "ribbon": { "panels": [{ "id": "p1", "title": "Estrutura", "items": [{ "command": "abrir", "size": "large" }] }] }
  }
}
```

### 9.3 `main.js` (script)
O script roda num Worker sem DOM, sem `fetch`, sem `importScripts` externo. Recebe um `ctx` só com as portas concedidas (PROPOSTO):
```js
// Exporta handlers pelo nome usado em `ref`.
export async function gerar(ctx, valores) {
  const nx = Math.floor(valores.nx), ny = Math.floor(valores.ny), vao = valores.vao; // vao em metro
  const nivel = ctx.model.read().levels[0];                 // model.read (cópia imutável)
  if (!nivel) { ctx.log.warn('Projeto sem nível.'); return; }
  const comandos = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    comandos.push({
      type: 'addGeneric',                                    // comando real de packages/model (commands.ts)
      generic: { id: ctx.model.newId('gen'), levelId: nivel.id, name: `Pilar ${i + 1}-${j + 1}`,
                 /* ...demais campos do tipo Generic... */ },
    });
  }
  // Um único passo de desfazer; atômico; validado pelo host.
  const r = ctx.model.apply('Grade de pilares', comandos);   // model.write
  if (!r.ok) ctx.log.error(`Comando ${r.index} recusado: ${r.error}`);
  else ctx.data.set('ultimaGrade', { nx, ny, vao });         // plugindata.rw (não pedida acima: seria recusada)
}
```
Nota: o exemplo grava em `ctx.data`, que exige `plugindata.rw`; como o manifesto 9.2 não a pede, a chamada falharia com `permission_denied` (de propósito: mostra o menor privilégio). O formato exato de `Generic` deve ser conferido em `packages/model/src/types.ts` na Fase C.

### 9.4 "IA desenha" (external ou script)
Fluxo: o usuário digita um pedido; o suplemento envia o contexto mínimo (por `model.read`) ao seu serviço de IA; a IA devolve `commands[]` (JSON de `Command`); o suplemento chama `ctx.model.apply('IA: <pedido>', commands)` com `preview: true`; o host valida, aplica em transação, mostra, e o usuário confirma ou cancela. Comandos inválidos recusam o lote (resposta devolve `index` e `error` para a IA tentar de novo). A chave da IA é do usuário e nunca entra no `.hestiapkg` nem no projeto.

## 10. Mapa: pacotes do repositório e pontos que tocam
| Pacote / pasta | Papel | Pontos |
|---|---|---|
| `packages/plugin-api/src` | manifesto 2.0, permissões, portas, registro de contribuições, protocolo 1.1 | todos |
| `packages/model/src` | `pluginData.ts` (dados, comandos `setPluginData`), `pluginCommands.ts` (lista branca), `commands.ts` (união `Command`), `history.ts` (`transaction`, EXISTE), `validate.ts` | escrita, dados, checks |
| `packages/io/src` | leitor zip (`zipRead.ts`), contrato de importador/exportador | `.hestiapkg`, `importers`, `exporters` |
| `packages/tools/src` | ponte de ferramenta de plugin (captura, prévia) | `tools` |
| `apps/web/src/plugins` | `appPorts.ts` (EXISTE), `appModelPort.ts`, carregador, Worker, registro | todos |
| `apps/web/src/ui/ribbon` | `tabsSoon.ts`, `actions.ts`, `model.ts`, `commandSearch.ts` | `commands`, `ribbon` |
| `apps/web/src/ui` e `editor/state.ts`, `App.tsx` | diálogos e painéis de plugin, `DialogKind` | `dialogs`, `panels`, `schedules`, `checks` |
| `desktop/src-tauri/src` | `suplementos.rs` (pasta/arquivos), token no cofre; `biblioteca.rs` é o modelo | instalar, external |
| `crates/hestia-renderer` | só segue `hello` 1.x/1.1; sem mudança de API | external |

## 11. Divisão de trabalho em fases
Regra anti-conflito: cada fase é **dona** dos arquivos listados e só **acrescenta** nos arquivos compartilhados abaixo, numa linha/bloco marcado `// SUPLEMENTOS:`; os compartilhados são `packages/plugin-api/src/index.ts` (só linhas `export *`), `packages/model/src/commands.ts` (só a união `Command`; dona: C), `apps/web/src/editor/state.ts` (só `DialogKind`; dona: B) e `apps/web/src/App.tsx` (só um `case`; dona: B). Ordem: B antes de C e D; C e D em paralelo depois de B; E, F, G, H em paralelo depois de C e D; I por último.

| Fase | Objetivo | Arquivos (novos, salvo indicação) |
|---|---|---|
| **B. Registro e UI** | manifesto 2.0, validador que aceita 1.x, permissões novas, registro de contribuições e gerenciador, botões na aba Suplementos, busca de comandos | `packages/plugin-api/src/manifestV2.ts`, `registry.ts`, `permissions.ts` (acréscimo), `manifest.ts` (só chamar o novo validador, sem mudar o atual), testes `manifestV2.test.ts`; `apps/web/src/plugins/registry.ts`, `pluginUi.tsx`; edita `ui/ribbon/tabsSoon.ts`, `actions.ts`, `model.ts`, `commandSearch.ts`, `editor/state.ts`, `App.tsx`; roda os 11 testes de integração |
| **C. API de escrita** | `ModelPort`, lista branca, atomicidade e um passo de desfazer, espaço de dados | `packages/model/src/pluginCommands.ts`, `pluginData.ts` (acréscimo), `commands.ts` (união), testes; `packages/plugin-api/src/modelPort.ts`, `hostPorts.ts` (acréscimo); `apps/web/src/plugins/appModelPort.ts` |
| **D. Carregador e runtime** | leitor `.hestiapkg`, instalação, runtime declarativo, Worker de script, limites, log, falha isolada | `packages/io/src/zipRead.ts`, `pkg.ts`; `packages/plugin-api/src/scriptHost.ts`, `scriptWorker.ts`, `limits.ts`; `apps/web/src/plugins/loader.ts`, `installer.ts`, `pluginLog.ts`; `desktop/src-tauri/src/suplementos.rs` (+ registro em `main.rs`/`lib.rs`) |
| **E. Checks e quantitativos** | `checks`, `schedules`, linguagem de expressão | `packages/model/src/pluginExpr.ts` (avaliador JSONLogic restrito), `pluginChecks.ts`, `pluginSchedules.ts`; `apps/web/src/ui/PluginSchedule.tsx`, integração no painel de problemas (`IssuesButton.tsx`) |
| **F. Importar e exportar** | `importers`, `exporters`, entrega de arquivo | `packages/io/src/pluginIo.ts`; `apps/web/src/plugins/ioBridge.ts`; menu de Arquivo (`FileMenu.tsx`, só acréscimo) |
| **G. Famílias e materiais** | `families`, `materials`, carregar como tipos do projeto | `packages/model/src/pluginContent.ts`; `apps/web/src/plugins/contentBridge.ts`; catálogos (só acréscimo em `catalogoAberturas*.ts` e `Project.materials` via comando existente) |
| **H. Ferramentas e diálogos** | `tools` interativas, `dialogs`/`panels` declarativos completos | `packages/tools/src/pluginTool.ts`; `apps/web/src/plugins/toolBridge.ts`; `ui/PluginDialog.tsx`, `PluginPanel.tsx` |
| **I. IA e processo externo** | prévia confirmável, token de pareamento obrigatório ([07](07-pareamento-por-token.md)), protocolo 1.1, endurecimento | `packages/plugin-api/src/protocol.ts` (acréscimo de `auth`), `hostSession.ts`, `pluginHost.ts`; `apps/web/src/plugins/aiPreview.ts`; `crates/hestia-renderer` (token); `desktop/src-tauri/src` (cofre) |

Critérios de pronto, comuns: testes de unidade da fase, **os 11 casos de integração e `plugins.test.ts` verdes sem edição**, nenhuma importação de store/React em `plugin-api`, nenhum caminho de escrita fora de `Command`.

## 12. Decisões do dono (fechadas)
Token de pareamento obrigatório para todo suplemento de processo externo; pacote sem assinatura aceito com aviso; **`.wasm` recusado no pacote nesta fase** (liberável depois sem quebrar nada); limites da proposta aceitos; script roda no navegador e no desktop; **expressões de `checks` e `schedules` usam JSONLogic restrito, sem linguagem própria nem sintaxe em pt-BR**; prévia da IA sempre obrigatória; log só no gerenciador; suplemento não escolhe a aba (sempre Suplementos); `dataSchema` maior que o instalado deixa o espaço somente leitura; **uma única permissão de escrita, `model.write`** (sem `.elements` e `.types`; dividir depois é compatível); suplemento só adiciona tipos sob `<pluginId>:`.

Pendências menores: extensão do código no zip (`.js` somente?) e tamanho máximo de lote a validar na implementação.
