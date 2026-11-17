# Plano de integração do vão com forma (furo por contorno) no pipeline de paredes

Data: 2026-11-17. Fase 1 da integração. Continua `09`, `10`, `11`, `19`, `21`, `22`. Marcas: [V] verificado nesta sessão (código lido com arquivo:linha, ou teste rodado); [I] inferência minha, a validar. Linhas valem para o estado do branch `claude/lucid-bell-hwk4ln` nesta data.

Princípio mantido: o vão de contorno livre fura a parede por booleana 3D em Rust (`furo_contorno`). Nada de faixas horizontais nem colunas, nada de aproximação do arco em prismas.

## 1. O que a fase 1 entregou (sem depender do cliente TS do furo)

| Peça | Onde | Efeito |
|---|---|---|
| Campo `OpeningType.shape?: OpeningShape` | `packages/model/src/openingTypes.ts` (fim da interface) | opcional; ausente ou `rect` = retângulo de hoje [V] |
| `openingShapeOf(t, height?)`, `openingShapeProblems` | `packages/model/src/openingShapeOf.ts` (exportado no `index.ts`) | forma efetiva do vão, dimensionada pelo vão bruto [V] |
| `OpeningGeometry.forma?` | `packages/engine/src/types.ts`, preenchido em `resolve.ts:255` via `formaDoVao` | fonte única da forma para 3D, quantitativo, planta, junção [V] |
| Chave de cache do cluster | `resolve.ts` (`clusterKey`, termo `\|f:` só quando há forma) | chave idêntica à de antes para vão retangular [V] |
| Despacho e ponto de injeção | `packages/engine/src/furoContornoDespacho.ts` | `rotaDoVao`, `vaosPorRota`, `pedidoFuroDaParede`, `furarParedePorContorno`, `definirClienteFuroContorno` [V] |
| Avisos da forma | `packages/engine/src/openingShapeIssues.ts` | `forma-vao-invalida`, `forma-vao-ignorada-na-parede` [V] |
| Avisos de norma de porta ligados | `packages/engine/src/openingNormProject.ts` | adapta `openingNormIssues` ao projeto [V] |
| Fluxo de avisos do editor | `apps/web/src/editor/avisosCalculo.ts` | os dois conjuntos entram em `avisosDoProjeto` [V] |
| i18n | `i18nMessages.ts` (pt, en) e `apps/web/src/editor/i18n/areas/packages-engine.ts` (7 idiomas) | chaves `egb_issue_opening_shape_invalid` e `egb_issue_opening_shape_host` [V] |

Comportamento hoje: sem cliente instalado, toda rota é `retangular`; o furo, a planta, o 3D e o quantitativo dão os mesmos números de antes. A forma só aparece como dado (`OpeningGeometry.forma`) e como aviso [V: testes em `openingShapeIssues.test.ts`, `openingShapeOf.test.ts`].

## 2. Decisão do modelo: a forma mora no TIPO

`shape` fica em `OpeningType`, não em `Opening` (instância). Justificativa:

1. Largura, altura e peitoril padrão já são do tipo; a forma é a mesma família de dado ("janela em arco 90 x 140" é um tipo do catálogo) [V: `openingTypes.ts`].
2. Quadro de esquadrias, catálogo, IFC e `ifcOpeningProfile.ts` trabalham por tipo [I].
3. A instância já tem as exceções que importam à forma: `offset`, `sillOverride`, `heightOverride`. `openingShapeOf(t, height)` usa a `heightOverride` da instância, então um mesmo tipo em arco serve em vãos de alturas diferentes [V].
4. Um override de forma por instância pode ser somado depois (`Opening.shape?`), sem quebrar nada, se o produto pedir [I].

Regras do campo [V]:
- Ausente, ou `{ kind: 'rect' }`: vão retangular, mesmos números de hoje. `openingShapeOf` devolve `null`.
- Com forma, as dimensões gravadas na própria forma (`width`/`height`) são só informativas. O vão vale as do tipo (e a altura da instância) mais `roughOversize`, que é o que fura a parede. A flecha (`rise`) e o tipo ficam como gravados. Assim há uma fonte só das dimensões (a que o resto do motor já lê) e não há como a forma divergir do vão. [I] Com `roughOversize` a forma cresce em largura e altura e a flecha não: arco abatido com folga grande pode virar `rise-invalid`; o aviso pega.
- Forma inválida não derruba nada: o vão segue retangular e `forma-vao-invalida` avisa (nenhum aviso bloqueia).

