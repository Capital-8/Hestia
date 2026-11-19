# Caixilho contínuo da folha e matriz de compatibilidade operação x forma

Data: 2026-11-19. Continua `28` (peças em arco), `32` (formas novas), `37` (portas com forma) e `38` (verificação visual). Marcas: [V] verificado nesta sessão (teste rodado, código lido ou captura vista); [G] derivado por geometria; [I] inferência ou decisão a validar. Branch `claude/lucid-bell-hwk4ln`.

## 1. O relato e a causa

Relato (captura do usuário): janela circular de abrir; a folha aberta mostra o vidro em disco com a cruz de divisões, mas o caixilho da folha aparece só como pedaços retos nas pontas, sem aro em volta do vidro; as barras da cruz passam do vidro. E a pergunta: cada configuração de esquadria foi validada contra cada formato?

Causa [V], reproduzida no build artifact (`ANTES-ABERTA-abrir-circulo-obliqua.png`): a moldura da folha de janela são quatro barras retas (`leaf-<k>-left|right|top|bottom`, `addWindowLeaf`). `contornoDoModelo` recortava CADA barra pelo contorno. Num círculo a esquerda e a direita viram duas lentes nas pontas, e o topo e a base (retângulos na borda da caixa, fora da elipse) viram lascas ou somem: não existe anel. As divisões do vidro (`muntin`) recortavam pelo recuo do batente (`J`) em vez do recuo do vidro da folha, e por isso passavam 4 mm a 4 cm do vidro para dentro do aro. Vale para elipse, ogival, abatido, pleno, empena, trapézio e polígono (nos arcos e retas, a travessa de cima da folha existia só em parte).

A segunda pergunta é um buraco real [V]: nenhuma regra ligava a operação (correr, guilhotina, sanfonada...) à forma. A janela de correr em círculo gerava duas folhas que deslizam por um trilho de elipse (doc 28 §6), o que nenhuma serralheria faz.

## 2. Caixilho contínuo (arquivo novo `engine/src/openingModelContornoFolha.ts`)

A moldura da folha passa a ser o ANEL entre dois contornos:

- externo: a caixa da folha recortada pela mesma regra de `recortada` (recuo do contorno; peça que desliza continua recortada na posição fechada, doc 37 §5);
- interno: o polígono do vidro da folha (`recortada` do `glass`), o mesmo que o vidro usa. Aro e vidro se encostam sem lacuna nem sobreposição.

O anel é repartido nas MESMAS quatro peças, com os MESMOS ids (`leaf-<k>-left|right|top|bottom`), então nada some e nada novo aparece para as outras vistas:

| Peça | Geometria |
|---|---|
| esquerda e direita | o externo cortado nas retas verticais que tocam o interno (`x <= xMin` e `x >= xMax` do interno): lente num círculo, montante reto até o arco num arco, trapézio de ombreira numa empena |
| topo e base | a faixa entre a cadeia superior (ou inferior) do externo e a do interno, entre essas duas retas. Num círculo é a faixa curva de largura constante; numa empena ou trapézio são as faixas em meia-esquadria do telhado (as arestas do contorno recuado se encontram na interseção das retas vizinhas) |

Conferência dentro do motor: a soma das áreas das quatro peças tem de ser a área do externo menos a do interno (1e-6 relativo); se não fecha (polígono côncavo, interno fora do externo) nada muda e a folha segue a regra antiga [V]. Peça cuja nova forma é a própria caixa continua a mesma peça (folha retangular que cabe no contorno, ou a base reta de um arco, não vira prisma) [V]. O modelo do vão retangular é o MESMO objeto, byte a byte, nos 162 tipos [V].

