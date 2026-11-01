# Decisão 0041 · Escadas e rampas por nível

Decidido em 2026-10-31, alinhado ao Revit (Base/Top Level, Desired/Actual Number of Risers) e ao ArchiCAD
(Home Story/Stair Toplink, mudança pequena × grande de altura). Complementa a [0011](0011-escadas.md):
não muda o croqui, o furo derivado nem os geradores; muda como o topo é guardado e como o nº de espelhos e o
comprimento das rampas reagem à edição de um nível. Fontes: `docs/escadas/A-revit-componente.md` §1 e
`docs/escadas/C-archicad.md` §2 e §6.

## 1 · Contexto: o defeito atual

- **Topo implícito.** `stairTopLevel`/`rampTopLevel` (`packages/model/src/queries.ts:113-126`) devolvem o
  `topLevelId` gravado ou, quando ele é `null`, o resultado de `levelAbove(...)` a cada leitura; `stairTopZ`/`rampTopZ`
  recalculam a cota a partir disso. A criação grava `topLevelId: null` (`draftStair`, `draftRamp`), então o topo nunca
  é um vínculo estável: criar, inserir ou editar um nível muda o alvo da escada/rampa sem o usuário pedir, e com ele o
  desnível H.
- **Piso sem a fórmula.** Em `packages/engine/src/stairs.ts:117-118`, `h = H ÷ N` sai do croqui: N é o número de linhas
  de espelho **gravadas** e H é o desnível lido dos níveis. Subir o nível de topo aumenta H e h sem tocar no croqui, e o
  piso desenhado não é recalculado pela regra do tipo (2R + T) — a escada fica inválida ou com o piso fora da fórmula.
  O Revit recalcula o piso pelo Stair Calculator; o ArchiCAD estica/encolhe os lances com o Lock Baseline desligado
  (A-revit §1; C-archicad §2).
- **Erro apagava a geometria.** Em `packages/render/src/model3d/stairSolids.ts:262`, qualquer issue `error` — inclusive
  `stair-riser-too-high`, que é consequência de uma edição de nível — descartava o corpo inteiro. A escada sumia do 3D
  e do picking: não havia como selecioná-la para corrigir, e o aviso não apontava para nada visível.
- **Rampa sem regeneração.** No modo `slope`, o comprimento era gerado na criação e não era refeito ao mudar o nível;
  a inclinação resultante deixava de ser a alvo e o aviso `ramp-slope-differs` (`packages/engine/src/ramps.ts:210-219`)
  só acusava depois do fato, sem caminho de correção em um passo.

## 2 · Decisões

| # | Decisão | Motivo |
|---|---|---|
| 1 | **O topo é uma referência estável por id.** A criação pela ferramenta materializa `topLevelId` no nível que é o topo naquele momento (`opts.topLevelId ?? levelAbove(p, levelId)?.id ?? null`); `levelAbove` passa a ser usado só na criação e no momento de fixar um topo automático antes de mexer na estrutura de níveis. `null` fica reservado a arquivo antigo ainda não editado e a "sem nível acima" (topo = base + `height`) | Revit: Top Level é um parâmetro com valor, não "o nível de cima" recalculado (A-revit §1, S8); ArchiCAD: Stair Toplink prende o topo a um andar (C-archicad §1/§6) |
| 2 | **`Stair.riserMode?: 'auto' \| 'fixed'`** (ausente = `auto`). `auto` recalcula o nº de espelhos (`N = max(N, ceil(H ÷ maxRiser))`), o piso pela fórmula do tipo e **continua a escada no último lance**; `fixed` mantém o desenho e aceita o aviso/erro de norma | Revit: Desired Number of Risers derivado da altura e Stair Calculator (2R + T); ArchiCAD: "Continue Stair" / lances esticam com o Lock Baseline desligado (A-revit §1; C-archicad §2) |
| 3 | **O reajuste automático recalcula N e acrescenta os degraus no último lance.** `refitStairToHeight` (`packages/engine/src/stairRefit.ts`) faz `N = max(N_atual, ceil(H ÷ maxRiser))`, calcula `R = H ÷ N` e `T` pela regra do tipo (`a·R + b·T`, alvo/faixa, limitado a `[minTread, maxTread]`), estica os lances existentes para `T` e acrescenta `N − N_atual` espelhos **no fim do último lance**, deslocando o fim dele e os componentes seguintes. Se o último lance for caracol/leque, continua com um **lance reto novo** emendado no último espelho. Nunca remove espelhos; o primeiro espelho e a largura/patamares/giros são preservados | É o comportamento de "continuar a escada" do Revit/ArchiCAD; alcança o nível sem deixar o espelho crescer acima do máximo e sem espremer os pisos |
| 4 | **Editar a cota de um nível é planejar e decidir, não aplicar e corrigir.** `planLevelMove` calcula os componentes propostos sem gravar; se todos couberem, `applyLevelMove` aplica cota + escadas/rampas numa transação. Se houver conflito, **nada é aplicado** e o diálogo pergunta: acrescentar no último lance, cancelar a mudança ou excluir o elemento. "Excluir" também é um único Ctrl+Z | A cota é o datum do usuário; se a escada não couber, ele decide — e não descobre depois que a cota mudou |
| 5 | **Erro não apaga a geometria.** A malha 3D só é omitida quando não há degraus; nesse caso sai um corpo-placeholder fino do retângulo do croqui, apoiado na base, para a escada continuar visível e selecionável. Com degraus, a geometria é desenhada mesmo com issue `error`; o erro fica no painel de avisos e no validador | O aviso normativo é informação, não um comando de exclusão; sumir com o elemento impede a correção e contraria o "não bloquear" da decisão 0011 #10 |
| 6 | **Rampas:** no modo `slope`, mudar o nível (ou o desnível) **regenera o comprimento** para manter a inclinação alvo; no modo `length`, o comprimento desenhado manda, a rampa é mantida e o aviso `ramp-slope-differs` aponta a inclinação resultante | ArchiCAD: comprimento/altura são recalculados pelos offsets de Home Story e Toplink; o usuário escolhe o que manda (C-archicad §2) |
| 7 | **Interface:** o painel de propriedades da escada ganha o campo "Espelhos" (Automático/Fixo); a edição da cota no painel do nível (`LevelProps`), na tabela de níveis e na cota de nível da vista (`NivelCotaEditor`) passa por `moveLevel`; o conflito abre o diálogo `LevelMoveConflictDialog` com as três decisões | O modo e a decisão precisam estar visíveis onde a altura é editada |

