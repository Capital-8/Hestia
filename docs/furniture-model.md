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
- `defs[]`: `{ id, name, positions, normals, uvs, indices, vertexCount, indexCount, groups[{start,count,materialIndex}] }`,
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
