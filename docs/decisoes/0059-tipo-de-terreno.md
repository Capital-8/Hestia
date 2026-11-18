# Decisão 0059 — Tipo de terreno (solo e superfície separados, "Editar tipo", rótulo automático das curvas)

Data: 2026-11-18. Estado: implementada na branch `feat/terreno-tipo` (sem push). Complementa a 0058 (terreno e lote).

## 1. O que muda no contrato do elemento `terrain`

- **Novo campo opcional `Terrain.tipoId`** (`Id`): tipo de terreno em `ProjectSettings.terrainTypes`. Ausente = comportamento anterior, campo por campo.
- **Novo tipo `TerrainType`** (`packages/model/src/terrainTipo.ts`), lista em `ProjectSettings.terrainTypes` (ausente = padrões em código, `TERRAIN_TYPES_DEFAULT`) e `defaultTerrainTypeId`. Mesmo molde das famílias de anotação e de `terrainTextFamilies`.
- Campos do tipo: superfície (`superficieMaterialId` / `superficieColor`), **solo** (`soloMaterialId` / `soloColor`), `intervaloCurvas`, `mestraCada`, `curvaCor`, `curvaPeso`, `mestraPeso`, `rotuloFamilyId` (uma `TerrainTextFamily` de `contour`: fonte, altura em mm de papel, unidade, casas decimais, cor, prefixo, negrito, itálico), `rotularCurvas` e `rotularCada`.
- **Comandos:** `upsertTerrainType`, `removeTerrainType`; `updateTerrain` aceita `tipoId` (`null` remove). Validação: equidistância >= 0,05 m; mestra e `rotularCada` inteiros de 1 a 100. Tudo dentro do desfazer do `ProjectStore`.

## 2. Regras

- **Com tipo, o tipo vale** sobre os campos próprios do terreno: equidistância e mestra (também no kernel: `kernelTerreno` usa `terrenoComTipo`), material/cor da superfície e família do rótulo. Os campos próprios continuam gravados no terreno e voltam se o tipo for tirado (ou apagado). **Sem tipo, nada muda.** Editar o tipo vale para todos os terrenos que o usam.
- **Solo** = material/cor das partes `saia` e `base` da malha 3D e do **corpo cortado** do terreno no corte e na elevação (`section/terreno.ts`; antes era a cor da superfície, `#b5a27a`). Tipo sem solo definido, ou terreno sem tipo: o solo usa a aparência da superfície (desenho de antes). A cor da categoria `site` (`paint.color`) continua mandando sobre tudo nas seções.
- Região (`terrainRegion`) continua mandando na superfície da própria região; o solo não é por região.
- **Curvas em planta:** com tipo, cor = `curvaCor` (senão a cor padrão de curva, não o verde da superfície); peso = peso de projeção x `curvaPeso` (normais) e x `mestraPeso` (mestras). Sem tipo, `FATOR_MESTRA` 1,6 como antes.

## 3. Rótulo automático (`rotularCurvas`)

`rotulosAutomaticosDeCurva` (`packages/render/src/plan/terrenoRotulos.ts`), chamado por `terrenoOps` depois dos rótulos manuais (a ferramenta "Rótulo de curva" e as `linhasRotulo` continuam como eram):

- Só curvas **mestras**; uma de cada `rotularCada` cotas mestras distintas (1 = todas), em ordem crescente de cota.
- Espaçamento de **90 mm de papel** entre rótulos da mesma curva, convertido pela escala da vista: com mais zoom aparecem mais rótulos, com menos zoom, menos (nunca poluem). Curva mais curta que 3 larguras de texto não recebe rótulo.
- Cada rótulo fica num trecho quase reto da curva (até 22 graus entre tangente e corda do texto), alinhado a ela, legível (de -90 a 90 graus). Candidatos deslocados dentro da fatia quando o primeiro é curvo demais ou colide.
- **Sem sobreposição:** disco por rótulo (largura estimada do texto + folga); rejeita colisão com os já postos, inclusive os manuais. Determinístico.
- Texto e estilo vêm da família `contour` do tipo (`textoDaFamilia`: cota exibida com cota zero da localização, unidade, casas, prefixo).

## 4. Esquema e migração

**Sem mudança de `SCHEMA_VERSION` (continua 29).** Os campos são opcionais e aditivos: arquivo antigo abre sem `terrainTypes` nem `tipoId` e desenha igual. Arquivo novo aberto por programa antigo ignora os campos (perde só o tipo; curvas, geometria e campos próprios permanecem). Se o dono preferir que um programa antigo **recuse** arquivo com tipo (como se fez na v29 para o terreno), basta subir para 30 com migração identidade em `migrate.ts`; é uma linha, mas não foi feito para não quebrar a compatibilidade de arquivos.

## 5. Interface

- Propriedades do terreno: grupo "Tipo de terreno" com o seletor de tipo e o botão "Editar tipo" (o mesmo `TypeSelector` de "Rótulo de curva"). Com tipo, as linhas de equidistância, mestra, material, cor e família do rótulo saem do painel (vivem no tipo); "Nenhum" volta aos campos próprios.
- Diálogo `TerrainTypeDialog` (`dialogKind: 'terrainTypes'`), em seções: superfície, solo, curvas, rótulos (liga/desliga, a cada N, família do texto com todos os campos editáveis ali).
- A ferramenta de terreno cria o terreno novo já com o tipo padrão do projeto (`defaultTerrainTypeId`, senão o primeiro: "Terreno padrão (grama sobre solo)", verde em cima e marrom embaixo). Terrenos já existentes e importados não ganham tipo sozinhos.
- Textos nos sete idiomas (`terreno-tipo.ts`).

## 6. Fora desta entrega / para decidir

- Rótulo automático **não** evita cruzar curvas vizinhas em declives fortes (só vê outros rótulos); não há máscara/halo atrás do texto.
- Solo **não** é por região; sem camadas de solo (horizontes) no corte.
- Elevações com a vista inteira do terreno usam o solo no corpo cortado; a silhueta e o perfil existente são só linha.
- Validação visual no navegador (3D e corte reais) e testes com o kernel Rust (`*.wasm.test.ts`) não foram rodados.
