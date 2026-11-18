# Formas novas do vão: empena, trapézio, ferradura e polígono livre

Data: 2026-11-18. Continua `20`, `24`, `28` e `30`; cumpre as formas que a fase 2 de `00-sintese.md` (§4) previa e faltavam. Marcas: [V] verificado nesta sessão (código lido ou teste rodado); [I] inferência ou decisão a validar. Branch `claude/lucid-bell-hwk4ln`.

## 1. O que entrou

`OpeningShape` ganhou quatro tipos (`packages/model/src/openingShape.ts`); as cinco formas antigas ficaram idênticas (os 53 testes de `openingShape*` seguem verdes e o modelo de peças do vão retangular é o MESMO objeto) [V].

| Tipo | Campos além de `width`/`height` | Contorno (anti-horário, aberto) | Problemas (`validateOpeningShape`) |
|---|---|---|---|
| `gable` (empena) | `rise` (cumeeira acima do beiral, em (0, height]) | base, ombreiras até `height - rise`, dois planos até a cumeeira central; `rise = height` dá o triângulo | `rise-invalid`, `rise-exceeds-height` (os mesmos do arco) |
| `trapezoid` | `topWidth`; `baseWidth` opcional (padrão `width`) | base, perna, topo, perna | `trapezoid-width-invalid`, `trapezoid-width-mismatch` (o maior dos dois tem que ser `width`) |
| `horseshoe` (ferradura) | `neck` (abertura entre ombreiras, 0 < neck < width) | ombreira reta em x = ±neck/2, arco de raio `width/2` com centro em `height - width/2` (ACIMA da nascença), cordas de 1 mm | `horseshoe-neck-invalid`, `horseshoe-height-too-low` |
| `polygon` | `points: {u, v}[]` em 0..width, 0..height; `symmetric?` | os pontos (x = u - width/2, z = v), com repetidos e colineares tirados | `polygon-points-invalid` (menos de 3, mais de 4096, não finito), `polygon-out-of-box`, `polygon-degenerate`, `polygon-self-intersecting`, `polygon-clockwise`, `polygon-box-not-filled`, `polygon-not-symmetric` |

[V] `polygon`: a auto-interseção segue a regra da ABI do furo (`21` §6.1): arestas não consecutivas que se cruzam OU se tocam (vértice sobre aresta), e espícula de ida e volta. É conferida ANTES da área, então a gravata borboleta (área zero) sai como `polygon-self-intersecting`. Côncavo simples (L, estrela) vale. O limite de 4096 pontos é o da ABI.

[V] Segmentos (DXF e vistas, `outlineSegments`): ferradura sai com UM arco de `bulge` exato (`tan(θ/4)`, θ = π - 2·a0 > π, ou seja, bulge > 1); empena, trapézio e polígono são só retas. Teste: a área calculada pelos segmentos (cadarço + segmento circular do bulge) é a área analítica a 1e-9, e a do anel tesselado difere só da ordem da sagita.

### 1.1 Peraltado: já existia

O arco peraltado (pleno com ombreiras retas acima da nascença) é `round` com `height > width/2` (ombreiras de `height - width/2`), e com flecha menor que a metade é `segmental` com `height > rise` [V: `openingShape.test.ts`, `crownOf`]. O trecho "maior que o semicírculo" que `04` §3.3 chama de peraltado é, geometricamente, a ferradura (arco que passa do semicírculo), agora coberta por `horseshoe`. Não foi criado tipo à parte; o rótulo de `round` na lista da interface diz "peraltado quando mais alto que a meia-largura".

### 1.2 Decisões de parâmetros

- Ferradura: `width` é a caixa envolvente (o diâmetro do círculo), não a abertura nos apoios. Assim `OverallWidth`, o `offset`, o resto do sistema e o import por perfil continuam lendo "largura = caixa". A abertura nos apoios é `neck`. A forma de `04` §3.6 (`c`, `R`, `hc`, `hp`) é equivalente: R = width/2, centro em height - R, `c` = neck, e a nascença `z1 = zc - sqrt(R² - neck²/4)` sai determinada pelo encontro da ombreira com o círculo [V]. [I] `hc` e `hp` independentes de `04` não existem: com um círculo só e ombreiras verticais não há grau de liberdade a mais.
- Trapézio: `baseWidth` existe só para o "topo maior que a base" (a caixa é `width`, então o topo é `width` e a base é `baseWidth`) [I: o pedido dizia só `topWidth`; sem isso o contorno passaria da caixa].
- Redimensionar (`resizeOpeningShape`, `openingShapeKinds.ts`): o vão bruto e a esquadria têm largura e altura diferentes das gravadas. Parâmetros no sentido da largura (`topWidth`, `baseWidth`, `neck`) e os pontos do polígono (u pela razão das larguras, v pela das alturas) acompanham a proporção; `rise` fica como gravada, como já era a regra da flecha [I: polígono com escala não uniforme distorce]. As formas antigas só trocam `width` e `height` (igual a antes). Usado em `openingShapeOf` e em `formaDaEsquadria`/`problemasDaEsquadria`.

