# 31 · Quadro de esquadrias, folga de assentamento e transpasse de verga

Data: 2026-11-18. Cobre os itens 1.3 e 1.4 da fase 1 da síntese (`00-sintese.md` §4). Base normativa: `05-normas-e-mercado-brasil.md`, §6.1 (folga), §6.2 (verga) e §7.2 (colunas do quadro). Espelhamento: `02-lapin.md`. Tags de confiança como nos demais documentos.

## 1. O que mudou

- **Quadro executivo** (opt-in: botão "Quadro executivo" no diálogo e parâmetro `executivo` no CSV). Acrescenta contorno real, perímetro, quantidade por tipo, espelhada, sistema de assentamento e folga, vidro, ferragens por unidade e total, observações e as peças do quadro de peças (`buildOpeningPartsSchedule`, antes não ligado).
- **Espelhadas em linha própria**, só no quadro executivo (ver §4).
- **Folga de assentamento por sistema** (campo opcional no tipo) e **aviso de transpasse de verga** abaixo do mínimo de referência. O aviso não bloqueia: "o estrutural prevalece".
- **Persistência**: quatro campos opcionais no tipo (`settingSystem`, `settingClearance`, e o `lintel.over` que já existia). Projetos antigos carregam sem mudança; há teste de round-trip (JSON → `migrateProject` → igual).

## 2. Compatibilidade: o que não mudou

- **Folga zero por padrão.** O código já usava zero: `roughOversize` ausente vale 0 (`openingRough`). Sem `settingSystem`, o vão bruto é o de antes. Nenhum número de projeto existente muda.
- **Quadro e CSV padrão** continuam com as 21 colunas e uma linha por tipo e medida. O teste existente `openingSchedule.test.ts` fixa o cabeçalho, a linha de total e os quatro sentidos de `ot_pgiro80` numa linha só. Por isso a separação de espelhadas e as colunas novas ficam atrás do modo executivo.
- Testes existentes de `openingSchedule`, `openingScheduleOverride`, `openingNominal`, `openingCatalogo`, `contratoCamposEsquadria` e o diálogo: verdes sem alteração de expectativa (o guarda de campos ganhou só os leitores dos dois campos novos).

## 3. Folga de assentamento e transpasse de verga

| Item | Valor | Fonte | Status |
|---|---|---|---|
| Sistema `grapa` (folga por lado) | 0,005 m | manual MGM: ~0,5 cm por lado | [FABRICANTE] |
| Sistema `espuma` (sem contramarco) | 0,020 m | manual MGM: ~2 cm por lado | [FABRICANTE] |
| Sistema `contramarco` | 0,025 m | manual MGM: 25 mm | [FABRICANTE] |
| Contramarco SINAPI | 1 cm no topo e laterais | SINAPI via orcamentor | [VERIFICADO-RESUMO], **não adotado** como padrão |
| Contramarco Hydro | 3 a 5 cm | manual Hydro, unidade não clara | [CONFLITO], **não adotado** |
| Vão bruto | largura e altura + `roughOversize` + **2 × folga por lado**, nos dois eixos | doc 05 §6.1 | [INFERIDO] |
| Transpasse mínimo de referência da verga | **0,20 m** por lado | atribuído à NBR 8545 (texto não lido) | [CONFLITO] com a prática SINAPI de 0,30 m |
| Transpasse padrão do modelo | 0,30 m (já existia) | doc 05 §6.2 | [VERIFICADO-RESUMO] |

Decisões:

- O sistema define a folga; `settingClearance` (m, por lado) sobrescreve. O valor digitado igual ao padrão do sistema tira o campo, que volta à leitura por padrão. Sem sistema, a folga é zero.
- O mínimo do transpasse foi escolhido em 0,20 m porque é o único valor que a fonte apresenta como mínimo. O 0,30 m é prática, e já é o padrão. Se o projeto estrutural pedir outro número, o aviso é o lembrete; o cálculo estrutural prevalece.
- Não usei o valor do SINAPI nem o da Hydro como padrão. O usuário digita a folga do fabricante escolhido.
- Não há regra de transpasse em alvenaria estrutural (NBR 15961, doc 05 §6.2, [NÃO ENCONTRADO]). O aviso vale para verga comum.

## 4. Espelhadas

Uma esquadria é **espelhada** quando `flipHand` e `flipFacing` são diferentes: espelho em um eixo. Os dois eixos iguais é o tipo girado 180°, que não é espelho. A regra vem do Lapin (`Joinery.IsMirrored`: `flipHand != flipSide`, `02-lapin.md` §3). [INFERIDO]: o Hestia não tem o tipo como referência de sentido, então a regra é aplicada por instância.

No quadro executivo, espelhadas formam linhas próprias com `count` separado. A quantidade por tipo (`typeCount`) soma todas as medidas e espelhos, e o total do quadro não muda.

## 5. Colunas do quadro executivo

Colunas acrescentadas ao **fim** do CSV, depois das opcionais já existentes, na ordem abaixo. Só aparecem com `executivo: true`.

