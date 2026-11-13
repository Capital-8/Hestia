# Extensão de renderização (protocolo 1.3)

Acrescenta, **de forma aditiva**, o que um renderizador fotorrealista precisa além de geometria e cor: material por triângulo, normais, parâmetros PBR, luzes e localização/sol. API de cena sobe para 1.1; protocolo para 1.3.

## Negociação

Os campos novos só existem numa sessão que negociou **1.3 ou superior**, isto é, quando o plugin anuncia `protocol.max >= 1.3` (e `min <= 1.3`) e o Hestia também. Para 1.0, 1.1 e 1.2 o host remove tudo o que é de 1.3 antes de enviar, e o formato no fio é idêntico ao de antes:

| Item | Sessão 1.0 a 1.2 | Sessão 1.3 |
|---|---|---|
| `mesh.groups[].materialId` | sempre `null` | id do material do grupo, ou `null` se desconhecido |
| `mesh.normals` | ausente | presente quando barato |
| `SceneMaterial.metallic/emissive/ior/transmission` | ausentes | presentes se válidos |
| `snapshot.lights` | ausente | sempre presente (lista, pode ser vazia) |
| `snapshot.site` | ausente | presente quando há algo a informar |
| ops `light.add/update/remove` | nunca saem | saem no delta |

O renderizador Rust de referência anuncia `1.1..1.2`; contra ele o host continua em 1.2 sem mudança alguma.

## Formato JSON

### Malha (`entities[].mesh`)

```json
{
  "positions": [x, y, z, ...],
  "normals":   [nx, ny, nz, ...],
  "indices":   [i, j, k, ...],
  "groups": [
    { "start": 0, "count": 36, "materialId": "mat_reboco" },
    { "start": 36, "count": 60, "materialId": "mat_bloco" }
  ],
  "hash": "9ac1f2:1204"
}
```

- `groups[].start/count` são posições na lista `indices` (não em triângulos); cada grupo é um material. Uma parede de várias camadas sai com um grupo por material de camada. Sem material conhecido: `materialId: null`.
- `normals` tem **exatamente** o tamanho de `positions` (3 floats por vértice), em coordenadas de mundo, normalizadas. Vêm da própria geometria da GPU do Hestia: suaves em curvas, vivas em arestas (vértices duplicados). É opcional: ausente quando algum pedaço do elemento não tem normais ou quando passa de 2.000.000 de floats por entidade (`NORMALS_MAX_FLOATS`); o plugin recalcula.
- O `hash` passa a cobrir normais e material dos grupos, então uma troca de material invalida o que o plugin guardou.

### Material (`materials[]`)

```json
{ "id": "m", "name": "Aço", "color": "#aabbcc", "gloss": 0.7, "opacity": 1,
  "metallic": 0.9,
  "emissive": { "color": "#ff8800", "intensity": 2.0 },
  "ior": 1.5,
  "transmission": 0.4 }
```

Todos opcionais. `metallic` e `transmission` em 0..1; `ior` em 1..3; `emissive.color` em `#rrggbb` e `emissive.intensity >= 0`. Ausente = o renderizador usa a conversão padrão.

### Luz (`snapshot.lights[]`)

```json
{ "id": "light:abc", "kind": "point", "position": {"x":1,"y":2,"z":3},
  "color": "#ffffff", "intensity": 800 }
{ "id": "l2", "kind": "spot", "position": {"x":0,"y":0,"z":3}, "direction": {"x":0,"y":0,"z":-1},
  "color": "#ffeedd", "intensity": 1500, "range": 12, "innerAngle": 0.3, "outerAngle": 0.6 }
```

`kind` é `point`, `spot` ou `area`. `intensity` em candela. Ângulos em radiano, `innerAngle <= outerAngle <= PI`. `direction` (não nula) é obrigatória no `spot`. `range` > 0, em metros. Posições em metros, Z para cima (como o resto da cena).

Delta: `{"op":"light.add","light":{...}}`, `{"op":"light.update","light":{...}}`, `{"op":"light.remove","id":"..."}`.

### Localização (`snapshot.site`)

```json
{ "latitude": -23.55, "longitude": -46.63, "northAngle": 0.0, "timezone": "America/Sao_Paulo",
  "sun": { "azimuth": 0.78, "elevation": 0.9 } }
```