## 3 · Modelo (packages/model)

- `Stair.riserMode?: 'auto' | 'fixed'` em `packages/model/src/stairTypes.ts`. Campo **opcional**: arquivo antigo abre
  como `auto` e não há `SCHEMA_VERSION` nova por causa dele.
- `topLevelId` materializado na criação pela ferramenta: `draftStair` (`packages/tools/src/stairCommands.ts`) e
  `draftRamp` (`packages/tools/src/rampCommands.ts`) usam `opts.topLevelId ?? levelAbove(p, levelId)?.id ?? null`;
  `createStairFromComponents` e `createRampFromPlan` gravam o id. O croqui criado é preservado (o reajuste pela fórmula
  só acontece quando a altura muda depois, em `moveLevel`/`patchStairs`).
- Arquivos antigos com `topLevelId: null` continuam lendo o nível acima até a primeira edição de nível (ou inserção de
  nível), que fixa o id (`pinAutoTops`) antes de mexer na estrutura. A remoção de um nível continua liberada quando o
  topo é automático (`deleteLevel`), como em `stair.test.ts`.
- `refitStairToHeight(p, s)` (`packages/engine/src/stairRefit.ts`) devolve os componentes com N recalculado (`ceil(H ÷ maxRiser)`), os lances existentes esticados para `T` e os degraus novos no último lance (`added`), ou `skipped: 'fixed' | 'no-height' | 'unsupported-shape' | 'no-change' | ...`. O primeiro espelho e a largura/patamares/giros são preservados; só o fim da escada cresce. `treadFor`/`treadRuleOf` são a mesma conta da regra do tipo.
- `applyElementLevel` (`packages/model/src/elementLevel.ts`) só troca o nível/cota; o planejamento/reajuste é feito pelo editor (`planLevelMove`/`moveLevel`/`moveToLevel`), que vê o projeto já com a nova cota e grava componentes e nível na mesma transação.

## 4 · Comportamento em cada edição de nível

Todos os casos valem para `moveLevel` (planeja e, sem conflito, aplica numa transação). O resultado vai para a barra de status, por exemplo:
`Nível 2: 2 degraus acrescentados no último lance; 1 escada/rampa reajustada. Ctrl+Z desfaz.` Cada parte só aparece quando ocorre.

| Edição | Escada `auto` | Escada `fixed` | Rampa `slope` | Rampa `length` |
|---|---|---|---|---|
| **Subir o topo** (o nível de topo sobe) | H cresce; `N = max(N, ceil(H÷max))`; R e T recalculados; os lances vão para `T` e os **degraus novos entram no último lance**. Se a extensão invadir parede, abre o diálogo (acrescentar/cancelar/excluir) | H cresce; croqui intacto; `stair-riser-too-high` e `stair-risers-count` | Comprimento regenerado para manter `slopeTarget` | Comprimento mantido; inclinação sobe; `ramp-slope-differs` |
| **Subir a base** (o nível da escada sobe) | H diminui; N mantido; R e T recalculados; os lances encolhem/esticam | Idem | Comprimento regenerado (mais curto) | Comprimento mantido; inclinação desce; `ramp-slope-differs` |
| **Inverter** (a base passa acima do topo) | H ≤ 0: conflito; a cota **não é aplicada** sem decisão. Com "acrescentar", a escada fica sem altura válida, visível/selecionável (placeholder); com "excluir", sai no mesmo passo | Idem | `ramp-top-not-above`; segue a mesma decisão | Idem |
| **Inserir nível no meio** (novo nível entre base e topo) | `pinAutoTops` fixa o topo no nível que era o de cima **antes** de criar o nível; o novo nível não sequestra o topo nem muda H | Idem | Idem | Idem |
| **Baixar o topo** ou **baixar a base** | H diminui; N mantido; T aumenta dentro de `maxTread`; os lances encolhem/esticam | Idem | Comprimento regenerado (mais curto) | Comprimento mantido; `ramp-slope-differs` |