Persistência: o projeto é gravado como JSON do modelo e `migrate.ts` repassa os tipos de abertura sem filtrar campos (`migrate.ts:56-82, 221-242`) [V pela leitura]. Campo opcional novo não precisa de migração e arquivos antigos abrem iguais [V: nenhum arquivo antigo tem `shape`].

Contrato de campos: `contratoCamposEsquadria.test.ts` exige entrada em `LEITORES` e um leitor real em produção. `shape: ['vao', 'resolve']` foi acrescentado e é lido em `openingShapeOf.ts` [V: teste verde].

### 2.1 O esquema da cena (contrato com o Rust) NÃO foi estendido, de propósito

- `crates/geom-wasm/schema/cena-v11.json` (nome antigo; `versao` = 19, confirmado em `esquema.test.ts`) descreve `tipos_abertura` (linha 262) e `aberturas` (linha 334) só com o vão retangular. O TS monta essas seções em `kernelA3.ts:178-201` a partir de `openingGeometry` e `openingRect`, e o Rust fura com `v.retangulo` (`a3c.rs:203` e `a3c.rs:242`) [V].
- A ABI do furo é outra e já carrega o contorno por argumento: `furo_contorno_furar` recebe os pontos, as posições e as espessuras (doc 21 §3 e §4; `furo_contorno_abi.rs:92, 257`) [V]. Logo o contorno viaja pela ABI do furo, não pela cena. Estender `tipos_abertura` exigiria subir `versao`, regenerar `esquema.gerado.ts` e rodar `build:wasm` (fora desta fase) sem ganho enquanto o furo for chamado pelo TS com o contorno pronto.
- Compatibilidade garantida: o esquema segue idêntico, então o teste de contrato (`esquema.test.ts`) não muda. Se a decisão futura for o Rust resolver o vão com forma dentro de `resolver_nivel`, aí o caminho é coluna opcional em `tipos_abertura` (valores de ausente = 0 = retângulo), versão 20 [I].

## 3. Validação e fluxo de avisos

- `openingShapeIssues(p, lang)` (`openingShapeIssues.ts`), no estilo de `openingPlaneIssues.ts` [V]: por instância, a forma efetiva (tipo + altura da instância + folga) passa em `validateOpeningShape`; se falha, aviso `forma-vao-invalida` com os códigos (`round-height-below-half` etc., tokens técnicos não traduzidos). Forma válida em parede curva (`sag` ≠ 0) ou inclinada (`tilt` ≠ 0) gera `forma-vao-ignorada-na-parede`, porque o caminho de contorno não as atende (doc 22 §4.2 itens 3 e 4). Tipo com forma e sem instância não gera aviso [I: decisão de escopo].
- Ponto de extensão natural: `apps/web/src/editor/avisosCalculo.ts` (lista `avisosDoProjeto`, que o worker e `useIssues` consomem) já junta `openingPlaneIssues` e `projectIssues` [V]. Os dois conjuntos novos entram ali. `projectIssues.ts` não foi usado: ele só chama avisos que dependem de geometria resolvida de parede/laje e não é a lista de topo [V pela leitura].
- `openingNormIssues` (porta: vão livre 0,80 x 2,10, soleira 5 mm, vidro seguro) estava pronto e sem consumidor. `openingNormProject.ts` resolve os dados do projeto [V]:
  - Vão livre = o vão do tipo, SEM descontar o batente. Descontar (como faz `openingChecks`, a faixa do diálogo) faria toda porta 0,90 x 2,10 avisar, porque 2,10 − 0,05 = 2,05 < 2,10 [V: o teste falhou assim antes do ajuste]. Efeito: só porta com vão abaixo de 0,80 de largura ou 2,10 de altura avisa. Isto é uma cota superior da norma, não a norma [I].
  - Soleira: de `threshold.thickness`. Rota acessível não existe no modelo, então o aviso de soleira não dispara até esse dado existir [I].
  - Vidro: só avisa com `leafStyle` `glass`/`fullglass` e `glassKind` informado e diferente de laminado/temperado. `glassKind` ausente não avisa [I].
  - Mensagens continuam fixas em português (como já eram em `openingNormIssues.ts`), com o aviso de que os valores vêm de resumo público; não foram para o i18n.
  - Atenção de produto: porta de 70 cm do catálogo (`ot_p70`) agora gera aviso no painel. Para desligar, tirar `...openingNormProjectIssues(p)` de `avisosCalculo.ts`.