## 2. Recuo concêntrico (`openingShapeInset.ts`, `openingShapePolyInset.ts`)

- Ferradura [V]: arco concêntrico (mesmo centro, raio R - d) e ombreiras em neck/2 - d, então `crownOf`, `crownBand` e `outlineInset` valem como nos outros arcos. Se o recuo deixa o arco de passar para fora das ombreiras recuadas (já não é ferradura), `crownOf` devolve `null` e a peça segue como era.
- Empena, trapézio e polígono [V]: offset por reta, cada aresta pela sua distância e vértices na interseção das retas vizinhas (junta em meia-esquadria). A aresta é "base" (horizontal em z = 0), "lateral" (mais íngreme que 45 graus) ou "topo" (o resto); a distância é `base`, `side` ou `arc` do `OpeningInset`. O recuo é recusado (`[]`) se uma aresta colapsa ou inverte, ou se o anel recuado deixa de ser simples (conferido até 600 vértices; acima disso não é conferido por custo O(n²)) [I: o limite de 600].
- Côncavo simples [V]: o L recua bem até a parte fina acabar (`outlineInset(L, 0.05)` vale; `0.2` devolve `[]`). Esse é o "limite": a peça cujo recuo é recusado fica como caixa, e `openingShapeIssues` avisa `forma-vao-poligono-concavo` (7 idiomas, §5).
- `edgeStrips(shape, dOut, dIn)`: faixa por aresta entre dois recuos, quadriláteros de junta em meia-esquadria que se encaixam sem sobra nem sobreposição [V: soma das áreas das faixas, cortadas em z >= 0, = área do contorno menos a da região recuada, a 1e-9, para empena, os dois trapézios, casinha e L].

## 3. Peças (`contornoDoModelo`)

[V] Confirmado e ajustado.

- Vidro, folha, divisores, baguetes, trilhos e o resto do preenchimento: `recortada` (caixa recortada pelo contorno recuado) funciona para as quatro formas sem mudança, porque lê `outlineInset`. Em polígono côncavo cujo recuo é recusado a peça fica caixa.
- Batente e alizar de empena, trapézio e polígono (`openingModelContornoPoligono.ts`, arquivo novo): não há coroa de arco, então viram FAIXAS POR ARESTA em volta do contorno todo, sem a base (soleira e peitoril ficam retos). Faixa de aresta vertical ou que toca a base = `jamb`, as demais (telhado, topo) = `head`; uma série por fatia de `s` do rebaixo da travessa, mesmo `group`. Faixas cortadas no piso (`z0` das ombreiras). A espessura das ombreiras é a da travessa (o perfil em L é o mesmo) [I]. Soleira do batente e do vão ficam retas, aparadas à largura da base (trapézio de base menor).
- Ferradura (`arco()` + `openingModelContornoFerradura.ts`, arquivo novo): coroa do batente e do alizar por `crownBand`; ombreiras, alizar lateral e soleiras ENTRAM para o pescoço (delta = (width - neck)/2), porque o modelo retangular as põe na borda da caixa. [I] Ferragens (dobradiças) NÃO se movem: ficam na borda da caixa, delta fora do batente. Folha e vidro seguem o contorno recuado.
- `openingModelMuntinsContorno.ts`: uma linha, o centro do arco da ferradura (`h - w/2`) para o leque.
- Teste de estresse (descartável, não commitado): os 154 tipos do catálogo x 6 variantes das formas novas = 924 modelos, nenhum lança, 909 trocam alguma peça por prisma `tz` e nenhuma caixa sai não finita [V].

## 4. IFC

- Export [V]: `addOpeningProfile` já faz polilinha de `outline()`, então as quatro formas saem como `IFCARBITRARYCLOSEDPROFILEDEF` com `IFCPOLYLINE`, sem código novo. [I] O arco da ferradura sai em cordas de 1 mm, como os outros (a decisão de `30` vale).
- Import (`openingShapeFit.ts`) [V]: novas candidatas `gable` (flecha por grade + seção áurea, como o abatido), `trapezoid` (larguras da base e do topo medidas no perfil) e `horseshoe` (largura da base = `neck`). Exatas, sem aviso (`FORMA_EXATA_TOL`), inclusive na ida e volta export -> import (teste com as quatro).
- Polígono livre [V]: perfil que não é nenhuma forma do modelo (desvio acima de `FORMA_PROXIMA_TOL`, 50 mm) vira `polygon` exato e SEM aviso, se for polígono simples com 3 a 4096 pontos; o sentido horário é invertido. Perfil não simples (pentagrama de um traço) continua em caixa envolvente com o aviso de sempre. O caso intermediário (polígono a menos de 50 mm de um arco, por exemplo um arco de 8 pontos) continua sendo aproximado pela forma mais próxima COM aviso: mudar isso quebraria o teste existente e a decisão de `23`; [I] vale rever se alguém importa polígonos facetados de propósito.
- Mudança em teste existente: o perfil de "estrela de 5 pontas" do import (que esperava caixa envolvente) agora é polígono simples e vira `polygon`; os dois testes (`fitOpeningShape` e a ida pelo IFC bruto) passaram a usar o pentagrama de um traço (auto-interseção) para continuar cobrindo o ramo "sem forma", e a estrela ganhou o próprio teste de `polygon` [V].