Quando há conflito, o diálogo mostra o N antes/depois, os degraus acrescentados, o novo espelho/piso e o motivo (parede, forma,
sem altura). "Acrescentar no último lance" força a extensão (o aviso de invasão continua); "Cancelar" não grava nada; "Excluir"
remove só os elementos em conflito. A cota do nível só é gravada depois da escolha.

Com "manter altura" (`moveLevel(..., keepHeights = true)`, disponível na API e ainda sem controle na tela), os offsets
de base/topo são compensados no mesmo passo para as cotas absolutas não mudarem; nesse modo não há reajuste de espelhos
nem regeneração de rampa.

## 5 · Política de falha

- **Nada é apagado nem escondido por causa de um erro de norma.** A escada/rampa inválida permanece no modelo, na
  lista, no painel de avisos (com "Ir para"), na planta (caixa do croqui, quando não há degraus) e no 3D (geometria
  existente ou corpo-placeholder). O status informa a contagem.
- **Erro de geometria continua local.** Erro de croqui deixa sem degraus só o lance afetado (decisão 0011 §3); o corpo
  placeholder só aparece quando a escada inteira não tem degraus.
- **Rampa que não pôde ser regenerada** (forma inválida para o novo desnível) entra no plano como conflito; nada é
  aplicado até a escolha do usuário.
- **Escada que não pôde ser continuada** (caracol/leque sem lance reto, croqui inválido, sem altura) entra como conflito;
  o diálogo oferece acrescentar, cancelar ou excluir. O aviso de norma continua valendo.
- **A cota só muda depois da decisão.** Em conflito, o plano é calculado no projeto proposto (sem gravar); "cancelar"
  mantém a cota e os elementos exatamente como estavam.
- **Desfazer** devolve cota, lances, comprimento e offsets no mesmo passo, porque tudo ocorre dentro de uma transação.

## 6 · Fora de escopo

- **Remover** degraus quando H diminui (N só cresce; o desenho existente é preservado).
- Esticar caracol/leque por transformação afim; nesses casos a continuação é um lance reto novo ou ajuste manual.
- Vínculo de escada/rampa a vários níveis (multistory, decisão 0011 #13) e propagação de mudança de nível para
  guarda-corpo (etapa própria).
- Editar a cota de um nível durante a edição do croqui: a ferramenta continua fechando antes.
- Reajuste de paredes, lajes e telhados na mesma transação (cada um tem a sua regra de topo/altura).

## 7 · Critérios de aceitação

- `refitStairToHeight`: recalcula `N = max(N, ceil(H ÷ maxRiser))`, estica os lances para `T`, acrescenta os degraus no
  último lance (reta/L/U) ou num lance reto novo (caracol/leque), preserva o primeiro espelho e não reduz N
  (`packages/engine/src/stairRefit.test.ts`).
- `moveLevel`/`planLevelMove`: subir o topo acrescenta degraus em um passo de desfazer; conflito de parede/h≤0 **não
  aplica a cota** e oferece acrescentar/cancelar/excluir; "manter altura" preserva a cota; rampa `slope` regenera e
  mantém `slopeTarget` (`apps/web/src/editor/levelActions.test.ts`).
- `riserMode`: ausente lê `auto`; o campo aparece no painel e a opção `fixed` é gravada
  (`apps/web/src/ui/stairRiserMode.test.ts`).
- 3D: escada com issue `error` e degraus gera malha; sem degraus gera o placeholder; sem croqui, nada
  (`packages/render/src/model3d/stairSolids.test.ts`).

## 8 · Fontes

- `docs/escadas/A-revit-componente.md` §1: **Base Level**, **Top Level** (padrão = nível acima, Unconnected sem nível
  acima), **Desired Number of Risers** (derivado da altura entre níveis), **Actual Number of Risers** (pode diferir),
  **Actual Riser Height ≤ Maximum Riser Height** e **Actual Tread Depth** (Stair Calculator, 2R + T).
- `docs/escadas/C-archicad.md` §2 e §6: base no Home Story e topo no Stair Toplink, com offsets; com o **Lock Baseline
  desligado**, os lances **esticam ou encolhem** para acomodar a mudança de altura; mudança pequena mantém o nº de
  espelhos e os espelhos crescem dentro da regra; mudança grande deixa a escada inválida até ajustar o offset e, se
  preciso, o nº de espelhos; **Continue Stair** continua a escada a partir do fim.