## 4. Onde o vão com forma entra no pipeline (arquivo:linha)

Mapa do caminho atual [V], seguido do que muda. Todo ponto abaixo parte de `OpeningGeometry.forma`.

### 4.1 Montagem do vão
- `resolve.ts:230` `openingGeometry`: já devolve `forma` (linha 255). `rotaDoVao(g, { tilt })` decide a rota [V].
- `resolve.ts:279` `breakpoints`: acrescenta peitoril e topo do vão como quebras verticais. Com contorno, o furo deixa de ser prisma por faixa, então o vão com contorno NÃO deve gerar quebras (senão fatia a camada em faixas à toa) [I].

### 4.2 3D da parede (furo)
Hoje: `resolve.ts:341-343` monta `holes` (retângulo `openingHole`, de `openingCut.ts:42`) para cada faixa vertical; `furosDe` recorta a camada (`resolve.ts` logo abaixo). O 3D extruda as faixas: `solids.ts:213` `extrudeLayer`, `solids.ts:374` `wallLayerSolid`, laço em `solids.ts:436` [V].

Mudança prevista [I], em 5 passos:
1. Em `resolve.ts:341` filtrar `holes` por `rotaDoVao(g).via === 'retangular'` (idem a planta, 4.4). O vão com contorno deixa a camada INTEIRA nas faixas: a junção entre paredes opera sobre faixas sem o vão, o que é o desejável (o vão é aplicado por último, doc 22 §4.1).
2. Carregar o vão com contorno até o 3D: novo campo em `ResolvedWall` (por exemplo `furosContorno: VaoComContorno[]`, tipo já em `furoContornoDespacho.ts`), preenchido em `resolveLevelTs` onde `rw` é montado (`resolve.ts:~478`).
3. `wallLayerSolid` (`solids.ts:374`): se a parede tem `furosContorno`, a malha da camada vem de `furarParedePorContorno(pedidoFuroDaParede(...))` e não de `extrudeLayer`. A espessura por camada, o comprimento e a altura vêm de `rw` e do tipo da parede [I].
4. Ressalva técnica que decide a ordem do trabalho: `furar_parede` (`furo_contorno.rs:232`) fura uma placa `L x e x H` (cubo por camada). A camada real pós-junção é um prisma de planta esquadrejado com topo possivelmente inclinado (doc 22 §4.2). Para o 3D correto é preciso que o Rust aceite a malha (ou o prisma em planta + z) de cada camada como alvo da booleana; esse é o primeiro trabalho de Rust da fase 2 [I, doc 22 §4.3 passo 1].
5. Interino aceitável para parede reta, vertical, topo plano, sem esquadria nas pontas junto ao vão: usar o cubo como está. Fora desse caso, rota `retangular` (já é o que `rotaDoVao` faz para curva e inclinada) [I].

Caminho Rust do `resolver_nivel` (despacho do kernel): o Rust recebe os vãos como retângulo em `kernelA3.ts:178-201` (`retangulo: openingRect(g)`) e fura com eles em `a3c.rs:203` (por faixa) e `a3c.rs:242` (planta) [V]. Para o vão com contorno não ser furado por retângulo no Rust, a saída sem mexer no esquema é o TS NÃO enviar esses vãos em `aberturas` (filtrar por `rotaDoVao` antes de codificar) e o comparador `kernelComparaA3.ts` ignorá-los do mesmo jeito [I]. Alternativa com coluna nova: seção 2.1.

### 4.3 Quantitativo
Hoje: `quantities.ts:85` (`grossVol` = soma de `bandVolume` das faixas) e `quantities.ts:102` (`cortado` por pisos e lajes); no Rust `quantidades.rs:238-290` (`quantidades_paredes`) e `perfil_quant.rs:110-149` (`volume_faixa` = área da planta com furos x altura). O vão entra pela planta da faixa, não pela malha [V, doc 22 §2].