Outros ajustes:
- Divisões do vidro (`muntin`) de uma folha recortam pelo recuo do vidro dela (`recuoDoVidro`): a cruz encosta no aro e termina na borda do vidro, sem passar [V: teste "as divisões do vidro (cruz) encostam no aro"].
- Círculo e elipse, folha e vidro: o recuo é paralelo e uniforme, o MAIOR entre a folga lateral real da caixa e a do topo (antes era o menor, o que deixava 4 mm de reto: a folha de maxim-ar não tem folga em cima e o vidro ficava com trechos retos em baixo e dos lados) [V, captura `zoom` do círculo].
- O batente já era contínuo desde `28` e `32` (círculo: anel em metades; arcos: coroa em faixa; polígonos: faixas por aresta com junta em meia-esquadria) e não mudou. Janela fixa em contorno: o aro é o batente e o vidro, sem folha [V].

### 2.1 Verificação numérica [V] (`openingModelContornoFolha.test.ts`)

Para as janelas de abrir, maxim-ar, basculante e pivotante (uma folha) em círculo, elipse, arco pleno, ogival, empena, trapézio e polígono:
- amostragem 220 x 220 do anel: lacunas < 0,2 % e nenhum ponto do vidro coberto pelo aro;
- soma das áreas das quatro peças = área(externo) - área(vidro) a 1e-4;
- tudo dentro do contorno da esquadria (2 mm, corda amostrada);
- círculo: área do anel = largura do perfil x (perímetro do vidro + pi x largura) a 1 %, e volume = área x profundidade a 1 % (é a identidade perímetro médio x largura, sem ela o anel teria lacuna ou sobra);
- as quatro peças de uma janela em círculo são as mesmas quatro (ids) e a base reta de um arco continua caixa.

## 3. Matriz de compatibilidade operação x forma (`model/src/openingShapeCompat.ts`)

Regra de DADOS no model, exportada pelo index: `shapeCompat(tipo, forma)`, `compatibleShapes(tipo)`, `shapeIncompatible`, `familyShapeCompat(família, kind)`, `shapeCompatMatrix()`. Cada célula tem `verdict` (`ok` | `adaptado` | `incompatível`), `rule` (grupo G0 a G10) e `reason` (uma frase em português). A linha é a família do catálogo (19 famílias, `OpeningFamilyId`) e a coluna a forma (9, `OPENING_SHAPE_KINDS`); a elipse é `circle` com largura diferente da altura.

Duas regras dependem do tipo, não só da família: duas ou mais folhas em círculo ou elipse são `incompatível` (a junta seria um diâmetro e as dobradiças ficariam no arco); basculante de eixo excêntrico (`tiltAxis` fora de 0,4 a 0,6) em círculo passa a `adaptado`. Tipo sem família: `ok` (quem recusa é `openingTypeIssue`).

### 3.1 Tabela

| Família | rect | round | segmental | pointed | circle | horseshoe | gable | trapezoid | polygon |
|---|---|---|---|---|---|---|---|---|---|
| `door_swing` (Porta de giro) | ok | ok | ok | ok | adaptado | **incompatível** | ok | adaptado | adaptado |
| `door_double` (Porta dupla) | ok | ok | ok | ok | **incompatível** | **incompatível** | ok | adaptado | adaptado |
| `door_sliding` (Porta de correr) | ok | adaptado | adaptado | adaptado | **incompatível** | **incompatível** | adaptado | adaptado | adaptado |
| `door_pivot` (Porta pivotante) | ok | ok | ok | ok | ok | ok | ok | ok | adaptado |
| `door_dblact` (Porta vai-e-vem) | ok | ok | ok | ok | adaptado | **incompatível** | ok | adaptado | adaptado |
| `door_pocket` (Porta de embutir) | ok | adaptado | adaptado | adaptado | **incompatível** | **incompatível** | adaptado | adaptado | adaptado |
| `door_bifold` (Porta dobrável) | ok | adaptado | adaptado | adaptado | **incompatível** | **incompatível** | adaptado | adaptado | **incompatível** |
| `door_accordion` (Porta sanfonada) | ok | **incompatível** | **incompatível** | **incompatível** | **incompatível** | **incompatível** | **incompatível** | **incompatível** | **incompatível** |
| `door_garage` (Portão seccionado) | ok | adaptado | adaptado | adaptado | **incompatível** | **incompatível** | adaptado | **incompatível** | **incompatível** |
| `door_void` (Vão livre) | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| `window_fixed` (Janela fixa) | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| `window_hinged` (Janela de abrir) | ok | ok | ok | ok | adaptado | **incompatível** | ok | adaptado | adaptado |
| `window_tilt` (Janela basculante) | ok | adaptado | adaptado | adaptado | ok | **incompatível** | adaptado | adaptado | adaptado |
| `window_casement` (Janela maxim-ar) | ok | adaptado | adaptado | adaptado | adaptado | **incompatível** | adaptado | adaptado | adaptado |
| `window_sliding` (Janela de correr) | ok | adaptado | adaptado | adaptado | **incompatível** | **incompatível** | adaptado | adaptado | adaptado |
| `window_hung` (Janela guilhotina) | ok | adaptado | adaptado | adaptado | **incompatível** | **incompatível** | adaptado | **incompatível** | **incompatível** |
| `window_pivot` (Janela pivotante) | ok | ok | ok | ok | ok | ok | ok | ok | adaptado |
| `window_louver` (Janela veneziana) | ok | ok | ok | ok | adaptado | adaptado | ok | adaptado | adaptado |
| `window_void` (Vão livre) | ok | ok | ok | ok | ok | ok | ok | ok | ok |

