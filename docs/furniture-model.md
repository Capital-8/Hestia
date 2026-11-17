# Modelo de moveis importados (`furniture`)

Estado: so o MODELO de dados e comandos (`packages/model/src/furniture/`). UI, 3D e plugin ficam para outras frentes.
Contrato do renderizador: `docs/plugins/09-extensao-render.md` e o contrato 1.4 (texturas embutidas, instancias).

## Resumo
- `Project.furniture?: { assets: Record<Id, FurnitureAsset> }`: opcional, **sem bump de `SCHEMA_VERSION`** (precedente:
  `Project.render`). Projeto antigo nao tem o campo e abre igual; o `migrate.ts` so documenta que nao ha migracao.
- Elemento `Furniture` (`kind: 'furniture'`) na uniao `Element`: `assetId, levelId, x, y, z, rotation (rad, eixo Z),
  scale (uniforme), mirrored, name, quality? ('leve' | 'completo', so da vista), order`.
- N instancias do mesmo asset **nao copiam malha**: o asset e unico, cada instancia e um elemento pequeno.

## Asset
`FurnitureAsset = { id, name, sourceFileName (so o nome), sourceFormat, contentHash, defs, materials, textures, bbox, stats }`.
- `defs[]`: `{ id, name, positions, normals, uvs, indices, vertexCount, indexCount, groups[{start,count,materialIndex,doubleSided?}] }` (`doubleSided`: desenhar as duas faces do grupo; ausente = um lado),
  metros, Z para cima, espaco local da definicao. UVs em repeticoes da textura (como no `ImportedModel` do importador).
- `materials[]`: `{ id (Material do projeto), name, color #rrggbb, opacity, category, metallic?, roughness?, transmission?,
  textureIndex?, sizeM?, useEmbeddedTexture (padrao true) }`. `addFurnitureAsset` cria tambem os `Material` do projeto
  (com `category`); `deleteFurnitureAsset` os remove.
- `textures[]`: `{ fileName, mime, bytes, sha256 (hex minusculo), width?, height?, byteLength }`. Nunca caminho.
- Tipos proprios compativeis com `ImportedModel` (packages/io): o modelo nao importa de `io` (regra de fronteira).
  `buildFurnitureAsset(input)` aceita a forma estrutural do `ImportedModel` (Float32Array/Uint32Array/Uint8Array) e
  devolve o asset ja em base64; as definicoes `instances` do importador nao entram (instancias sao elementos).

## Persistencia
Decisao: os arrays **vivem no projeto como texto base64 little-endian** (Float32/Uint32/bytes), nao como arrays tipados.
Assim `JSON.stringify(project)`, `structuredClone`, immer (desfazer) e comandos serializaveis funcionam sem gancho de
salvamento nem de abertura; `migrateProject(JSON.parse(texto))` devolve exatamente o mesmo (testado, byte a byte).
- Leitura tipada: `furnitureDefArrays(def)` (cache por objeto), `furnitureTextureBytes(tex)`.
- Teto por asset: **aviso acima de 40 MB** (`furnitureAssetWarnings`), recusa acima de 128 MB, por definicao aviso
  acima de 300 mil vertices e recusa acima de 600 mil, textura ate 8 MiB (limites do contrato 1.4: `FURNITURE_LIMITS`).
- `furniturePersistReport(project)` confere tamanho total e que nao ha caminho absoluto em nomes.
- Custo: base64 deixa o JSON ~33% maior que os bytes crus; compactar o arquivo de projeto e uma otimizacao futura.

## Comandos (desfazer/refazer, rotulos PT/EN)
`addFurnitureAsset`, `addFurniture`, `updateFurniture` (x, y, z, rotation, scale, mirrored, name, quality, levelId),
`deleteFurniture`, `deleteFurnitureAsset` (recusa se ha instancia), `setFurnitureMaterial` (categoria, cor,
`useEmbeddedTexture`; atualiza o asset e o `Material` do projeto). Rotulos: `labelOf(cmd, lang)` (PT padrao, EN).
Validam: ids, nivel, asset existente, escala > 0, valores finitos, asset coerente (`furnitureAssetIssue`).