Com 4.2 passo 1 a faixa fica inteira; o volume removido pelo contorno entra como termo à parte: `quantificar_parede` (`furo_contorno_quant.rs`) mede sobre a malha furada (volume, área de face líquida, área do furo) e `quant_vao` dá área e perímetro reais do contorno (não `W x H`) [V: 12 testes do doc 22]. Mantém-se `quantidades_paredes` por faixa para vão retangular (paridade com o TS) e usa-se o caminho 3D só nos vãos com forma [I, doc 22 §4.3 passo 4]. Efeito no quadro: `Area` do vão em arco passa a ser a real; o IFC (`ifcOpeningProfile.ts`) já exporta o perfil [V].

### 4.4 Planta
- Furo em planta: `resolve.ts:367` (`rects = ... .map(openingHole)`) usa o retângulo de largura cheia. Com contorno, a largura na altura do corte é a corda: `cutHalfWidth(shape, place, cutZ)` já existe em `openingShapeViews.ts:55` e dá a meia largura na cota de corte [V: arquivo existe]. Passo: nesse ponto, para vão com contorno, trocar o retângulo por um de largura `2 * cutHalfWidth(...)` na cota `opts.cutZ ?? z0 + PLAN_CUT` (`resolve.ts:84`, 1,20 m). Corte acima do arco: largura menor que a do vão; corte acima do topo: nenhum furo [I].
- Símbolo da esquadria: `render/src/plan/build.ts:198` chama `openingGeometry` e `tracosDaAbertura`; `openingPlanSymbolPaths` (`openingShapeViews.ts:84`) já é o símbolo derivado do contorno. Ligação depende da decisão de composição (fase 3) [I].
- Contorno do vão na vista: `render/src/plan/view.ts:284` e `planOverlay.ts:52,80,125` usam `openingBandRing` (retângulo). Não mudam nesta etapa [I].

### 4.5 Retorno do acabamento
Hoje: `resolve.ts:452` (`insertReturns`) devolve só as ombreiras como retângulos e `resolve.ts:346` os soma às faixas que o vão atravessa; sem verga nem soleira (doc 22 §2) [V]. Para vão com contorno: pular `insertReturns` e usar `retorno_do_vao` com `ModoRetorno::Contorno` (anel que segue a forma) [I]. Decisão do dono em aberto: o modo `Contorno` do retângulo acrescenta verga e soleira ao retorno e muda o quantitativo de vãos retangulares existentes (doc 22 §4.3 item 5); por isso só vale para vão com forma, e o retângulo mantém as ombreiras.

### 4.6 Junção entre paredes
`juncoes.rs` é só planar e não conhece vão (doc 22 §4.1) [V]. Junção consome as faixas (`junctionLevel.ts:320-386`, `wallJunction.ts:84-110`, `b3.rs:457-465`) [V]. Com 4.2 passo 1 a junção passa a ver a camada inteira nos vãos com contorno, e o furo é aplicado depois. Riscos [I]: (a) volume removido vira `A x espessura local` quando o vão está junto de uma ponta esquadrejada; (b) retorno em canto precisa ser recortado contra a parede vizinha em 3D; (c) prioridade entre paredes em 3D. Os três estão listados no doc 22 §4.2 e não foram tratados aqui.

### 4.7 Peças da esquadria, corte e IFC
- Batente, folha, vidro, alizar: `aberturas3d.ts:43,178` (`openingGeometry` + `buildOpeningModel`) assumem caixa retangular (frente 01, R1-R20). Fase 3 do plano (`PLANO-ESTADO.md`), fora desta entrega.
- Corte: `section.ts:393` calcula o pé do vão em retângulo (`g.width`); `verticalCutProfile` (`openingShapeViews.ts:66`) já dá o perfil do contorno [V: existe].
- Massa: nenhum ponto de entrada. `massa_*.rs` (plano de massa: pilha de seções, malha, planta, corte, quantitativo) não tem nenhuma ocorrência de abertura/vão (busca por `abertura|vao|vão|opening` sem resultado) e `camadas.rs` é a geometria planar de camada (`layerQuad`, `endPolyline`; cabeçalho linhas 1-9) sem vão [V]. O vão entra só por `a3c.rs` (`resolver_grupo`, linha 148; furos nas linhas 203 e 242) e `a3.rs:126` (`furos_de`).

