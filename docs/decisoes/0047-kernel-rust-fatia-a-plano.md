# Decisão 0047 — Fatia A (paredes de um pavimento): plano e fronteira

Aceito pelo dono em 2026-11-02 (fronteira da seção 2 aprovada). Estende a [0046](0046-kernel-rust-abi-v2.md).
Alvo: `resolveLevel(p, levelId)` (`packages/engine/src/resolve.ts`, 485 linhas) numa chamada, com `ResolvedLevel` de volta.

## 1 — Fecho de dependências (linhas de TS a portar)

`resolve` 485 · `frame` 169 · `joins` 198 · `joinNode` 39 · `joinPair` 150 · `joinTypes` 91 · `joinSides` 204 ·
`junctionIndex` 81 · `junctionPlanar` 139 · `resolveMemo` 98 · `layerGeom` 242 · `wrap` 179 · `clipReturn` 40 ·
`openingCut` 20 · `bandFuse` 69 · `wallZ` 88 · `wallFrameZ` 15 · `geomSig` 9 ≈ **2,3 mil linhas de TS**, mais as
funções do modelo usadas (`coreSpan`, `layerSpans`, `layerPriority`, `openingRough`, `wallsOnLevel`…). Booleanas
(`difference`, `unionClipper`, `closeGapsSafe`) já existem em Rust (ABI v1, `ops.rs`) e passam a ser chamadas por dentro.

## 2 — Fronteira com as fatias B e E (ponto que precisa de decisão)

`wallZRange` lê pisos, lajes e telhados resolvidos (`attachSpans`, `roofWallProfile`), que só migram em B e E, e
`resolveLevel` ainda pede `attachTargets` e `resolveAllRoofs`. **Proposta (recomendada):** na fatia A o JS continua
calculando `wallZRange` por parede (função existente, **não** uma versão nova) e envia o resultado como entrada na
seção `paredes_z` (`z0`, `altura`, perfil superior e de base como listas de pontos). O Rust porta só `stepProfile`
e a combinação depois que B/E existirem. Assim A não depende de B nem de E, e nada é escrito duas vezes em TS.
Alternativa: portar A+B+E juntos (maior, mais arriscado, perde o ponto de validação visual intermediário).

## 3 — Esquema `cena-v2` (sobe `versao` de 1 para 2)

Seções novas (todas por colunas, ids internados em `u32`): `niveis` (cota, altura), `tipos_parede`, `camadas`
(tipo, ordem, espessura, material, função, núcleo, prioridade), `faixas` (rodapé etc.), `esquadrias_tipo`,
`aberturas` (parede, deslocamento, tipo, flips), `paredes` ganha tipo, nível, `baseOffset`, `locationLine`, `flipped`,
`noJoin*`, `joinStart/End`, `sag`, `topProfile` (lista à parte), `mark`. Texto (nomes, materiais) **não** entra:
só números e ids. Consulta nova `resolver_nivel(nivel_num, opcoes)` com saídas em arrays tipados: quadros por parede,
junções (estado/ponta), grupos (clusters), camadas com fragmentos/cortes/faixas como pilhas de anéis (`f64` + índices).
A seção `paredes` atual muda de forma: as consultas da Fase 0 passam a ler as colunas novas, e o harness continua
cobrindo-as.

## 4 — Sub-etapas (cada uma com testes de equivalência e commit próprio; só a última pede validação visual)

- **A1** Quadros (`frame`) + junções (`joins*`, `junctionIndex`) + grupos: saída comparada por parede e ponta.
- **A2** Itens por camada (`buildItems`, `layerGeom`, `wrap`, `junctionPlanar`) e pintor (`paint`).
- **A3** Faixas verticais, vãos, retornos e `solveCluster`; `ResolvedLevel` completo.
- **A4** Modo sombra + interruptor por fatia no diálogo "Experimentais"; harness por pavimento nos fixtures, nos
  sintéticos de 10 e 20 pavimentos e testes de propriedade. **Para** para validação visual do dono.

Estimativa: 2,5–3,5 mil linhas de Rust, como já previsto.

## 5 — Riscos conhecidos

- Cache por chave de cluster (`resolveMemo`, `CACHE_LIMIT`): o Rust reproduz a chave por assinatura de anéis
  (quantização 1 µm); a equivalência é por geometria, não pela chave.
- Ordem de iteração e desempate do pintor (`priority`, `through`, `coreT`, `order`, `layerIndex`) precisam ser
  idênticos; manhas do TS são reproduzidas primeiro, correções depois e separadas.
- `VERSAO_MOTOR_GEOMETRIA` sobe se o resultado de `resolveLevel` mudar (cache IndexedDB).

## 6 — A1 entregue (2026-11-02)

Esquema `cena-v2.json` (`versao` 2; o arquivo foi renomeado de `cena-v1.json` e todos os leitores atualizados).
Diferente do rascunho da seção 3, a seção `paredes` **não mudou de forma**: as três consultas da Fase 0 e o harness
continuam como estavam, e a A1 acrescenta seções novas com a mesma chave `id_num`:

| Seção | Conteúdo |
|---|---|
| `paredes_quadro` | `tipo_num`, `ordem`, `linha_loc`, `invertida`, `sem_junta_a/b`, `junta_a/b_tipo` e `_inverte`, `sag`, `z0`, `topo` (o JS envia `z0` e `topo` prontos: `wallBaseElevation` e base + `wallMaxHeight`) |
| `tipos_parede` | `n_camadas` (conferência de integridade) |
| `camadas` | `tipo_num`, `indice`, `espessura`, `funcao`, `tem_prioridade`/`prioridade` (o núcleo é derivado da função, como `coreRange`) |

Consulta nova `quadros_e_juncoes(nivel_num, tol_juncao)`: `tol_juncao` é um argumento a mais que o rascunho não previa,
porque `Project.settings.joinTolerance` entra em `computeEnds`/`joinStatus`. Saídas (codificação por saída no JSON):
`ids`, `quadro` (17 valores por parede), `arco`, `estado_pontas`, `parceiros`, `pontas_cab`/`pontas_dados` (corte de cada
extremidade: reto, esquadria, degraus ou plano), `cordas_cab`/`cordas` e `grupos`.

Regras de equivalência que a implementação fixou (e que o harness verifica):

- A ordem dos quadros é a de `wallsOnLevel`: `ordem` crescente, empate por `id_num` (o JS interna os ids na ordem de
  iteração do projeto, então o empate reproduz a ordenação estável).
- `Math.hypot` e `Math.round` do V8 são reproduzidos (`hipot`, `arredonda_js` em `geo2d.rs`); `sin`/`cos`/`atan2` usam o
  `libm` do wasm, que descende do mesmo fdlibm do V8. No Node o desvio máximo medido foi 1,8e-15 m.
- `hi` e `lo` de `EndSpec` são sempre o mesmo corte (só `both` os constrói), então uma extremidade guarda um corte só.
- A referência é o próprio motor, extraída por `packages/engine/src/kernelA1.ts` (`levelFrames`, `computeEnds`,
  `joinStatus`, `clusterWalls`, agora exportada); o Rust não tem versão intermediária em TypeScript. O falso do lado
  TypeScript responde `NAO_IMPLEMENTADO` à consulta nova.
- Módulos Rust: `geo2d` (vetores e arcos), `quadro` (`WallFrame`), `juncoes` (`joins*`), `grupos` (`clusterWalls` e
  `endPoint`), `secoes_a1` (armazenamento e validação das seções) e `a1` (a consulta e a codificação das saídas).

## 7 — A2 entregue (2026-11-02)

Esquema `cena-v3.json` (`versao` 3; renomeado de `cena-v2.json`, todos os leitores atualizados). Colunas novas: `camadas`
(`material_num`, `envolve`) e `tipos_parede` (`wrap_ends`, `n_faixas`); seções `faixas` (`WallType.strips`) e `paredes_z` (a
cota real de `wallZRange`, calculada pelo JS: depende de pisos, lajes e telhados das fatias B e E; difere de `paredes_quadro.z0/topo`,
que são nominais e alimentam as junções). Consulta nova `itens_pintados(nivel_num, tol_juncao, tem_corte_z, corte_z, n_contorno, ...ids)`:
os `outlineWalls` viajam como argumentos variáveis (`argsVariaveis` no JSON; limite do ABI de 1024 argumentos) e `flatAttach`/`planOpenings`
ficam para a A3 (o primeiro é interno do JS; o segundo só afeta `cut`). Saída por item (parede, grupo, faixa, índice, material, core, inPlan,
outline, through, prioridade, ordem, coreT, z0, z1, espessura), o `shape` bruto e o `fragment` pintado em planta, como pilhas de anéis.
Módulos Rust: `camadas` (`layerGeom`), `envolvimento` (`endReturns`), `itens` (`buildItems`, `layerCoreFlags`), `pintor` (`paint`) e
`a2` (orquestração e codificação). O cache de `resolveMemo` não foi portado (só guarda resultados).
Referência: `packages/engine/src/kernelA2.ts` extrai `buildItems` e `paint` (agora exportados); `tests/kernel-a2-referencia.test.ts`
confere que a orquestração repetida ali entrega o mesmo `raw`/`fragment` de `resolveLevel`.

Decisões de equivalência que a medição impôs (nada foi afrouxado em silêncio):

- **Escala do pintor.** A 1 µm (a quantização de `ops.rs`) a área de um fragmento já diverge do `polygon-clipping` do TS até ~7e-6 m²
  (36 de 216 itens passavam de 1e-6 na primeira semente de estresse). A A2 usa `ESCALA_FINA` = 1e9 (1 nm) via `diferenca_com_escala`,
  mesmo algoritmo non-zero; as demais operações da ABI v1 continuam a 1 µm.
- **Ruído topológico.** Mesmo a 1 nm o `polygon-clipping` (exato) devolve como peças separadas polígonos que se encostam por uma aresta, e
  mantém vértices quase colineares que o Rust (inteiros) funde. O critério bloqueante do fragmento é a região: área líquida e área da
  diferença simétrica dentro de 1e-5 + 1e-6 x área (as constantes do diferencial da 0045, `fixtures.ts`). A igualdade estrita (peças e
  anéis a 1 µm) é medida e reportada (~84% dos itens no estresse), não bloqueia. O shape bruto é comparado sempre de forma estrita.