## Funcoes puras
- `furnitureWorldTransform(inst, asset?, levelElevation = 0)`: 4x4 em colunas, metros, Z para cima:
  `T(x, y, z + elevacao) * Rz(rotation) * S(scale) * Espelho(X local)`. Com `mirrored` o determinante e negativo:
  quem desenha inverte a ordem dos vertices dos triangulos.
- `furnitureBounds(inst, asset, levelElevation?)`: caixa alinhada ao mundo (conservadora: 8 cantos da caixa local).
- `assetUsage(project, assetId)`: `{ count, instanceIds, levelIds }`.

## Pontos de colisao com a frente de familias (origin/feat/familias-interface, SCHEMA 24/25)
Cada integracao desta frente e de **uma linha** (ou uma funcao pequena) em arquivo compartilhado:
| Arquivo | O que mudou aqui | Risco no merge |
|---|---|---|
| `types.ts` `Element` | `\| Furniture` no fim da uniao; import de tipo | conflito textual se familias tambem acrescentar ao fim; resolver mantendo os dois |
| `types.ts` `Project` | campo opcional `furniture?` | idem (campos opcionais, sem ordem) |
| `types.ts` `SCHEMA_VERSION` | **nao alterado** (23) | familias sobe para 24/25; nao ha conflito, e este campo e aditivo. Nao exige migracao |
| `commands.ts` `Command` | `\| FurnitureCommand` | conflito textual simples na uniao |
| `commands.ts` `applyCommand` | `\|\| applyFurnitureCommand(p, c, lang)` na cadeia do inicio | conflito de linha se familias editar a mesma cadeia |
| `history.ts` `labelOf` | assinatura `(c, lang = 'pt')` e um `if (isFurnitureCommand(c)) return furnitureLabel(c, lang)` no topo | familias pode tambem acrescentar delegacao; manter as duas |
| `copyLink.ts` `syncOne` | `case 'furniture': return null` (switch exaustivo sobre `Element['kind']`) | qualquer switch exaustivo novo da familias precisa do mesmo caso |
| `migrate.ts` | so comentario (sem migracao) | nenhum; se familias criar migracao 23->24, o campo `furniture` passa intacto |
| `index.ts` | `export * from './furniture/index.ts'` | linha no fim; conflito trivial |
Nomes proprios (`furniture`, `FurnitureAsset`, `FurnitureInstance`->`Furniture`) para nao colidir com `Component`/`Family`.
Tambem verificar: outros `switch` sobre `Element.kind` em `packages/render`, `tools` e `apps/web` (o `tsc` aponta os exaustivos).

### Como unificar depois (instancia de malha como familia)
1. Tratar `FurnitureAsset` como uma **familia de malha**: o tipo da familia aponta para o asset (definicoes + materiais +
   texturas) e a instancia da familia substitui `Furniture` (mesmos campos: nivel, posicao, rotacao, escala, espelho).
2. Migracao unica (24/25 -> proxima): cada `furniture` vira instancia de familia com `meshAssetId = assetId`; `Project.furniture`
   passa a ser o repositorio de malhas da familia, sem mudar o formato dos arrays (base64) nem os hashes.
3. Os comandos `addFurniture/updateFurniture/deleteFurniture` viram aliases dos comandos de instancia de familia; os de
   asset (`add/deleteFurnitureAsset`, `setFurnitureMaterial`) permanecem (sao do repositorio de malhas).
4. A matriz de `furnitureWorldTransform` e a mesma que a familia usaria; o plugin de render ja le `meshDefs/meshRef` (1.4).

## Testes
`packages/model/src/furniture/furniture.test.ts`: base64/sha256, asset, comandos + desfazer/refazer, N instancias
compartilhando o asset, ida e volta do projeto, projeto antigo, transformacao e limites.

## Integração na main, 2026-11-17

**Decisão: opção 2, só o importador, por pull request, sem a pilha de plugins 1.1 a 1.3.**

Medição na branch `import/moveis-sobre-main` (29 commits sobre a main de 2026-11-14, `git diff origin/main...HEAD`): 152 arquivos,
+13.355/-160 linhas. Por área: importador e móveis 118 arquivos (`packages/io/src/furniture`, `packages/model/src/furniture`,
`packages/render/src/model3d/furniture*`, `packages/tools/src/furniture*`, `apps/web/src/editor/furniture`, `ui/Furniture*`,
`ui/dialogs/ImportFurnitureDialog*`, i18n); pilha de plugins 34 arquivos, +3.576 linhas (`packages/plugin-api` 13,
`crates/hestia-renderer` 7, `docs/plugins` 7, `apps/web/src/plugins` 6, `renderSetup.ts`, `templateCasaAltoPadrao.ts`,
teste de integração do renderizador). O merge direto com a main atual dava ~115 arquivos em conflito.