Leitura: `ok` = funciona no contorno; `adaptado` = funciona com a ressalva da célula (só o trecho reto opera, folha sobreposta, arco fixo como bandeira, abertura limitada), o motor não muda nada; **incompatível** = não é construtivo, o motor gera a esquadria FIXA e a validação avisa. A coluna `rect` é `ok` em todas as linhas [V: teste].

### 3.2 Justificativa por grupo

- G0 fixa e vão livre (`window_fixed`, `window_void`, `door_void`): sem mecanismo, qualquer contorno serve. [G]
- G1 giro de eixo vertical na borda (`door_swing`, `door_double`, `door_dblact`, `window_hinged`): a dobradiça é uma reta vertical e a folha gira em torno dela; a aresta do lado da dobradiça precisa ser vertical. Arcos e empena têm lateral vertical (o topo recuado junto à dobradiça pede chanfro, [I]); trapézio e polígono têm aresta inclinada (o eixo toca um ponto da aresta, abertura limitada, `adaptado`); o círculo só toca o eixo num ponto (folha sobreposta ao aro, `adaptado`); na ferradura o arco passa para fora das ombreiras e a folha bate na ombreira ao girar (`incompatível`). Porta em arco com folha acompanhando o arco: doc 28 §2.3 [V]. [G] para as colisões, [I] para o chanfro.
- G2 pivô vertical (`door_pivot`, `window_pivot`): o eixo atravessa a folha e cada ponto se move NA HORIZONTAL em direção ao eixo, ficando sempre dentro do contorno na mesma cota (a fatia do contorno em cada cota é um intervalo que contém o eixo). Vale para toda forma simétrica, inclusive círculo, elipse e ferradura; o óculo pivotante existe. Polígono livre pode ser assimétrico ou côncavo: `adaptado`. [G] Este é o caso em que a suspeita do usuário (pivotante em círculo) não procede; a folha de espessura finita e o rebaixo do batedor não foram verificados em 3D aberto [I].
- G3 maxim-ar (`window_casement`): a dobradiça é uma reta horizontal; num arco ou telhado ela só existe na linha de arranque ou na aresta superior reta, e o que fica acima é bandeira fixa. Fonte: Lapin, "zona de baixo = grade com operações, zona de cima = bandeira fixa em arco", doc 02 §5.1 [V]. O motor hoje gira a folha inteira recortada pelo contorno (`adaptado`: a leitura construtiva é folha só abaixo do arranque). Ferradura: a folha bate no pescoço ao subir (`incompatível`). [G]
- G4 basculante (`window_tilt`): cada ponto se aproxima do eixo, então a largura do contorno naquela cota tem de ser a maior da folha. Vale no círculo com eixo no centro (largura máxima) e nos arcos com o eixo abaixo do arranque; como o motor não confere o eixo contra o arranque, os arcos ficam `adaptado`; ferradura estreita abaixo do arco (`incompatível`). [G]
- G5 correr (`window_sliding`, `door_sliding`, `door_pocket`): a folha anda em trilho reto horizontal por duas pistas; só a parte retangular abaixo do arranque desliza e o arco fica como bandeira fixa (Lapin, doc 02 §5.1 [V]; doc 37 §5: a folha aberta passa do arco [V]). Círculo e ferradura não têm faixa retangular útil: `incompatível`. Embutir exige caixa retangular na parede, o arco só cabe se a caixa o contiver (`adaptado`) [I].
- G6 guilhotina (`window_hung`): guias verticais paralelas; só contorno de lados verticais; a folha de cima fica fixa sob o arco ou telhado (`adaptado`). Círculo, ferradura, trapézio e polígono: `incompatível`. [G]
- G7 dobrar (`door_bifold`): painéis retos em trilho superior reto, arco ou telhado fica fixo (`adaptado`); círculo, ferradura e polígono livre: `incompatível`. [I]
- G8 sanfonada (`door_accordion`): tira de altura constante recolhida em trilho superior reto; qualquer forma além do retângulo: `incompatível`. Doc 20 (linha 243: "folding (sem sanfonada)") e doc 04 (linha "Camarão", termo ambíguo, [P]); o resto é [I].
- G9 portão (`door_garage`): painéis retos em trilhos laterais verticais e curso sob o teto; arco e telhado viram cabeça fixa (`adaptado`); círculo, ferradura, trapézio e polígono `incompatível`. O portão arqueado do Lapin é só o topo (doc 20, linha 153, [V]); o resto é [I].
- G10 veneziana (`window_louver`): lâminas horizontais, cada uma uma faixa na largura do contorno naquela cota; junto à curva o giro é limitado (`adaptado` em círculo, ferradura, trapézio e polígono). [I]

