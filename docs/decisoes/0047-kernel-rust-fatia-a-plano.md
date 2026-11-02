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

## 9 — A3b entregue (2026-11-02)

Esquema `cena-v5.json` (`versao` 5; renomeado de `cena-v4.json`, todos os leitores atualizados). Colunas novas: `tipos_parede.wrap_inserts`
(`WallType.wrapInserts`) e, em `tipos_abertura`, `janela` (o `kind` do TIPO), `fechamento` (`closure`: 0 none, 1 exterior, 2 interior, 3 both, 4 inherit),
`tem_alizar` (`openingCasing` ou o casing da composição: força o modo a none), `estilo_batente`, `modo_prof` (`frameDepthMode`), `prof_pedida`,
`larg_batente` e `esp_folha`. O JS envia tudo já resolvido (padrões aplicados; `prof_pedida` vem de `openingFrameDepth` no modo fixed), o Rust não
deriva padrões. Consulta nova `retornos_geom(nivel_num, tol_juncao, tem_corte_z, corte_z, n_contorno, ...ids)` (mesmos argumentos de `itens_pintados`):
por (parede, abertura, camada), o retorno de `insertReturns` e o resultado de `makeReturnClipper` contra o pintado em planta do grupo, em níveis de
índice como na A2, mais `modo` (`insertMode`) e `grupo`. A orquestração de `resolveLevel` até o pintado virou `a2::pintar_nivel`, reaproveitada pelo
recorte (o `plan` de `solveCluster`). Módulo Rust `a3b` (`insertMode`, `insertReturns`, `insertFrameFootprint`, `vaoPoint`, `rect`/`wallBand`,
`openingCore`, `openingFramePlacement`, `jambSection`, `makeReturnClipper`). Referência: `referenciaA3b` em `kernelA3.ts` (a orquestração de grupos
fica em `gruposDoNivel`, extraída de `kernelA2.ts`).

Escala: as booleanas de `a3b.rs` (retorno menos batente e recorte) usam `ESCALA_FINA` (1 nm), como o pintor da A2, por escolha de implementação. A
1 µm um recorte do estresse dava diferença simétrica de 1,0207e-6 m² contra o `polygon-clipping` exato (limite 1e-6); a 1 nm o máximo medido é
3,6e-7. A comparação NÃO foi afrouxada: 1 µm de coordenada, 1e-6 m² de área líquida e de diferença simétrica, sem a folga da 0048 (que vale só para o
fragmento do pintor). A interseção do retângulo em parede curva continua a 1 µm.

Fiapos: o `polygon-clipping` deixa triângulos de ~0 m² quando o batente cobre o retorno inteiro; o Rust devolve vazio. Um retorno presente só de um
lado com área <= 1e-6 m² conta em `fiapos`; maior que isso de um lado só é divergência. Medido no estresse (sementes 1..12): 146 fiapos para 576
retornos comparados (20,2%), todos do lado do TS (o Rust nunca inventa retorno: o teste exige 0 fiapos só do Rust). O teste limita a fração a 25%.

Cobertura (estresse 12 sementes x 2 pavimentos): 576 retornos, exterior 40, interior 50, both 486; 152 recortados por parede vizinha; 852 de 1152 formas
casam também peça a peça (as demais pela região); mais retas só, arcos só, sintéticos de 10 e 20 pavimentos, fixture da casa de 2 quartos, casos de
limiar (igualdade em `off + espessura >= largura/2 - 1e-3` e piso de 1e-6 da espessura), propriedades (retorno na vizinhança do vão, recorte dentro do
retorno e fora do pintado das outras paredes), upsert/remoção, entradas inválidas e vazamento. Dezesseis mutações dos limiares do Rust (folga de 1e-3 e
`>=`, estilo block, alizar, GAP, OVERLAP, aduela 0,03, faixa alta e folgas da parede curva, N=16, lado do batente, limite do modo fixed, ombreira em L,
recorte contra a própria parede, piso de 1e-6, vão livre sem batente): todas reprovadas (duas, `>=` e o piso de 1e-6, sobreviveram até se
acrescentarem os casos de limiar e a exigência de 0 fiapos do Rust).

