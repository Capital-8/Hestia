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

## Testes

- `packages/plugin-api/src/plugins.test.ts`, bloco "extensão de renderização (protocolo 1.3)": negociação 1.3 contra 1.2 e 1.1 no mesmo host (o quadro 1.2 não contém nenhuma palavra nova), deltas de luz, `site`, descarte de inválidos, partes e validação de mensagens.
- `apps/web/src/plugins/externalTools.test.ts`: grupos por material, normais, luzes e site.

Rodar: `npx vitest run packages/plugin-api apps/web/src/plugins`.