## 4. O que o motor faz com a matriz

- `adaptado` e `ok`: nada muda no modelo (a folha segue o contorno recuado, docs 28 e 37).
- `incompatível`: `buildOpeningModel` (`openingModel.ts`) monta a esquadria FIXA dentro do contorno (aro e vidro), em vez da folha que corre ou gira pelo arco (`openingModelFixa.ts`). Só entra quando há folha (`leaves > 0`), a forma é não retangular e cabe na esquadria (`formaDaEsquadria`). Nada é apagado nem reescrito:
  - o TIPO gravado continua com a operação; só o modelo gerado é fixo (trocar a forma de volta devolve a operação) [V];
  - o furo da parede, o alizar, a verga, a contraverga, o peitoril, a bandeira, a grade do tipo e o material são os mesmos;
  - janela: construída como janela fixa (caixilho e vidro com a grade do tipo); composição de várias células é ignorada neste caso (o modelo vem do tipo, não da composição) [I];
  - porta: construída como folha de giro e congelada: folha, vidro e detalhes do estilo ficam; dobradiças, maçaneta, trilhos e todo `motion` saem, porque um painel fixo não os tem. Batente "bloco" vira "simples" (a de correr sempre tem batente);
  - as aberturas do modelo (`openings`) viram `fixed`; planta e 3D aberto derivam delas, então a planta não desenha arco de giro nem trilho de correr [V pela leitura de `openingPlan`; não conferida em captura de planta].