| Coluna | Conteúdo | Origem |
|---|---|---|
| Área do contorno unitária (m²) | área real do contorno do vão (forma quando há; W×H sem forma) | `contornoDoVao` |
| Área do contorno total (m²) | unitária × quantidade | idem |
| Perímetro do contorno (m) | perímetro do contorno | idem |
| Quantidade do tipo | instâncias do tipo, todas as medidas e espelhos | soma |
| Espelhada | Sim/Não | `flipHand` ≠ `flipFacing` |
| Sistema de assentamento | Grapa, Espuma expansiva, Contramarco ou vazio | `settingSystem` |
| Folga de assentamento por lado (cm) | efetiva (campo ou sistema) | `openingSettingClearance` |
| Vidro | tipo e espessura (ex.: "Temperado 10 mm") | `glassKind`, `glassThickness`; janela sem tipo é "Liso" |
| Dobradiças por esquadria / total | quantidade pela família | `openingHinges` (só se a família oferece) |
| Maçanetas por esquadria / total | 0 ou 1 | `openingHandle` (só se a família oferece) |
| Observações | desvio, composição e descrição do tipo | `variant`, `composition`, `description` |
| Batente e soleira, alizar, folha (m³), vidro (m²), vidro total (m²) | peças do quadro de peças, por esquadria; vidro também total | `buildOpeningPartsSchedule` |

Totais no CSV: área do contorno total, vidro total, dobradiças total e maçanetas total. Os demais ficam vazios.

**Do modelo de §7.2 não atendido** (sem campo no modelo): acabamento/cor, local/ambiente e "detalhe nº" (prancha). Ficam como pendência.

## 6. Achados

1. **`areaDoVaoDoTipo` só usa o contorno com cliente de furo instalado** (`furoContornoParede.ts`). Sem cliente, a coluna "Área unitária" do quadro padrão ainda é W×H para vão com forma. O quadro executivo calcula o contorno direto, então os dois quadros podem divergir para forma. Não alterei o padrão, para não mudar números existentes.
2. **A folga de assentamento entra no furo.** `openingRough`, `openingShapeOf`, `formaDoVao` e o `folga_w`/`folga_h` do kernel A3 usam a mesma folga. Tipos sem sistema seguem iguais.
3. **Vão normalizado.** Para tipo com `nominalRef: 'leaf'`, o vão é folha + folga (`spanTypeOf`). Quem passa o tipo cru a `openingRough` lê a largura da folha. Isso já era assim; os testes novos usam o vão normalizado.
4. **Peças por medida, não por espelho.** `buildOpeningPartsSchedule` agrupa por tipo, altura e peitoril, e mede na primeira instância. As espelhadas recebem as mesmas peças do grupo. Premissa: a peça não depende do sentido de abertura.
5. **Commit alheio.** O commit `16697d9` (agente A2) incluiu alterações desta tarefa que já estavam gravadas no disco: `openingTypes.ts`, `openingExtras.ts`, `openingShapeOf.ts`, `furoContornoDespacho.ts`, `kernelA3.ts`, `openingScheduleExec.ts` e outros. Nada foi commitado por mim. Quem reverter precisa olhar o `HEAD` antes.
6. **i18n do quadro executivo.** Os rótulos do engine (colunas, sistemas e vidros) estão em `openingScheduleExec.ts`, em pt e en; idiomas sem tradução caem para en. Não entraram nos shards `packages/engine/src/i18n.ts` e `apps/web/src/editor/i18n/areas/packages-engine-schedules.ts`, cujo comentário pede paridade. Pendência: traduzir para es, de, fr, it e pl.
7. **Avisos e rótulos do web** (aviso da verga, botão, campos do tipo) têm 7 idiomas. O aviso da verga usa a chave `md_lintel_over_short` do model.
8. **`openingSchedule.ts` cresceu para 456 linhas.** A parte nova do quadro está em `openingScheduleExec.ts` (320 linhas).

## 7. Testes e verificação

- Novos: `packages/engine/src/openingScheduleExec.test.ts` (10 casos: padrão intacto, espelhadas, quantidade por tipo, contorno retangular e com arco, peças, ferragens, sistema e vão bruto, sem sistema, CSV com colunas ao fim e número de células igual, totais), `packages/model/src/openingSettingRoundtrip.test.ts` (round-trip, tipo antigo, folga e validação, aviso da verga), `apps/web/src/ui/dialogs/openingType/settingControls.test.ts` (controles).
- Áreas (vitest, sem a suíte inteira): `model/opening*`, `model/contrato*`, `model/esquema*`, `engine/opening*`, `engine/furoContorno*`, `engine/kernel*`, `engine/vaoContorno*`, `engine/resolve*`, `io/ifc` de abertura e exportação, `web/dialogs/opening*` e `web/dialogs/OpeningSchedule*`: 98 arquivos e 1242 testes verdes, antes do último ajuste dos controles. Depois dele, rodei de novo os três arquivos de controles: verdes.
- `tsc` do projeto: sem erros na última rodada.
- eslint nos arquivos alterados: limpo. `check-boundaries`: ok.
- Não rodei `check-parity`, `check-i18n`, `check-units` nem `check-props-density` (fora do pedido). A paridade de i18n do web e do engine é a pendência do item 6.

## 8. Fora do escopo

- Colunas de acabamento/cor, local e detalhe nº (sem campo no modelo).
- Totais executivos na tela (hoje só no CSV).
- Traduções do quadro executivo para es, de, fr, it e pl.
- Transpasse em alvenaria estrutural (NBR 15961) e em verga pré-moldada com regra própria.