Todos os campos são opcionais. `latitude` -90..90, `longitude` -180..180 (graus), `northAngle` em radiano (anti-horário visto de cima, a partir de +Y), `timezone` em nome IANA. `sun.azimuth` em radiano a partir de +X (leste), anti-horário; `sun.elevation` em radiano acima do horizonte; a direção ao sol é `(cos e cos a, cos e sin a, sin e)`. Não há operação de delta para o `site`: quando ele muda, o host manda um novo snapshot (nova revisão).

## Validação

- **Host (envio)**: campo inválido é descartado sem derrubar a cena (PBR inválido sai do material, luz inválida sai da lista, site inválido perde só o campo ruim, normais de tamanho errado saem da malha).
- **Plugin/Hestia (recebimento)**: `validateMessage` recusa quadro com campo de 1.3 malformado (snapshot, partes e deltas). Implementação em `packages/plugin-api/src/sceneValidate.ts`; filtragem por versão em `sceneForProtocol.ts`.
- O snapshot em partes (1.2) leva `lights` e `site` no cabeçalho `scene.snapshot.begin`.

## O que o Hestia extrai hoje (`apps/web/src/plugins/sceneExport.ts`)

- **Material por grupo**: cada lote da GPU é de um material só (`userData.materialId`); as faixas de cada elemento são agrupadas por esse material. Camadas de parede, piso, laje, forro, telhado e escada saem separadas.
- **Normais**: copiadas do atributo `normal` da geometria, giradas pela matriz normal do mundo.
- **Luzes**: o modelo nativo **não tem** família de luminária. Só saem luzes de objetos importados do IFC com classe `IfcLightFixture`: luz pontual no centro da caixa da malha, cor branca, intensidade da propriedade `LuminousIntensity` quando existe, senão 800 cd (`CANDELA_PADRAO`). **Num modelo sem luminárias importadas, `lights` é `[]`** (o contrato existe; a extração é vazia).
- **Site**: o modelo guarda apenas azimute e elevação do sol da vista 3D (graus), convertidos para radiano em `site.sun`. Latitude, longitude, norte e fuso **não existem** nas configurações do projeto e não são enviados.
- **PBR**: o modelo de material do Hestia não tem metalicidade, emissão, IOR nem transmissão. `metallic`, `transmission` e `ior` são derivados da categoria (seção abaixo); `emissive` não é preenchido.

## Categoria do material, PBR derivado e UVs

### `SceneMaterial.category` (1.3)

```json
{ "id": "mat_reboco", "name": "Reboco", "color": "#d9d2c5", "gloss": 0.1, "opacity": 1, "category": "plaster" }
```

Opcional. Texto minúsculo, 1 a 32 caracteres (`[a-z0-9_-]`); campo ausente = sem categoria. Valor desconhecido é válido no contrato e ignorado pelo renderizador. Valores que o renderizador conhece: `wood`, `metal`, `glass`, `ceramic`, `concrete`, `plaster`, `paint`, `brick`, `stone`, `roof_tile`, `fabric`, `leather`, `grass`, `soil`, `asphalt`, `plastic`, `other`. Vai no snapshot, nas partes do snapshot e em `material.add/update`; **não existe** em sessões 1.0 a 1.2 (o host remove o campo, testado, inclusive no fio).

Origem: (1) `Material.category`, escolhido no diálogo de materiais (padrão "Sem categoria"); (2) senão, a tabela do catálogo (`CATEGORIA_CATALOGO` em `sceneExport.ts`):

| Categoria | Ids |
|---|---|
| `metal` | `mat_aco`, `mat_aluminio`, `mat_perfil`, `mat_telha_metalica` |
| `plaster` | `mat_argamassa`, `mat_gesso`, `mat_reboco` |
| `brick` | `mat_bloco9`, `mat_bloco14`, `mat_bloco19` (bloco cerâmico, cor de terracota) |
| `ceramic` | `mat_ceramica` |
| `concrete` | `mat_concreto` |
| `wood` | `mat_madeira` |
| `plastic` | `mat_pvc` |
| `roof_tile` | `mat_telha_ceramica` |
| `paint` | `mat_tinta` |
| `glass` | `mat_vidro` |
| `other` | `mat_fibrocimento`, `mat_la` |