## 5. Avisos e i18n

- `forma-vao-invalida` já mostra os códigos como tokens técnicos não traduzidos (`24` §3); os novos códigos entram do mesmo modo, sem chave nova [V: teste com `polygon-self-intersecting`].
- Novo: `forma-vao-poligono-concavo` (severidade `warning`), só para `polygon` com reentrância (`egb_issue_opening_shape_concave`), em pt e en no `engine/i18nMessages.ts` e nos 7 idiomas (pt, en, es, de, fr, it, pl) em `apps/web/src/editor/i18n/areas/packages-engine.ts`; `check-parity` ok [V].

## 6. Para a interface

`@hestia/model` exporta (`openingShapeKinds.ts`): `OPENING_SHAPE_KINDS` (rect, round, segmental, pointed, circle, horseshoe, gable, trapezoid, polygon), `OPENING_SHAPE_LABELS_PT`, `OPENING_SHAPE_PARAMS` (campos extras de cada forma), `defaultOpeningShape(kind, w, h)` (forma válida para começar a editar) e `resizeOpeningShape`. Também `MAX_POLYGON_POINTS`, `ringIsSimple`, `cleanRing`, `polygonRing`, `horseshoeGeometry`, `isPolygonForm`, `offsetRing`, `polygonInset`, `edgeStrips`.

## 7. Furo da parede pela ABI

[V] `tests/furo-contorno-formas-novas.wasm.test.ts`, com `KERNEL_WASM_PATH=$PWD/packages/geom/assets/geom_wasm.wasm npx vitest run --config vitest.wasm.config.ts tests/furo-contorno-formas-novas`: 8 formas (empena, triângulo, trapézio de topo menor e maior, ferradura, polígono convexo assimétrico, L côncavo e estrela côncava de 5 pontas), 26 testes, todos verdes. Para cada uma: (a) `furarParedePorContorno` (ABI `furo_contorno_furar`): volume removido = área do contorno x espessura, por camada e no total, a 1e-9 m³; (b) cliente de prisma pós-junção (`resolveLevel` + `camadaFurada`, ABI `furo_prisma_furar`) com a parede `wt_alv14` de 5 camadas: cada camada remove área x espessura, sem falha do Rust; (c) retorno do acabamento (`closure: 'both'`, `furo_retorno_vao`) segue o contorno sem falha. O Rust aceitou o côncavo (L e estrela) sem panic.

## 8. Testes rodados e o que ficou de fora

Rodado (só estas áreas): `vitest` em `model/openingShape*` (77 testes, 24 novos em `openingShapeForms.test.ts`), `engine/opening*` + `engine/furo*` + `io/ifc*` + `io/ifcImport*` (83 arquivos, 1031 testes; 25 novos em `openingModelContornoPoligono.test.ts` e 11 novos em `io/ifcImport/openingShape.test.ts`), `render/model3d` + `engine/section` + `engine/vaoContorno` (107 arquivos), `tests/furo-contorno*` e `packages/geom/src/furoContorno` com o wasm real; `tsc`, `eslint` dos arquivos tocados (max-lines 420), `check-boundaries` e `check-parity`. NÃO rodei a suíte inteira. `tsc` acusa hoje erros em `furoContornoParede.ts` e `tests/furo-contorno-ext.wasm.test.ts`, que são de outra frente em andamento (não tocados aqui).

Pendências e [I]:
1. Ferragens da ferradura não acompanham o pescoço (§3).
2. Polígono com recuo recusado (côncavo de reentrâncias finas) deixa a peça como caixa; só há aviso.
3. Elevação, planta e DXF derivam do contorno e funcionam sem código novo, mas não ganharam teste visual das quatro formas.
4. Parede curva ou inclinada segue com furo retangular (`forma-vao-ignorada-na-parede`), como antes.
5. A interface (seletor, preview, edição de pontos do polígono) é outra etapa; este trabalho só entrega as constantes e a forma padrão.
