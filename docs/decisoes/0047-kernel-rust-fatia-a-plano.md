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