A categoria do usuário tem prioridade; categoria fora do formato é ignorada e cai na tabela. Material de nome livre e sem categoria sai sem o campo.

**Modelo persistido**: `Material.category?: string` é opcional e aditivo, sem mudar `SCHEMA_VERSION`; projetos antigos abrem iguais. O seletor mostra os identificadores das categorias (são do contrato, como as unidades) e traduz só o rótulo e "Sem categoria".

### PBR derivado da categoria (só 1.3)

| Categoria | Campos enviados |
|---|---|
| `metal` | `"metallic": 1` |
| `glass` | `"transmission": 0.9, "ior": 1.5` |
| demais | nenhum |

### `mesh.uvs` (1.3)

`"uvs": [u, v, u, v, ...]`, 2 números por vértice (`uvs.length == positions.length / 3 * 2`), em **metros de mundo**, por projeção em caixa: eixo da maior componente (valor absoluto) da normal do vértice; X dominante → `(y, z)`, Y → `(x, z)`, Z → `(x, y)`. Só sai quando a entidade tem normais e até 600.000 vértices (`UVS_MAX_VERTICES`); acima disso é omitido, e o host ainda descarta UVs acima de 1.400.000 números. Ausente em 1.0 a 1.2.

## Projeto padrão "Casa de Alto Padrão" para o renderizador

Template `house-premium`, pronto sem ajuste manual (teste: `apps/web/src/plugins/casaAltoPadrao.render.test.ts`, monta a cena 3D de verdade com `ModelScene`):

- **Materiais**: 19, todos com `category` válida (catálogo) e PBR derivado em metal e vidro. Nenhum grupo de malha sem material (variantes internas `mat_x#testeira` saem como `mat_x`).
- **Malhas**: 100% das entidades com geometria enviam normais e `uvs` (antes só 2 de 23). Paredes e esquadrias são instanciadas na tela e só têm caixa de picking: a caixa agora leva `userData.materialId` (`caixasDoNivel3d.ts`) e o exportador deriva normais dos triângulos quando falta o atributo `normal`. Maior entidade bem abaixo de 8 MiB, então o snapshot em partes (1.2) cabe sem divisão de entidade. Só os 6 vãos livres (porta sem folha) ficam sem malha, por não terem geometria.
- **Local e sol**: novo `Project.render` (opcional, aditivo, sem mudar `SCHEMA_VERSION`; comando `setRenderSetup`, `packages/model/src/renderSetup.ts`) com latitude, longitude, norte, fuso e luzes. O template usa São Paulo (-23,5505; -46,6333; `America/Sao_Paulo`), 15/12/2026 08:45; azimute e elevação do sol da vista 3D são calculados desses dados (`sunPosition`, aproximação NOAA, erro de ~1 grau). `site` passa a levar latitude, longitude, norte e fuso.
- **Câmera inicial**: ponto de vista salvo "Fachada principal" (sudeste, 30 m, 17 graus). Sem vista 3D aberta, `cameraPort.read` usa o primeiro ponto de vista do projeto.
- **Luzes**: 27 luzes pontuais declaradas em `Project.render.lights` (23 internas a 2,6 m e 5,6 m, 4 arandelas externas), 50 a 200 cd (lâmpada residencial de 600 a 2.500 lm), cor quente. Saem em `snapshot.lights` com id `render:<id>`.
- **Medido ponta a ponta** com o renderizador real (`--screenshot`, Vite na porta 5190, token pareado, estado `connected`): imagem `renders/casa-alto-padrao-02.png`.

## Testes

- `packages/plugin-api/src/plugins.test.ts`, bloco "extensão de renderização (protocolo 1.3)": negociação 1.3 contra 1.2 e 1.1 no mesmo host (o quadro 1.2 não contém nenhuma palavra nova), deltas de luz, `site`, descarte de inválidos, partes e validação de mensagens.
- `apps/web/src/plugins/externalTools.test.ts`: grupos por material, normais, luzes e site.

Rodar: `npx vitest run packages/plugin-api apps/web/src/plugins`.

## Móveis importados (`kind: 'furniture'`) para o renderizador

