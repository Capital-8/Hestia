# 40. Prévia do diálogo e lista de tipos com formas

Data: 2026-11-19. Continua `34` (interface das formas), `37` (portas com forma), `38` (verificação visual) e `39` (matriz tipo x forma). Marcas: [V] visto/medido nesta sessão (código lido, teste rodado ou captura lida); [I] inferência ou decisão a validar.

## 1. Relato

(A) "O modal que abre para configurar tem um preview das esquadrias, porém ao mudar para esses formatos específicos o preview se perde e fica apenas o simples. Tem os detalhamentos também." (B) "O preview da janela no menu de propriedades, ao visualizar a lista: os formatos novos não entram lá?"

## 2. Reprodução (artifact reconstruído, Playwright, `?gl=1&debug=1`) [V]

Capturas em `<scratchpad>/shots2/` (`antes-*`, `depois-*`, `final-*`; scripts em `<scratchpad>/pwscripts/dlg.mjs`, `dlg2.mjs`, `dlg3.mjs`, `lista.mjs`).

**A reproduzida.** Aba Elevação do diálogo "Propriedades do tipo":
- `antes-porta-rect-Elevação`: porta almofadada 90 x 210 com batente, 4 almofadas, maçaneta, dobradiças e a linha de abertura (V).
- `antes-porta-round-Elevação`: a mesma porta em arco pleno vira **uma silhueta bege lisa** (contorno do arco, nada dentro).
- `antes-janela-rect-Elevação` x `antes-janela-round-Elevação`: janela de correr com vidro, montantes, aro e linha de correr x **uma mancha azul** em arco.
- `antes-porta-round-Corte`: o corte e os detalhes "Cabeça" e "Soleira" também eram só o perfil do furo (sem batente nem folha).
- A planta e o 3D já mostravam as peças (a planta não depende do contorno; o 3D usa o modelo).

**B reproduzida, em parte.** Os 8 tipos novos **estão** na lista do painel de propriedades e na família certa (`antes-lista-*`: P-86 a P-88 em "Porta de giro"; J-60, J-62, J-63, J-64 em "Janela fixa"; J-61 em "Janela de abrir"), mas a miniatura era o desenho esquemático retangular (`DoorDrawing`/`WindowDrawing` de `TypePreview.tsx`, que só conhece `width x height`): um retângulo com almofadas ou vidro, **sem a forma**. E a forma não era atributo da lista (nem filtro, nem termo de busca).

## 3. Causa e correção

### 3.1 A: a elevação e o corte ignoravam o modelo quando havia contorno [V]

Causa: `drawOpening` (`packages/render/src/section/build.ts`) tinha `if (!model || o.contorno) { preenche o perfil; traça o contorno; return; }`. Com contorno o desenho parava no perfil, mesmo com o `model` (já recortado pelo contorno: `contornoDoModelo`, docs 28 e 37) presente em `SectionOpening`. Era um desvio escrito quando as peças eram caixas retangulares (doc 29), anterior ao recorte das peças.

Correção:
- `build.ts`: só `!model` (lista sintética) cai no perfil. Com contorno e modelo, `outline()` traça o perfil do vão e as peças do MESMO modelo são projetadas (elevação: `projectParts`, que já projeta o prisma `tz` real das peças recortadas pelo arco), com as mesmas cores, hachuras, tracejados e linhas de abertura (V) do retangular. Nada novo no motor, e `packages/engine/src/openingModel*.ts` não foi tocado.
- `perfis.ts` (`projetarComPerfis`, parâmetro novo `fatiaEmT`): no corte transversal de um vão com contorno, a peça recortada (prisma `tz`, cuja caixa é a do arco inteiro) é **fatiada** pelo plano de corte (`t = cutT`), e cada intervalo de z da seção vira um retângulo (s, z). Sem isso, a caixa do arco apareceria como um bloco do tamanho do vão no corte. Só vale quando `o.contorno` existe: o retangular não passa por esse caminho (idêntico).
- Consequência assumida [I]: **vão livre** com forma deixa de ter o preenchimento claro dentro do contorno; passa a ser como o vão livre retangular (miolo aberto, só o aro/contorno). O teste `vaoContorno.test.ts` foi atualizado para isso (as duas asserções de "preenchimento do vão").
- O diálogo, a miniatura da biblioteca de variantes e a elevação do projeto (`computeSection`) usam o mesmo `buildSectionDrawList`; os três ganham as peças. O desenho em tempo real do diálogo (rascunho) atualiza ao mudar forma, flecha ou estilo, porque a prévia é função do rascunho (`previewElevationSvg`, debounce de 60 ms existente).

### 3.2 B: miniatura e atributo "Forma do vão" na lista [V]

- `TypePreview.tsx`: tipo com forma não retangular (`temForma`) usa `ShapedOpeningDrawing`, a elevação do modelo pelo mesmo caminho da prévia do diálogo (`previewMiniatureSvg`, cache por assinatura visual, que já inclui `shape`), sem o `<title>` do SVG no texto do botão. Tipo retangular ou sem forma continua no desenho esquemático de antes (teste: HTML idêntico com `shape: rect` e sem o campo). Vale para o botão do seletor, a lista e a prévia grande (`TypePreview`).
- `typeOptions.ts`/`TypeSelector.tsx`/`typeSelectorModel.ts`: cada opção de abertura leva `shape` (`rect` se ausente) e `shapeLabel` (nome curto no idioma ativo, `openingShapeLabels.ts`). A busca por texto também casa o nome da forma ("arco", "empena"). O menu ganha o filtro **"Forma do vão"** (`<select>` com "Todas as formas" e só as formas presentes; não aparece quando todos os tipos são retangulares ou quando a categoria não é abertura). `filterTypeChoices(items, query, shape)` e `shapesPresent` são puros e testados.
- Família: sem mudança. Os 8 tipos já caem na família do símbolo (P-86 a P-88: giro; J-60, J-62, J-63, J-64: fixa; J-61: abrir), igual ao mapa de famílias esperado pelo motor (`openingCatalogo.test.ts`). Não há "usados no projeto" nesta lista (só favoritos), nada a ajustar.
- i18n: `areas/dialogs-opening-shape-lista.ts` (novo, 7 idiomas): `dsh_short_*` (9 nomes curtos), `dsh_filter_all`, `dsh_mark_*`, `dsh_compat_*`. Fora do shard antigo, que estourava o limite de 420 linhas.