## 5. O despacho (o que existe e como ligar)

`furoContornoDespacho.ts`:
- `rotaDoVao(g, { tilt })`: `{ via: 'retangular', motivo }` com motivo `sem-forma`, `sem-cliente`, `parede-curva`, `parede-inclinada`; `{ via: 'contorno' }` só com forma válida, cliente instalado e parede reta e vertical [V: testes].
- `vaosPorRota(opens, wallId, parede)`: separa os vãos da parede em `retangulares` e `comContorno`.
- `pedidoFuroDaParede(wallId, { comprimento, altura, espessuras }, vaos)`: monta o pedido com o contorno de `outline(forma)` (cordas de 1 mm), `x = offset` e `soleira = sill` [V]. Espelha a ABI (doc 21 §4).
- Porta `ClienteFuroContorno.furarParede(pedido) → ResultadoFuroParede | null` e `definirClienteFuroContorno(c | null)`: mesmo padrão de `definirDespachanteDeNivel` (`resolveDespacho.ts`). O cliente TS do outro agente (`packages/geom/src/furoContorno.ts`) se liga com um adaptador que converte `PedidoFuroParede` nos buffers da ABI e as saídas em `MalhaCamadaFurada` (índices locais por camada, doc 21 §5). Não acoplei o engine a esse arquivo porque a API dele ainda não é estável [I].
- `furarParedePorContorno(pedido)`: devolve `null` sem cliente, sem vão ou em falha; o chamador mantém o caminho retangular. Esse é o ponto único de fallback.

O que NÃO foi ligado, e por quê: as chamadas em `resolve.ts:341/367` e `solids.ts:374` ainda não consultam a rota. Filtrar os furos retangulares sem que o 3D, o quantitativo e a planta consumam o furo por contorno deixaria a parede sem vão. A troca tem de ser atômica (4.2 a 4.4 juntos), atrás da instalação do cliente [I].

## 6. Ordem sugerida para a fase 2

1. Rust: `furar` com alvo = malha/prisma da camada pós-junção (doc 22 §4.3.1) e teste de paridade passando pela `Cena` (volume líquido de vão retangular = `quantidades_paredes`).
2. Adaptador do cliente TS ao `ClienteFuroContorno` e `build:wasm` (+1,07 MB, doc 19), NOTICE.
3. `resolve.ts:341/367/452` filtrando por rota + `ResolvedWall.furosContorno` + `solids.ts:374`, num só passo, com teste: vão retangular intocado (golden), vão em arco com volume = `quant_vao`.
4. Quantitativo (4.3), planta (4.4), retorno (4.5). Depois peças, corte e composição.
5. Spike de panic com contorno auto-intersectado antes de expor (doc 21 §8): validar o anel no TS (`validateOpeningShape` já barra os parâmetros; as formas geradas por `outline` são simples por construção [I]).

## 7. Verificado e não verificado

[V] `vitest` de `openingShapeOf.test.ts`, `contratoCamposEsquadria.test.ts`, `openingShapeIssues.test.ts` (10 testes: avisos, forma na geometria, despacho e pedido, avisos de norma), `openingNormIssues.test.ts`, `openingPlaneIssues.test.ts`, `resolve*.test.ts`, `avisosProjeto.test.ts`, `avisosWorker.test.ts` e `i18n.test.ts` do web passam. `tsc -p tsconfig.json --noEmit` limpo nos arquivos desta entrega (os erros que restam são de `packages/geom/src/furoContorno*.ts`, do outro agente). `eslint` limpo nos arquivos alterados (`resolve.ts` fica em 420 linhas úteis).

[I] / não verificado: (a) nada foi rodado com cliente real e o Rust não foi tocado nem compilado (`build:wasm` proibido); (b) o efeito do aviso de norma em projetos reais (ruído de `ot_p70`); (c) tipo com forma sem instância não é validado; (d) o comportamento da forma com `nominalRef: 'leaf'` e composição usa o vão de `spanTypeOf`, via `openingTypeById`, sem teste específico; (e) `roughOversize` com arco abatido, ver seção 2.