## 10 — A3c: implementada, PARADA numa medição (2026-11-02)

Esquema `cena-v6.json` (`versao` 6; renomeado de `cena-v5.json`, todos os leitores atualizados). Nenhuma seção nova: `wallZRange` entra por `paredes_z` e a
lista `planOpenings` viaja como argumento variável. Consulta nova `cluster_resolvido(nivel_num, tol_juncao, tem_corte_z, corte_z, n_contorno,
tem_aberturas_planta, n_aberturas_planta, ...ids_contorno, ...ids_aberturas_planta)` (`a3c.rs`): por camada resolvida (`solveCluster`: parede, grupo,
faixa/índice, material, core, prioridade, `raw`, `fragment`, `cut`, faixas verticais com z0/z1 relativos à base) e, por grupo, as regiões por material e a
silhueta. `retornos_do_nivel` (a3b) e `furos_de` (a3, agora a 1 nm) são reaproveitados; `ops.rs` ganha `fechar_frestas`/`fechar_frestas_seguro` (`closeGaps`/
`closeGapsSafe` sobre o `offset` do i_overlay; o plano dizia que já existiam, mas só `uniao` e `offset` existiam). Referência: `referenciaA3c` extrai de
`resolveLevel` (cache próprio vazio); recusa parede com perfil (A3d). O cache de `resolveMemo` não foi portado.

**Resultado bloqueante (passa):** identidade (parede, grupo, faixa, índice, material, core, prioridade) e `raw` exatos; `fragment`, `cut` e cada faixa
vertical como região pelo critério da 0048. Estresse (12 sementes x 2 pavimentos, várias opções de planta): ~6 mil camadas, ~15 mil faixas, 0 fiapos;
maior diferença simétrica de `fragment`/`cut`/faixa 3,7e-6 m². A fusão de faixas por `sigOf` decide diferente do TS em ~2% das camadas (as faixas então
só casam pela partição em alturas elementares; o teste limita a 6%).

**Medição que PARA a etapa:** `regions` e `silhouette` (união + `closeGapsSafe`) NÃO cabem na 0048 (1e-5 + 1e-6 x área). Estresse sementes 1..12, opções
padrão: 113 de 214 regiões e 33 de 61 silhuetas passam do limite; diferença simétrica típica 1e-4 a 3e-4 m² em regiões de 5 a 20 m²; sim <= 1e-5 + 4,2e-4 x
área (menos um caso); a diferença de área chega a 1,9e-6 x área. Causa isolada: a UNIÃO (Clipper-JS x i_overlay, ambos a 1 µm, arredondam as interseções de
forma diferente) já dá 96 de 214 fora do limite sem o fechamento; o fechamento acrescenta pouco. É o mesmo fenômeno da 0048 (dois motores quantizados não
chegam a 1e-6), só que a região é a soma de dezenas de peças. Um caso à parte (semente 1, nível 0, material 2): o `unionClipper` do TS INFLA a região em
3,5e-3 m² (preenche um entalhe de 3 x 12 cm junto a uma parede curva; a união exata dá 2,382907, o Clipper do TS 2,389987, o Rust 2,382905): defeito do TS,
como o do `polygon-clipping` na 0048. Nada foi afrouxado: o harness conta as regiões/silhuetas fora do limite (`regioesForaDaTolerancia`) e o teste as
reporta sem bloqueá-las. DECISÃO PENDENTE DO DONO (nova constante para regiões, referência do TS trocada pela do Rust, ou porte fiel do Clipper).

Escala: pintor, furos, corte e recorte dos retornos a 1 nm; união das regiões/silhueta e fechamento de frestas a 1 µm (as do Clipper).

