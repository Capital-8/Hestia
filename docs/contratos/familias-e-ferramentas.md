# Contrato de famílias e ferramentas

Regras permanentes. Cada regra tem um teste-guarda que falha se alguém criar ferramenta ou painel fora do padrão.

## Regra 1. Ferramenta de criação linear ou polilinha usa o núcleo comum de desenho

Toda ferramenta que cria elemento linear ou polilinha (parede, guarda-corpo, linha de detalhe, linha de separação,
região, cota, eixo, corte...) traça pelo módulo `packages/tools/src/desenhoPolilinha.ts`. Ele garante, sem duplicar:

- snaps (extremidade, ponto médio, interseção, perpendicular, grade, CAD);
- Orto (F8) e Polar (F10) a partir do último ponto (`contextoDeTraco(ultimoPonto)` repassa o `from` ao `infer`);
- rastreios e alinhamentos;
- comprimento digitado + Enter (`lerComprimentoDigitado`, `pontoPorComprimento`, `RascunhoPolilinha.pontoDigitado`);
- prévia elástica e cota dinâmica do trecho (`tempDims`, mesmo provedor da parede);
- encadeamento de segmentos, Enter conclui, C fecha, Esc cancela.

Ferramenta nova: importe `./desenhoPolilinha.ts`, passe o último ponto como `from` em todo `this.snap(...)` e inclua
a ferramenta em `LINEARES` no teste-guarda. Se o núcleo não servir, estenda o núcleo, não copie.

Teste-guarda: `packages/tools/src/contratoFerramentas.test.ts` (classifica todo `ToolId` do registro; falha para
ferramenta nova sem classificação ou linear que não importa o núcleo). Exceções são listadas com TODO nele.

## Regra 2. Painel de propriedades de família usa o cabeçalho de tipo da parede

Todo painel de elemento com família/tipo abre com `TypeSelector` (seletor de tipo e, logo abaixo, o botão
"Editar tipo", via `onEdit`), igual ao painel da parede. Nada de `<select>` solto de tipo.

Teste-guarda: `apps/web/src/ui/contratoPaineisFamilia.test.ts` (falha para `*Properties.tsx` novo sem classificação
ou painel de família sem `TypeSelector` e `onEdit`).

## Regra 3. Todo kind de elemento entra nas ferramentas de modificação

Elemento novo (`kind` em `Element`) tem de funcionar com mover, copiar, girar, espelhar, matriz, alinhar, deslocar,
aparar/estender, dividir, apagar, copiar/colar entre pavimentos, desfazer/refazer, alças e propriedades em lote, igual
às paredes. Pelo mecanismo genérico, sem caso especial:

- **Transformar:** o comando `transform` (`packages/model/src/commands.ts`) leva o kind; a seleção entra por
  `selectedMovables` (`packages/tools/src/edit.ts`), os ids da cópia por `makeIdMap`, o fantasma por `ghostBands`.
- **Copiar/colar:** campo próprio no `ClipBuffer` (`clipboard.ts`) e no colar por níveis (`pasteLevels/command.ts`).
- **Alinhar:** feição em `alignFeatures.ts` (política `transladar` para o que se move; `nenhum` para só referência).
- **Elemento hospedado** (guarda-corpo em escada ou rampa): segue o hospedeiro. Mover, girar, espelhar ou copiar o
  hospedeiro leva o hospedado junto (a cópia vem com o hospedeiro remapeado). Sozinho ele **não** se move: a
  ferramenta recusa com a mensagem `tl_msg_railing_hosted_locked` e nada muda (ADR 0055 §25).

Teste-guarda: `packages/tools/src/contratoModificacao.test.ts`. `CLASSIFICACAO` é um `Record<Element['kind'], ...>`:
um kind novo sem linha **não compila**; cada marca tem de apontar código que existe e `null` exige o motivo (TODO).

## Regra 4. Modal de tipo de família usa o esqueleto comum (o da parede)

Todo diálogo de edição de tipo (parede, escada, rampa, piso, laje, forro, telhado, guarda-corpo, cota, esquadria...)
monta-se com os componentes compartilhados de `apps/web/src/ui/dialogs/familia/`:

- `FamilyTypeDialog`: cabeçalho Família/Tipo (Duplicar, Renomear), Nome do tipo na mesma linha do rótulo e rodapé
  Excluir | Cancelar, Aplicar, OK;
- `FamilyTabs`, `FamilySection` (recolhível, mesma tipografia), `FamilyRow` (rótulo e campo na mesma linha),
  `FamilyCheck` (caixa de seleção), `FamilyPair` (dois campos curtos lado a lado), `FamilyHint` (ajuda compacta),
  `FamilyActions` (fileira de botões), `FamilyReadout` (resultado calculado) e `FamilySplit` (campos e prévia).

Nada de CSS ou estrutura própria de seção/linha (`field-row`, `fieldset`, `details`, `dsec`, `Row` da paleta) nos
diálogos de tipo. Diálogo de tipo novo entra em `MIGRADOS` no teste-guarda; se não der para migrar, vira exceção TODO.