### 3.3 Veredito tipo x forma no seletor de forma do diálogo [V]

Usa a matriz de `packages/model/src/openingShapeCompat.ts` (`shapeCompat`, doc 39; a outra frente a criou durante esta sessão). `dialogs/openingType/shapeVerdict.ts` lê o veredito; `ShapePanel.tsx`:
- cada opção do seletor de forma leva a marca "(⚠ adaptada)" ou "(✕ fixa)" e o motivo da matriz no `title`; as incompatíveis **não são desabilitadas** (continuam escolhíveis, o motor as trata como fixas);
- a forma escolhida com veredito diferente de `ok` mostra um aviso `role="status"` (`#op-shape-compat`, `data-verdict`, `data-rule`) com a mensagem traduzida (adaptada: "as folhas seguem o contorno e podem perder curso ou abertura"; incompatível: "será tratada como fixa. O furo na parede segue a forma") seguida do motivo da matriz.
- [I] O motivo da matriz só existe em português, então vai marcado `lang="pt"` nos outros idiomas; a mensagem principal é traduzida nos 7.
- Captura `final-dialogo-correr-circle`: janela de correr com "Círculo ou elipse (✕ fixa)", aviso em laranja e a prévia já em aro + vidro fixo (modelo do motor com a regra de incompatível).

## 4. Validação visual depois da correção [V]

- `depois-porta-round-Elevação`, `depois-porta-pointed-Elevação`: a porta almofadada em arco pleno e ogival com o aro contínuo, as 4 almofadas, a maçaneta, dobradiças e as linhas de abertura, como no retangular.
- `depois-janela-round-Elevação`, `depois-janela-gable-Elevação`, `depois-janela-circle-Elevação`: vidro, montante central, aro em anel, peitoril e linha de correr, recortados pelo arco, pela empena e pelo círculo.
- `depois-porta-round-Corte`: corte e detalhes passam a mostrar folha e batente (antes, só o perfil do furo).
- `depois-lista-*` e `final-lista-*`: as miniaturas dos 8 tipos desenham a forma e os detalhes; o filtro "Forma do vão" (círculo: só J-63; arco pleno; todas) e a busca "empena" funcionam; `final-prop-botao-apos-escolher-J63`: escolher o óculo pela lista troca o tipo da abertura (`ot_joculo_80x80`) e a miniatura do botão acompanha.
- Console: sem `pageerror`; único erro é o 404 do `resolveWorker` esperado no artifact (doc 38).

## 5. Testes [V]

- `apps/web/src/ui/dialogs/openingType/previewFormasPecas.test.ts` (novo, 7): 162 tipos x arco pleno, abatido, ogival, círculo e empena (806 casos válidos): a elevação mantém pelo menos 45% dos preenchimentos e 60% dos traços do retangular (medido: o pior caso é o círculo de janela fixa pequena, 3 de 6 preenchimentos, porque as molduras viram o anel, doc 37); combinações que a matriz marca `incompatível` exigem aro + vidro fixos; porta almofadada em arco com quase todas as peças do retangular; a prévia muda com forma, flecha e estilo; vão `rect` byte a byte igual ao sem forma; corte com peças; miniatura.
- `packages/render/src/section/vaoContornoPecas.test.ts` (novo, 3) e `vaoContorno.test.ts` (2 asserções atualizadas, §3.1).
- `apps/web/src/ui/openingTypeListaFormas.test.ts` (novo, 15): os 162 tipos na lista; os 8 novos na família do motor, com `shape` e `shapeLabel`; os 154 antigos com `rect` e a mesma família; filtro e busca por forma (pt e en); miniatura com `rv-shaped` só nos tipos com forma; retangular idêntico.
- `typeSelectorModel.test.ts` (+3), `shapeVerdict.test.ts` (novo, 4: matriz real, 162 x 9 formas, 7 idiomas) e `shapePreview.test.ts` (+1: marca e aviso no painel).
- Rodados: `vitest` em `packages/render/src/section`, `openingCatalogoVistas`, `apps/web/src/editor/i18n`, `apps/web/src/ui/dialogs` e os testes do seletor (96 arquivos, 915 testes verdes); `tsc --noEmit` (só acusa `packages/engine/src/zzdbg.test.ts`, arquivo de depuração da outra frente, fora desta mudança); `eslint` nos arquivos alterados limpo; `check-boundaries`, `check-parity`, `check-props-density`, `check-units`, `check-ribbon-i18n` ok; `check-i18n-placeholders` sem divergência nova (1 anterior em pt/en/es/it/pl). Não rodei a suíte inteira.

## 6. Pendências [I]

- A planta e o corte da lista (miniatura) são só a elevação; a prévia grande da paleta ("Editar tipo" fora do diálogo) segue o mesmo caminho.
- O 3D do diálogo já usava o modelo; não foi alterado.
- Motivos da matriz (`reason`) só em português.
- Alças de flecha na elevação do projeto continuam fora (doc 34 §1.5).
