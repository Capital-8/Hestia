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

## Exceções vigentes (TODO)

- Ferramentas com núcleo próprio: perímetro (piso, laje, forro, telhado), escada, lance livre, rampa, seta de
  caimento, inclinação de laje, extrusão de telhado, cota angular.
- Painel: `GuardaCorpoProperties.tsx` (migração para `TypeSelector` em andamento).
