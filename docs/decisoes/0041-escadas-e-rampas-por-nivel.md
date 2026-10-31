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
- **Espelho derivado.** Em `packages/engine/src/stairs.ts:117-118`, `h = H ÷ N` sai do croqui: N é o número de linhas
  de espelho **gravadas** e H é o desnível lido dos níveis. Subir o nível de topo aumenta H e h sem tocar no croqui, e h
  pode passar do `maxRiser` do tipo — o Revit reajusta o nº de espelhos nesse caso (A-revit §1, "Desired/Actual Number
  of Risers"); aqui a escada apenas ficava inválida.
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
| 2 | **`Stair.riserMode?: 'auto' \| 'fixed'`** (ausente = `auto`). `auto` reajusta o croqui quando `h = H ÷ N` passa do máximo do tipo; `fixed` mantém o croqui e aceita o aviso/erro | Revit separa "Desired" de "Actual Number of Risers" e avisa quando o real excede o máximo (A-revit §1; C-archicad §2: pequena mudança mantém N, grande exige reajuste) |
| 3 | **O reajuste automático só acrescenta espelhos interiores.** `stairFitPatch` (`packages/model/src/stairFit.ts`) calcula o alvo `ceil(H ÷ maxRiser)`, distribui os espelhos novos entre os lances proporcionalmente ao nº de espelhos de cada um e **nunca toca no primeiro nem no último espelho de um lance** (os limites da escada e as emendas ficam onde estão). Não remove espelhos: subir a base ou baixar o topo só diminui h | Preserva o croqui desenhado pelo usuário; no Revit o nº de espelhos é derivado da altura entre níveis (A-revit §1), e aqui o desenho manda no que é possível manter |
| 4 | **Editar a cota de um nível é uma operação de projeto em uma transação** (`moveLevel`, `apps/web/src/editor/levelActions.ts`): fixa os topos automáticos no nível que era o de cima, aplica a cota, reajusta as escadas e regenera as rampas dependentes, tudo em um passo de desfazer, e informa o resultado na barra de status | Revit: mudar o nível regenera os dependentes; ArchiCAD: mudança de altura do andar reajusta a escada (C-archicad §2/§6) |
| 5 | **Erro não apaga a geometria.** A malha 3D só é omitida quando não há degraus; nesse caso sai um corpo-placeholder fino do retângulo do croqui, apoiado na base, para a escada continuar visível e selecionável. Com degraus, a geometria é desenhada mesmo com issue `error`; o erro fica no painel de avisos e no validador | O aviso normativo é informação, não um comando de exclusão; sumir com o elemento impede a correção e contraria o "não bloquear" da decisão 0011 #10 |
| 6 | **Rampas:** no modo `slope`, mudar o nível (ou o desnível) **regenera o comprimento** para manter a inclinação alvo; no modo `length`, o comprimento desenhado manda, a rampa é mantida e o aviso `ramp-slope-differs` aponta a inclinação resultante | ArchiCAD: comprimento/altura são recalculados pelos offsets de Home Story e Toplink; o usuário escolhe o que manda (C-archicad §2) |
| 7 | **Interface:** o painel de propriedades da escada ganha o campo "Espelhos" (Automático/Fixo), com o texto de ajuda; a edição da cota no painel do nível (`LevelProps`), na tabela de níveis e na cota de nível da vista (`NivelCotaEditor`) passa por `moveLevel` | O modo precisa estar visível onde a altura é editada, não escondido no tipo |

## 3 · Modelo (packages/model)

- `Stair.riserMode?: 'auto' | 'fixed'` em `packages/model/src/stairTypes.ts`. Campo **opcional**: arquivo antigo abre
  como `auto` e não há `SCHEMA_VERSION` nova por causa dele.
- `topLevelId` materializado na criação pela ferramenta: `draftStair` (`packages/tools/src/stairCommands.ts`) e
  `draftRamp` (`packages/tools/src/rampCommands.ts`) usam `opts.topLevelId ?? levelAbove(p, levelId)?.id ?? null`;
  `createStairFromComponents` e `createRampFromPlan` gravam o id. O croqui criado é preservado (o reajuste de espelhos
  só acontece quando a altura muda depois, em `moveLevel`/`patchStairs`).
- Arquivos antigos com `topLevelId: null` continuam lendo o nível acima até a primeira edição de nível (ou inserção de
  nível), que fixa o id (`pinAutoTops`) antes de mexer na estrutura. A remoção de um nível continua liberada quando o
  topo é automático (`deleteLevel`), como em `stair.test.ts`.
- `stairFitPatch(p, s)` devolve `{ components }` ou `null` (nada a fazer, modo `fixed`, sem tipo, sem espelhos ou
  H ≤ 1 mm). `desiredRiserCount(H, maxRiser)` é a mesma conta do aviso `stair-risers-count`.
- `applyElementLevel` (`packages/model/src/elementLevel.ts`) reajusta a escada na mesma operação quando o novo nível
  muda o desnível, para "Mover para o nível" não deixar o espelho acima do máximo.

## 4 · Comportamento em cada edição de nível

Todos os casos valem para `moveLevel` (uma transação, um Ctrl+Z). O resultado vai para a barra de status, por exemplo:
`Nível 2: 1 escada/rampa reajustada à nova altura; 1 ficou sem altura válida (veja os avisos). Ctrl+Z desfaz.` Cada
parte da mensagem só aparece quando ocorre.

| Edição | Escada `auto` | Escada `fixed` | Rampa `slope` | Rampa `length` |
|---|---|---|---|---|
| **Subir o topo** (o nível de topo sobe) | H cresce; entram espelhos interiores até `h ≤ maxRiser` | H cresce; croqui intacto; `stair-riser-too-high` e `stair-risers-count` | Comprimento regenerado para manter `slopeTarget` | Comprimento mantido; inclinação sobe; `ramp-slope-differs` |
| **Subir a base** (o nível da escada sobe) | H diminui; N e croqui intactos; h diminui (não remove espelhos) | Idem | Comprimento regenerado (mais curto) | Comprimento mantido; inclinação desce; `ramp-slope-differs` |
| **Inverter** (a base passa acima do topo) | H ≤ 0: `stair-top-not-above`; a escada **continua no projeto**, visível/selecionável (placeholder) e contada como "sem altura válida" | Idem | `ramp-top-not-above`; a rampa continua no projeto | Idem |
| **Inserir nível no meio** (novo nível entre base e topo) | `pinAutoTops` fixa o topo no nível que era o de cima **antes** de criar o nível; o novo nível não sequestra o topo nem muda H | Idem | Idem | Idem |
| **Baixar o topo** ou **baixar a base** | H diminui; h diminui; nada a reajustar (o reajuste só acrescenta) | Idem | Comprimento regenerado (mais curto) | Comprimento mantido; `ramp-slope-differs` |

Com "manter altura" (`moveLevel(..., keepHeights = true)`, disponível na API e ainda sem controle na tela), os offsets
de base/topo são compensados no mesmo passo para as cotas absolutas não mudarem; nesse modo não há reajuste de espelhos
nem regeneração de rampa.

## 5 · Política de falha

- **Nada é apagado nem escondido por causa de um erro de norma.** A escada/rampa inválida permanece no modelo, na
  lista, no painel de avisos (com "Ir para"), na planta (caixa do croqui, quando não há degraus) e no 3D (geometria
  existente ou corpo-placeholder). O status informa a contagem.
- **Erro de geometria continua local.** Erro de croqui deixa sem degraus só o lance afetado (decisão 0011 §3); o corpo
  placeholder só aparece quando a escada inteira não tem degraus.
- **Rampa que não pôde ser regenerada** (forma inválida para o novo desnível) não é alterada e entra na mensagem como
  "rampa não pôde ser regenerada"; o aviso da resolução continua valendo.
- **Desfazer** devolve cota, espelhos, comprimento e offsets no mesmo passo, porque tudo ocorre dentro de uma transação.

## 6 · Fora de escopo

- Reajuste automático que **remova** espelhos ao diminuir H (o croqui do usuário é preservado).
- Vínculo de escada/rampa a vários níveis (multistory, decisão 0011 #13) e propagação de mudança de nível para
  guarda-corpo (etapa própria).
- Editar a cota de um nível durante a edição do croqui: a ferramenta continua fechando antes.
- Reajuste de paredes, lajes e telhados na mesma transação (cada um tem a sua regra de topo/altura).

## 7 · Critérios de aceitação

- `stairFitPatch`: acrescenta espelhos até `h ≤ maxRiser`, preserva primeiro/último de cada lance, respeita `fixed` e
  devolve `null` quando nada muda (`packages/model/src/stairFit.test.ts`).
- `moveLevel`: subir o topo reajusta em um passo de desfazer; inverter deixa a escada inválida e existente; "manter
  altura" preserva a cota; rampa `slope` regenera e mantém `slopeTarget` (`apps/web/src/editor/levelActions.test.ts`).
- `riserMode`: ausente lê `auto`; o campo aparece no painel e a opção `fixed` é gravada
  (`apps/web/src/ui/stairRiserMode.test.ts`).
- 3D: escada com issue `error` e degraus gera malha; sem degraus gera o placeholder; sem croqui, nada
  (`packages/render/src/model3d/stairSolids.test.ts`).

## 8 · Fontes

- `docs/escadas/A-revit-componente.md` §1: **Base Level**, **Top Level** (padrão = nível acima, Unconnected sem nível
  acima), **Desired Number of Risers** (derivado da altura entre níveis), **Actual Number of Risers** (pode diferir) e
  **Actual Riser Height ≤ Maximum Riser Height**.
- `docs/escadas/C-archicad.md` §2 e §6: base no Home Story e topo no Stair Toplink, com offsets; mudança **pequena** de
  altura mantém o nº de espelhos e os espelhos crescem dentro da regra; mudança **grande** deixa a escada inválida até
  ajustar o offset e, se preciso, o nº de espelhos.