Cobertura (estresse, 12 sementes x 2 pavimentos, uma opção de planta por pavimento: padrão, corte baixo, corte na barra, planOpenings metade/vazio, corte alto com
contorno, corte baixo com contorno e metade): 2066 camadas (221 em parede curva; 1280 com mais de uma faixa; 984 com  diferente do ), 5083 faixas, 99
grupos, 269 regiões e 99 silhuetas; mais retas só, arcos só, sintéticos de 10 e 20 pavimentos, fixture da casa de 2 quartos, propriedades (faixas ascendentes e
sem sobreposição; parede isolada coberta do chão ao topo sem lacuna; faixa dentro do bruto fora dos furos de vão; silhueta contém as regiões a menos de 5e-5 m²,
medido 1,9e-5 no Rust e 2,6e-6 no TS), , upsert/remoção, entradas inválidas, vazamento. Teste wasm novo: ~48 s.

Mutações (dezoito, em ): ativo por , altura do vão pela metade nos furos, sem quebras de vão, sem quebras de item, nunca fundir, sempre fundir, retornos em
todas as faixas,  ignorado, sem retornos de planta no corte, contorno mantém o corte, camada em planta sem fragmento mantida, camadas sem ordenar, ativo por
, z absoluto, furos em todas as faixas, silhueta vazia, regiões só do 1º corte: reprovadas (a da camada em planta sem fragmento só depois de acrescentar o caso
de limiar de duas paredes sobrepostas de alturas 2,0 e 2,8 m). SOBREVIVE: regiões sem o fechamento de frestas (), porque regiões e silhuetas não são
bloqueantes; um guarda de erro grosseiro (1e-2 m², fora da equivalência) pega peça faltando mas não o fechamento. Fecha-se com a decisão do dono.

Não feito por causa da parada: build final do  e 
> hestia@0.1.0 wasm:check
> node scripts/verificar-wasm.mjs (o binário commitado é o da A3b; o hash das fontes diverge até o rebuild).
Mutações do A3c: pendentes para o fim da A (as dezoito acima foram rodadas uma vez, antes da mudança de método; ver o resultado acima).

## 11 — A3d: implementada, PARADA numa medição da 0049 (2026-11-02)

Esquema `cena-v7.json` (`versao` 7; renomeado de `cena-v6.json`, todos os leitores atualizados). Seção nova `perfis_z` (`parede_num`, `lista`, `indice`, `t`, `h`): uma lista de
pontos é uma lista de linhas, então os perfis não cabem como colunas de `paredes_z` e vão numa seção à parte (decisão de esquema). `lista` 0 = topo derivado de `wallZRange`
(`WallZ.profile`, copiado em `profileTop`), 1 = base derivada (`bottomProfile`, copiada em `profileBottom`), 2 = `Wall.topProfile` do modelo (só recorta quando não há topo derivado,
como o default de `withProfile`; não é copiado). Consulta nova `resolver_nivel` (mesmos argumentos de `cluster_resolvido`): paredes (a, b, u, n, length, sHi, sLo, baseZ, height,
nominalZ0, nominalZ1; os nominais são `paredes_quadro.z0/topo`), perfis copiados, membranas (`membranesOf`, só parede reta) e camadas/regiões/silhueta de `cluster_resolvido`, com
as faixas recortadas por `withBottomProfile` e depois `withProfile` (`a3d.rs`: `recortar_pela_base`, `recortar_pelo_topo`, interseção a 1 nm) e a inclinação do topo (`slope`) em
11 valores por faixa. Módulo `a3d.rs`; `a2::NivelPintado` guarda as pontas (`membranesOf`); `ops::interseccao_com_escala`. Referência: `referenciaA3d` (`kernelA3d.ts`), extraída de
`resolveLevel`; a recusa de parede com perfil da `referenciaA3c` foi removida. Harness: `compararA3d` (campos escalares a 1e-6, perfis exatos, membranas, faixas estritas ou por alturas
elementares com a inclinação avaliada na altura). Teste wasm: ~22 s (a medição completa, 65 s com o modo A3D_MEDIR).

Conforme a 0049, regiões e silhuetas agora BLOQUEIAM (topologia igual, limite 1e-5 + 5e-4 × área, guarda de 1e-2 m²; exceção nomeada: semente 1, pavimento 0, material 2). Os contadores
(`regioesForaDaTolerancia`, `silhuetasForaDaTolerancia`, `topologiaDiferente`, `acimaDoLimite0049`, `maxFracaoDoLimite0049`) ficam como estatística.