Implementação: `apps/web/src/plugins/furnitureScene.ts` (testes: `furnitureScene.test.ts`). Compatível com o renderizador de hoje (malha própria por entidade, protocolo até 1.3) e preparada para a 1.4 (`meshDefs/meshRef`, texturas embutidas).

- **Fonte**: o MODELO (`Project.furniture` + instâncias `Furniture`), não a cena three. `buildSceneContent` ignora elementos `furniture` da cena 3D e acrescenta `furnitureEntities(project)`. Sempre a malha COMPLETA (a versão leve é só da vista).
- **Geometria**: metros, Z para cima, espaço de mundo. Posições por `furniturePartWorldTransform` (nível + instância + peça); normais pela inversa transposta (cofatores) e renormalizadas; com `mat4Det3 < 0` (espelhada, inclusive peça espelhada do `.skp`) a ordem dos triângulos é invertida. Posições arredondadas a 1e-6 m, normais e UVs a 1e-5 (reduz o JSON).
- **UVs em metros**: `uv_m = uv_repeticoes * sizeM` por material; sem `sizeM` (ou sem UVs na definição), projeção em caixa em metros de mundo, como o resto da cena. Vértice usado por materiais diferentes é duplicado.
- **Faces de dois lados (`groups[].doubleSided`, aditivo, 1.3+)**: a vista 3D e o raster do renderizador descartam as faces de costas. Um grupo `doubleSided: true` pede as duas faces (sem o descarte); sem o campo vale um lado só. Vem do arquivo: `.skp` (frente e verso do mesmo material, que o OpenSKP marca `doubleSided`), glTF (`material.doubleSided`) e, em obj/dae/fbx (que não dizem), da análise da malha (`packages/io/src/furniture/orientation.ts`: só os componentes fechados e voltados para fora ficam de um lado). Sem isto as faces com a frente voltada para dentro sumiam conforme o ângulo (medido nos blocos reais: de 0 a 45% dos pixels de uma vista). O path tracer já é de duas faces. Protocolo 1.0 a 1.2: o campo não sai.
- **Material por triângulo**: `groups[].materialId` = material do projeto; `materialIds` da entidade lista os usados. Materiais saem em `materials[]` como os demais (`category`, cor, `gloss`, PBR derivado de metal e vidro); opacidade 0 de material de móvel (alfa 0 do `.skp`) sai 1.
- **Divisão**: cada entidade fica com no máximo ~7 MiB de JSON (estimativa conservadora por vértice e por índice; real medido 4 a 6 MiB) e dentro de `NORMALS_MAX_FLOATS`/`UVS_MAX_FLOATS`. Materiais pequenos ficam juntos numa entidade (um grupo cada); acima do teto divide por material e depois por blocos de triângulos. Ids: `<id>` quando cabe numa entidade, senão `<id>#1`, `<id>#2`... Nunca se parte uma entidade entre partes do snapshot (regra do repo).
- **Deltas**: mover/girar/escalar/espelhar gera `entity.update` só da instância (o hash da malha muda), adicionar `entity.add`, excluir `entity.remove`, cor de material `material.update`. Cache por objeto do asset e pose: ler a cena de novo não refaz malhas que não mudaram.
- **Orçamento**: `furnitureBudget(project)` (pura) soma os triângulos enviados (cada cópia repete a malha; peças do bloco contam). Acima de 2 milhões (`TRIANGULOS_AVISO`) devolve nível `aviso`; acima de 7 milhões (`TRIANGULOS_CRITICO`), `critico` recomendando modo leve ou menos cópias. A exportação registra o último resultado (`ultimoOrcamentoMoveis()`, `aoMudarOrcamentoMoveis(cb)`) para a interface mostrar `messages`; a interface ainda precisa ler isso.
- **Texturas embutidas**: NÃO são enviadas (`textures: []`, `FURNITURE_TEXTURES_ENABLED = false`). `furnitureTexturesFor(project)` já devolve `{ hash (SHA-256), mime, bytes, width, height, size_m, materialIds }` sem repetir, respeitando `useEmbeddedTexture`; a Fase 2 (1.4) liga isso.
- **Custo conhecido**: sem `meshRef`, 20 cópias de um sofá de 90 mil triângulos viram 80 entidades e ~390 MiB de JSON. É o que a 1.4 (instâncias) elimina.