Dependência do importador sobre a pilha (grep de imports): só `ui/FurnitureBudgetChip.tsx` importava `plugins/furnitureScene.ts`
(orçamento da exportação para o renderizador externo) e `sceneExport.ts` chamava `furnitureEntities`. Nenhum arquivo de
`packages/io/src/furniture`, `packages/model/src/furniture`, `packages/render` ou `packages/tools` importa `plugin-api`,
`hestia-renderer` ou `plugins/`. No sentido inverso, a pilha só depende do importador em `plugins/furnitureScene.ts`
(+ teste), que lê `FurnitureAsset` do modelo. Logo o importador funciona sem a pilha.

Branch `import/blocos-limpo` (saída de `origin/main` 670dbe66): 113 arquivos, +9.755/-27 linhas. Traz o importador inteiro; deixa de
fora `packages/plugin-api`, `crates/hestia-renderer`, `docs/plugins`, `apps/web/src/plugins/*`, `renderSetup.ts` (local, sol e
luzes do renderizador), `templateCasaAltoPadrao` (luzes) e `ExternalToolsDialog`/`MaterialsDialog`. `FurnitureBudgetChip` usa só o
orçamento da vista 3D (`furnitureViewBudget`). Consequência: os blocos NÃO são enviados a renderizadores externos até a pilha
de plugins entrar (`furnitureScene.ts` fica na branch de referência, pronto para religar com `meshDefs/meshRef` do 1.4).

Adaptações aos conflitos com a main (tudo aditivo, nada de um lado inteiro): `Element` ganha `Furniture` ao lado de massa, pilar,
viga e sapata; `applyFurnitureCommand` entra na cadeia de `applyCommandBase`; o rótulo de desfazer vai em `historyRotulos.ts`
(que substituiu `labelOf` em `history.ts`); ferramenta `furniture` no registro, atalhos (Revit `MO`; simples `VW`, porque `VM` é
da massa), faixa Inserir > Móveis, painel de propriedades, seleção na planta, `espaço` gira o móvel em colocação; `Material.category`.

Correção descoberta na integração: o Worker de importação usava `import()` dinâmico, e o `vite build` (app de arquivo único,
Worker em IIFE) falhava com "UMD and IIFE output formats are not supported for code-splitting builds". Os leitores agora são
importados estaticamente em `importWorker.ts`. A branch antiga nunca tinha sido construída para produção.

**SCHEMA_VERSION: continua 28 (sem mudança).** `Project.furniture` e os elementos `kind: 'furniture'` são campos opcionais e
aditivos; projeto v28 abre igual e sem migração (teste com valor literal em `furniture.test.ts`; ida e volta em `saveOpen.test.ts`).
Se o terreno (que usa 29) entrar antes ou depois, não há renumeração a fazer por causa deste importador.

Provas (clone limpo, `importador-limpo`): `tsc` limpo; vitest por pasta verde: model 1.374, io 502 (16 puladas), render 2.158, tools
2.703, editor 1.261, ui 1.104, plugins 127; e2e `tests/e2e/importar-bloco.mjs` (9 passos), `multitelas.mjs` (18 passos) e
`massa.mjs` (sem falhas).

Instâncias em massa (e2e, Chrome com SwiftShader, `?perf=1`): 200 instâncias do mesmo bloco de 2.046 triângulos = 409.200 triângulos
no orçamento da vista; o quadro desenhado tem 417.494 triângulos e 26 chamadas de desenho (24 sem móveis: o bloco é instanciado, 2
chamadas a mais), CPU de ~2 ms por quadro; criar as 200 instâncias leva ~0,4 s e salvar o projeto (268 KB) ~5 ms. Aviso de orçamento
a partir de 2 milhões de triângulos (`AVISO_TRIANGULOS_MOVEIS`); com a versão leve o limite prático medido não foi atingido.