**PARADA (nada foi decidido nem afrouxado):** passam do critério da 0049 fora do caso nomeado, nos testes do A3c e do A3d:
1. Topologia: no estresse do A3d (24 comparações), 84 de 285 regiões/silhuetas (29%) têm nº de peças/furos diferente (nos dois sentidos, p. ex. 17x20, 71x64, 51x43; furos 12/7 x 12/3); no A3c idem.
2. Uma região fora do limite, fora do caso nomeado: fixture casa-2-quartos, pavimento 0, material 6 (área 0,083 m²): diferença simétrica 6,7e-5 m² contra limite 5,2e-5 (1,30x); diferença de área 2,2e-7.
3. Silhueta do grupo 0, semente 1, pavimento 0 (corte baixo): 1,28x o limite, consequência do mesmo defeito do TS que a exceção nomeada cobre na região (a exceção não a cobre).
4. Defeito do TS em `clipBandsToProfile` (uma camada, estresse retas semente 101, parede 18): o `polygon-clipping` `intersection` devolve fatias de área maior que o polígono (0,0195 + 0 + 0,0375 > 0,0494 m²; o Rust soma 0,0494), então a faixa de topo do TS fica errada (0,0195 m² plana contra 0,0089 do Rust); mesmo tipo do defeito da 0048.
Todo o resto passou: 384 paredes (30 com profileTop, 56 com profileBottom, 75 com topProfile do modelo, 53 com membranas), 2074 camadas, 6574 faixas (616 inclinadas), desvio máximo de campos 1,1e-16, 0 fiapos só do Rust.

Mutações do A3d: pendentes para o fim da A. Build final do `.wasm` e `npm run wasm:check` também (o binário commitado segue o da A3b).

### 11.1 — A 0049 refinada aplicada (A3c e A3d)

Critério de regiões e silhuetas (bloqueante), na ordem: (1) guarda de 1e-2 m²; (2) limite `1e-5 + K × perímetro × 1e-6` m² na diferença de área e na simétrica, com
**K = 6**; (3) componentes (peças e furos) acima de 1e-4 m² precisam ter par, depois de canonicalizar os dois lados (`canonica`, união exata). Componente sem par
é EQUIVALENTE quando existe também na forma do outro lado com outra representação: para furo, a interseção do furo com a forma sólida do outro lado cabe no limite da regra 3;
para peça, a peça está dentro da forma do outro lado até o limite. Componentes abaixo de 1e-4 m² contam em `fiaposDeRegiao`.

Medição de K (todos os casos: estresse 12 sementes x 2 pavimentos x 1 opção, retas, arcos, sintéticos de 10 e 20 pavimentos, fixture casa-2-quartos, fora das exceções):
maior razão `max(diferença de área, simétrica) / perímetro / 1e-6` = **3,94** (A3c, Estresse 11, pavimento 1, opções padrão) e **3,99** (A3d, Estresse 8, pavimento 0, `cutZ` 0,05);
K = 3,99 × 1,5 = 5,98, arredondado para cima: 6. Componentes sem par acima do fiapo resolvidos pela verificação de equivalência: 1 (um furo de 0,00354 m², silhueta do
grupo 1, Estresse 4, pavimento 1: o Rust tem o vazio como fenda auto-tangente); é também o maior. Sem par no total (qualquer tamanho): 121 no A3c e 129 no A3d, quase todos
fiapos de arredondamento.

Exceções nomeadas (só valem se verificadas automaticamente): (1) semente 1, pavimento 0, grupo 0, material 2 e a silhueta do mesmo grupo (defeito do `unionClipper` do TS;
o Rust concorda com a união exata dos cortes dentro do limite da regra 3, a silhueta comparada sem o fechamento de frestas); (2) estresse retas, semente 101, parede 18,
camada 4, recorte pelo perfil (`polygon-clipping`: as fatias da faixa de entrada somam mais que a faixa; o Rust nunca ganha área em relação à entrada, por z0, a 1e-6 m²).
A verificação de (2) é por desigualdade (as fatias que o perfil descarta só diminuem a soma), não por igualdade. Se o TS deixar de ter o defeito, a exceção reprova como obsoleta.