- Aviso `forma-incompatível-com-operação` (`openingShapeIssues.ts`, severidade `warning`, só `incompatível`; `adaptado` não avisa). Mensagem `egb_issue_opening_shape_operation` em pt, en, es, de, fr, it e pl (engine: pt e en; `apps/web/src/editor/i18n/areas/packages-engine.ts`: os sete); texto: "a operação X não é construtiva na forma Y; a esquadria é gerada FIXA (aro e vidro) dentro do contorno. Troque a operação ou a forma." O nome da operação sai de `openingFamilyOf(t, lang).name` (localizado); o nome da forma sai em pt e en (os outros idiomas usam o inglês) [V: teste nos 7 idiomas].
- Para a interface: `shapeCompat(type, shape)` (veredito, regra e motivo para mostrar no diálogo) e `compatibleShapes(type)` (filtro das listas; `rect` sempre entra).

## 5. Verificação

### 5.1 Testes [V]

- `model/src/openingShapeCompat.test.ts` (10): 19 famílias x 9 formas completas com motivo, `rect` sempre `ok`, casos de referência, regra de duas folhas em círculo, eixo do basculante, `compatibleShapes`, os 162 tipos do catálogo e os 8 tipos que já nascem com forma (J-60 a J-64, P-86 a P-88) compatíveis.
- `engine/src/openingModelContornoFolha.test.ts` (39): anel contínuo (acima), matriz completa dos 162 tipos x 9 formas (1458 modelos, nenhum lança, nenhuma peça de preenchimento fora do contorno a 2 mm, incompatível sem movimento nem ferragem de movimento e com aro e vidro, mais de 100 fixas e mais de 100 adaptadas), vão retangular idêntico, esquadria fixa (janela de correr em círculo sem trilho nem `motion` e com `frame-ring`; porta de giro em arco gira, em ferradura fica fixa; porta de correr, sanfonada e de embutir em círculo e ogival fixas; duas folhas de abrir em círculo fixas, uma folha segue de abrir).
- `engine/src/openingShapeIssues.test.ts`: aviso novo, nenhum aviso nos casos `ok` e `adaptado`, mensagem nos 7 idiomas.
- Testes antigos atualizados: `openingModelContornoLacunas.test.ts` (janela e porta de correr em círculo deixaram de ser folha que corre; o círculo foi retirado do loop de cobertura da porta e entrou o teste da esquadria fixa) e `openingModelContornoPreserva.test.ts` (a regra "nenhuma peça some" e a de volume pulam as combinações incompatíveis, que têm teste próprio).
- Regressão rodada (vitest): `engine/src/opening*`, `roughOpening`, `section*`, `furoContorno*`, `model/src/opening*`, `contrato*`, `render/src/model3d`, `render/src/plan`, `render/src/section`, `apps/web/src/editor/i18n`: 296 arquivos, 3398 testes verdes (14 ignorados). `tsc` limpo (com `NODE_OPTIONS=--max-old-space-size=8192`), `eslint` limpo nos arquivos tocados, `check-boundaries`, `check-parity` e `check-units` ok.

### 5.2 Visual, build artifact [V]

`NODE_OPTIONS=--max-old-space-size=8192 npm run build:artifact`, `dist` copiado para pastas temporárias e servido por http local (build ANTES do código novo e build DEPOIS, mesma câmera), Chromium com SwiftShader, `?gl=1&debug=1`, `Abrir aberturas` ligado por `setView3D { openOpenings: true }`. Em todas as execuções `__hestiaFuro.diagnostico()` deu `falhas: 0`, `ultimoErro: null`; único erro de console o 404 do `resolveWorker` (esperado, doc 38 §1). Capturas em `<scratchpad>/shots/`:

- `ANTES-ABERTA-abrir-circulo-obliqua.png` reproduz o relato: folha aberta com o disco de vidro, a cruz passando do vidro e só dois pedaços do caixilho nas pontas. `DEPOIS-ABERTA-abrir-circulo-obliqua.png`: a folha aberta tem o aro contínuo em volta do vidro (a borda elíptica da folha inteira) e a cruz termina no aro.
- `ANTES|DEPOIS-ABERTA-maximar-circulo-obliqua.png` (`par-maximar-circulo.png`): maxim-ar em círculo aberto; antes lascas na esquerda e embaixo, depois anel inteiro com a cruz presa nele.
- `ANTES|DEPOIS-ABERTA-correr-circulo-obliqua.png` (`par-correr-circulo.png`): antes duas folhas de correr numa elipse, uma deslocada com uma lasca de caixilho; depois a esquadria fixa: aro do batente em volta de um disco de vidro, sem folha que corre.
- `ANTES|DEPOIS-J63-oculo-*.png`: J-63 (fixa) igual nos dois: aro do batente e vidro, sem divisões.
- `cmp2-obliqua.png` e `cmp2-frontal.png` (cima ANTES, baixo DEPOIS): ogival de abrir, empena de abrir, elipse maxim-ar e trapézio de abrir, abertos. Depois: a travessa de cima da folha acompanha o arco e o telhado (antes não havia faixa no telhado da empena nem no trapézio), e a elipse tem anel contínuo.
- Elevação das peças fechadas em SVG (`dbg/antes.png` e `dbg/depois.png`, 7 operações x 9 formas, janelas de abrir, correr, maxim-ar, basculante, pivotante, guilhotina e fixa); as combinações incompatíveis (correr e guilhotina em círculo e ferradura, maxim-ar e basculante em ferradura, abrir em ferradura, guilhotina em trapézio e polígono) aparecem como aro e vidro.

## 6. Limites e pendências

1. Emenda do anel: as quatro peças se encontram em retas verticais (a emenda entra no desenho 2D das peças como uma linha fina, como no aro do batente). O ideal de marcenaria é junta em esquadria nos cantos; fica para quem precisar do detalhe de fabricação [I].
2. `adaptado` não muda o modelo: a janela de correr em arco ainda gera a folha recortada pelo arco (a folha aberta passa do contorno, doc 37), e o maxim-ar em arco gira a folha inteira. A leitura construtiva (folha só abaixo do arranque, arco fixo) é uma evolução possível, hoje só documentada no motivo da célula.
3. Polígono côncavo e recuo recusado: o anel da folha não fecha por área e a folha segue a regra antiga (peças recortadas); continua o aviso `forma-vao-poligono-concavo` (doc 32).
4. Composição de várias células com operação incompatível: o motor monta a fixa a partir do tipo e ignora as células; não testada com composição real do catálogo [I].
5. Porta fixa tira dobradiça e maçaneta; se um dia houver painel fixo com puxador ele precisa de campo próprio.
6. A matriz é por família; o `adaptado` e o `incompatível` dependem de geometria que o tipo tem (altura do arranque, excentricidade do eixo). Só o eixo do basculante em círculo entrou; o resto é decisão de família [I].
7. Observado e não alterado [V]: `defaultOpeningShape('pointed', 1.2, 0.6)` (ogival numa janela baixa e larga) gera ombreiras do batente até o piso com um arco achatado; é a forma padrão que a interface oferece, não efeito deste trabalho.
8. A planta e o corte do vão incompatível (fixo) não foram capturados; derivam do mesmo modelo.

## 7. Arquivos

Novos: `packages/model/src/openingShapeCompat.ts` (+ `.test.ts`), `packages/engine/src/openingModelContornoFolha.ts` (+ `.test.ts`), `packages/engine/src/openingModelFixa.ts`. Alterados: `packages/model/src/index.ts`, `packages/engine/src/openingModel.ts`, `openingModelContorno.ts`, `openingModelContornoPoligono.ts`, `openingShapeIssues.ts` (+ teste), `i18nMessages.ts`, `apps/web/src/editor/i18n/areas/packages-engine.ts`, `openingModelContornoLacunas.test.ts`, `openingModelContornoPreserva.test.ts`, este doc.

## 8. Como rodar

```
npx vitest run packages/model/src/openingShapeCompat.test.ts packages/engine/src/openingModelContornoFolha.test.ts packages/engine/src/openingShapeIssues.test.ts packages/engine/src/openingModelContornoLacunas.test.ts packages/engine/src/openingModelContornoPreserva.test.ts
NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.json --noEmit && node scripts/check-boundaries.mjs
```