- **Defeito do TS.** O `polygon-clipping` às vezes perde área em silêncio (estresse semente 100, retas, item 274: perde uma peça de
  0,020 m²; com `differenceClipper` o TS dá o mesmo que o Rust). O harness conta esses casos à parte (`tsPerdeuArea`) e o teste limita a fração.

## 7 — A3 em quatro passos (plano de 2026-11-02)

Mesmo molde da A2 (`1c882387` é o modelo): estender o esquema (sobe `versao`), Rust, referência TS extraída de `resolve.ts` (sem
reescrever geometria em TS), harness, testes (fixtures + sintéticos + propriedade + mutação), um commit por passo. Tolerâncias: 1 µm de
coordenada, 1e-6 m²/m³; só o fragmento do pintor segue a 0048.

- **A3a — Vãos.** Seções `tipos_abertura` e `aberturas` (e `paredes_z`: `z0`, `altura`, perfis de topo e base vindos de `wallZRange`,
  que o JS continua calculando). Consulta `aberturas_geom`: `openingGeometry` (centro, `u`, `n`, largura, altura, vão bruto, peitoril,
  espessura, `cutHalf` em arco), `openingRect` e `furosDe`. Referência: `openingGeometry` de `resolve.ts`.
- **A3b — Retornos.** `insertMode`/`insertReturns` (`wrap.ts`) e `clipReturn`, por parede e camada. Referência: `makeReturnClipper`.
- **A3c — Faixas verticais e `solveCluster`.** `breakpoints`, faixas por altura (pintor por faixa, furos de vão, retornos, fusão de
  faixas contíguas), `cut` da planta (`difference` com vãos de planta), regiões por material e silhueta (`closeGapsSafe`/`unionClipper`
  já existem em `ops.rs`). O cache (`resolveMemo`) não é portado.
- **A3d — `ResolvedLevel` completo.** `membranesOf`, `withProfile`/`withBottomProfile`, campos de `ResolvedWall` e `ResolvedCluster`;
  consulta `resolver_nivel` que devolve tudo; comparação com `resolveLevel` por parede (camadas, faixas, cortes, regiões, silhueta,
  perfis), no projeto real e nos sintéticos.

A4 (modo sombra e interruptor) vem depois, e a parada para validação visual do dono é única, depois da A4.

## 8 — A3a entregue (2026-11-02)

Esquema `cena-v4.json` (`versao` 4; renomeado de `cena-v3.json`, todos os leitores atualizados). Seções novas `tipos_abertura`
(`largura`, `altura`, `peitoril`, `folga_w`, `folga_h`, `folhas`, `plano`) e `aberturas` (`tipo_num`, `parede_num`, `kind`,
`deslocamento`, `flip_mao`, `flip_frente`, `tem_peitoril`/`peitoril`, `tem_altura`/`altura`). O JS envia o tipo já normalizado para o
vão (`openingType` = `spanTypeOf`, que cobre `nominalRef` leaf e composição) e os overrides da instância; o Rust calcula a altura
efetiva (`openingHeight`: override só se > 0), o vão bruto (`openingRough`, folga negativa vale 0), o peitoril (`sillOverride ?? sill`, o 0
conta), centro, `u`, `n` (no deslocamento, pelo quadro da A1) e `cutHalf` (`cutHalfOf`, só em arco). Consulta nova `aberturas_geom(nivel_num)`
devolve por abertura `ids`, `dados`, `medidas` (16 valores, `meia_prof` NaN em parede reta) e `retangulo` (os 4 vértices de `openingRect`).
`furos_de` (`furosDe` sem o cache) existe em `a3.rs` como função interna para a A3c e usa `ops::diferenca` (1 µm, a escala da ABI v1;
o pintor da A2 segue a única exceção, 0048).

Decisão de interface: os perfis de topo e de base de `wallZRange` **não** entram em `paredes_z` na A3a (nenhuma consulta da A3a os lê;
entram na A3d, onde `withProfile`/`withBottomProfile` os consomem). `paredes_z` fica como na v3 (`z0`, `altura`).

Equivalência: referência `packages/engine/src/kernelA3.ts` (`referenciaA3a` extrai `openingGeometry` e `openingRect`; nada de geometria
reescrita em TS), harness `scripts/kernel-harness-a3.mts`, testes `tests/kernel-a3a-referencia.test.ts` e `tests/kernel-a3a.wasm.test.ts`.
Identidade exata, todo número a 1 µm e área do furo a 1e-6 m², sem exceção; o desvio medido é ~5e-16. Onze mutações do Rust (folga do furo,
sinal da altura em `>=` e `> 1e-6`, piso da folga, piso do radicando do desvio, peitoril 0, `s_mid`, normal e tangente no início em vez do
deslocamento, folga do furo em arco, ordem dos vértices) foram todas reprovadas pelo teste.