Teste-guarda: `apps/web/src/ui/dialogs/contratoModaisFamilia.test.ts` (classifica todo diálogo de tipo; falha para
diálogo novo sem classificação, migrado sem o esqueleto ou com seção/linha própria, e para exceção obsoleta).

### Alinhamento (uma só grade, definida no CSS `.fam-form` e `.fam-pair`)

- Rótulo numa coluna de largura fixa (`--fam-l`) e controle na coluna ao lado, sempre no mesmo x. O cabeçalho
  Família/Tipo, o Nome do tipo e toda linha usam a mesma coluna de rótulo. Nada de largura de rótulo por diálogo.
- Texto e seletor ocupam a coluna do controle. Número usa a largura padrão do `NumField` (72 px) com a unidade logo ao
  lado; a unidade vem do `NumField` (`unit`), nunca solta no rótulo ou em `<span>` próprio.
- Par (`FamilyPair`): o 1º campo cai no mesmo x das linhas simples; o 2º tem rótulo de largura fixa (`--fam-l2`), então
  todo par tem os controles nos mesmos dois x. Seletor longo (ex.: material) não entra em par: empilhe as linhas.
- Caixa de seleção só por `FamilyCheck`: a caixa fica na coluna do controle (mesmo x dos campos), o texto vai ao lado e a
  coluna do rótulo fica vazia. Nunca `<input type="checkbox">` nem `Check` soltos nos modais de tipo (exceção: caixa dentro
  de célula de tabela, como "Envolve" das camadas). Texto longo quebra dentro da coluna do controle.
- Campo ligado a outro (desligado por um check) usa `dim` na linha (`FamilyRow dim`); o campo também recebe `disabled`.
  Uma só opacidade: nada de `opacity` inline nem `div` envolvendo.
- Toda linha tem a mesma altura mínima (`--fam-rowh`) e o mesmo espaço abaixo. Seção dentro de seção mantém o x das linhas
  (só o título fica mais discreto). Botões do corpo usam `FamilyActions` com `btn small`.
- Escada e guarda-corpo (e as peças deles) não usam `style={{ ... }}`, `<input>`, `<label>` nem classe de linha própria.
  Cor de aviso, negrito e fonte mono vêm de classe (`FamilyHint tone`, `fam-tone`, `fam-mono`).

Teste-guarda: `apps/web/src/ui/dialogs/contratoModaisFamilia.test.ts` (classifica todo diálogo de tipo; falha para
diálogo novo sem classificação, migrado sem o esqueleto ou com seção/linha própria, e para exceção obsoleta) e
`apps/web/src/ui/dialogs/alinhamentoModaisFamilia.test.ts` (alinhamento: sem `style` inline, caixa solta ou linha
própria nos dois modais; grade do CSS; estrutura renderizada de FamilyRow, FamilyCheck e dos modais).

## Regra 5. Não deixar lixo ao implementar

Build Rust com `CARGO_TARGET_DIR` fora do worktree, temporários só no scratchpad ou em `tmp-*`, limpeza ao concluir.
Texto completo em `trabalho-de-agentes.md`. Teste-guarda: `tests/contratoLixo.test.ts` (`scripts/check-lixo.mjs`).

## Exceções vigentes (TODO)

- Ferramentas: nenhuma exceção. Todas as de criação usam o núcleo comum de desenho.
- Painel: nenhuma exceção (o `GuardaCorpoProperties.tsx` já usa o `TypeSelector` com Editar).
- Modal de tipo (regra 4), ainda fora do esqueleto comum (TODO no teste-guarda): `GridTypeDialog` (sem cabeçalho
  Família/Tipo; migrar muda o fluxo do Duplicar), `OpeningTypeDialog` (esquadria: diálogo XL com biblioteca e prévia
  3D) e `DimensionFamiliesDialog` (famílias de cota: editor de lista próprio). Migrados: parede, escada, rampa, piso,
  laje, forro, telhado e guarda-corpo.

Migradas para o núcleo comum: perímetro (piso, laje, forro e telhado traçam por `perimeterTool.ts`), seta de
caimento, inclinação de laje e extrusão de telhado (teste `esbocoNucleo.test.ts`); escada, lance livre, rampa e cota
angular (teste `contratoEscadaRampaCota.test.ts`). Nas ferramentas de dois pontos o comprimento digitado fixa o 2º
ponto na direção do cursor. No lance reto e na rampa reta o valor digitado continua sendo o ângulo.

Modificação (regra 3): exceções explícitas no teste-guarda. Ambiente e CAD não têm feição alinhável; o objeto
importado (`generic`) ainda não é movido pelo `transform` (o Colar translada a malha por conta própria). O Alinhar do
corte (`SectionAlignTool`) só tem alvo parede e abertura, como para escada, laje e forro; o Mover do corte leva o
guarda-corpo manual. Não existem "fixar" e "agrupar" no modelo.
