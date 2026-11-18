# Vistas e DXF com o vão de contorno (corte, elevação, planta)

Data: 2026-11-18. Continua `26` (troca atômica) e `27` (ligação real). Marcas: [V] verificado nesta sessão (teste rodado ou código lido, com arquivo:linha); [I] inferência, a validar. Linhas valem para o working tree desta data.

Antes: o furo do vão com contorno (`OpeningType.shape`) já valia no 3D, no quantitativo e na planta (doc 26/27), mas o corte, a elevação e o DXF desenhavam o vão retangular. A parede do corte vinha das faixas do `resolveLevel`, que para vão com contorno não tem furo (`resolve.ts:344` e `resolveContorno.ts`): a hachura cobria o vão.

Agora: o corte abre a hachura pelo perfil real, o vão do corte e da elevação sai com o contorno, a face da parede na elevação perde o furo, e o DXF de corte e elevação leva o contorno como polilinha com `bulge` (arcos nativos), e o DXF de planta usa o símbolo de contorno. Vão retangular, ou vão com forma sem o cliente instalado, sai byte a byte igual ao de antes (§2).

## 1. O que foi ligado (arquivo:linha)

| Peça | Onde | O que faz |
|---|---|---|
| Segmentos do contorno com arco | `packages/model/src/openingShapeSegments.ts`: `outlineSegments` (:61), `arcosDoVao` (:23), `cordas` (:18), `mapaSegmentos` (:81); exportado em `packages/model/src/index.ts:120` | Anel de `OpeningSegment { a, b, bulge }` na mesma ordem de `outline`. Arco pleno, abatido, ogival e círculo (largura = altura) saem com `bulge = tan(θ/4)` exato; retângulo e elipse sem ser círculo saem em retas (`outline`). `mapaSegmentos` leva por afim e troca o sinal do bulge quando espelha. [V] |
| Vistas do vão com contorno (novo) | `packages/engine/src/vaoContornoVistas.ts`: `vaosDeContornoDaParede` (:45), `modoDoVao` (:50, perpendicular ou paralelo ao eixo do vão; oblíquo fica de fora), `pontosDaElevacao` (:62, contorno tesselado com `elevationOutline`), `segmentosDaElevacao` (:69), `vaziosDoCorte` (:87), `faixasSemVazio` (:92), `vazioDoVaoNaVista` (:110), `contornoDoVaoNaSecao` (:130), `contornoDoOpeningNaSecao` (:154), `simboloPlantaDoContorno` (:163), `idsDeContorno` (:174) | Tudo o que é específico do contorno nas vistas. Só age sobre `ResolvedWall.furosContorno`: vão fora dessa lista sai como antes. Exportado em `packages/engine/src/index.ts:39`. [V] |
| Corte: faixa da parede com o perfil fora | `packages/engine/src/section.ts:343-344` (vãos e perfil da parede), `:366` (`faixasSemVazio` no lugar do retângulo da faixa, só sem inclinação) | No corte perpendicular, a faixa de cada camada perde o intervalo de z do perfil (`verticalCutProfile`, na cota da linha). A hachura abre pelo arco. [V: `vaoContornoVistas.test.ts` "corte perpendicular"] |
| Corte e elevação: vão com o perfil | `packages/engine/src/section.ts:128` (campo `SectionOpening.contorno`), `:411` (`contornoDoOpeningNaSecao`), `:428-429` (`polygons` e `contorno` no `openings.push`) | Corte: um retângulo por intervalo do perfil (espessura do vão). Elevação: o contorno tesselado, com os anéis em segmentos (`aneis`, com bulge) para o DXF. Vão retangular: o `polygons` é o `rect` de antes e não há campo `contorno`. [V] |
| Face da parede além do plano | `packages/engine/src/section.ts:391` (`difference` com `vazioDoVaoNaVista`) | A face da parede vista além do plano (corte e elevação) perde o furo do contorno. [V: "elevação: a face da parede perde o furo"] |
| Render: vão com contorno no corte e na elevação | `packages/render/src/section/build.ts:210-211` (`if (!model \|\| o.contorno)`) | O vão com contorno sai como preenchimento (vidro ou porta, a cor de sempre) com o perfil como contorno; as peças do modelo (caixa retangular) não saem. [V: `packages/render/src/section/vaoContorno.test.ts`] |
| Escritor DXF: bulge no VERTEX | `packages/io/src/dxfDoc.ts:58` (`bulges` em `DxfPolylineEntity`), `:397` (código 42 no VERTEX, entre a cota Z e a flag) | Campo opcional. Ausente ou zero: o arquivo não muda (teste de identidade). [V] |
| DXF de corte e elevação: arcos | `packages/io/src/dxfSection.ts:21` (`DxfArcoRing`), `:31` (`arcos` no item de vão), `:125-126` (`bulges` no `Shape`), `:143-144` (vão com arcos sai no lugar dos polígonos), `:183` (`bulges` na entidade) | Mesma camada do vão que o DXF já usava (`dxfSectionLayerOf` da categoria, corte ou projeção). [V: `packages/io/src/dxfContorno.test.ts`] |
| Montagem do DXF de seção (app) | `apps/web/src/editor/dxfExport.ts:373` | Cada vão com `contorno` leva `arcos` (pontos e bulges do anel). Os demais itens não mudam. [V] |
| DXF de planta: símbolo de contorno | `apps/web/src/editor/dxfExport.ts:2` (imports), `:141` (`resolveLevel` uma vez por nível), `:147-148` (`rw`, `porContorno`), `:155` (`symbolModelo` = o de antes), `:168-169` (`simboloPlantaDoContorno` quando o vão é de contorno; cota de corte ou meia altura, como a tela) | Vão de contorno com folha zero: o símbolo é o de `openingPlanSymbolPaths` (caixilho na meia-largura real da cota). Vão com folha ou sem contorno: o símbolo de antes. [V: `apps/web/src/editor/dxfContorno.test.ts` "planta com cliente"] |

Não mudou: `packages/engine/src/openingShapeViews.ts` (usa `verticalCutProfile`, `elevationOutline` e `openingPlanSymbolPaths` como estão), `packages/render/src/plan/*` (o símbolo de planta da tela já tinha o contorno, `simboloContorno.ts:14`).

## 2. Decisão: ARC/bulge nativo na POLYLINE, não ARC nem LWPOLYLINE de cordas

- **Escolhido:** a POLYLINE 2D que o escritor já emite (`dxfDoc.ts`), com o `bulge` de cada VERTEX (código 42). Um contorno fechado vira UMA entidade com arcos exatos, e a camada e o peso são os mesmos de antes.
- **Por que não ENTITY ARC:** um contorno com arcos viraria várias entidades soltas (um ARC por trecho, mais as retas), que não formam um contorno fechado único. O bulge guarda o mesmo arco numa entidade só.
- **Por que não LWPOLYLINE de cordas:** exigiria tesselar o arco com tolerância (`CHORD_TOL` = 1 mm em `openingShape.ts`), e a curva sairia como muitos segmentos, com erro de 1 mm. O bulge é exato e é como o AutoCAD guarda arco em polilinha.
- **Elipse sem ser círculo:** não há arco de elipse no DXF; sai em cordas (`outline`, tolerância de 1 mm). Círculo (largura = altura) sai exato, com dois arcos de bulge 1.
- **Planta:** no corte, a largura do vão na cota é só duas retas (o caixilho), então a planta não tem arco no contorno. O símbolo de planta sai em retas, como o da tela.
- **Corte perpendicular:** o perfil na cota de corte é um retângulo por intervalo (a soleira e a curva são cortadas por um plano horizontal de z constante no corte transversal), então não tem arco no corte transversal. Arco aparece na elevação (plano paralelo à parede).
- **Prova de correção do bulge:** `openingShapeSegments.test.ts` integra a área com o bulge (segmento circular `r²/2 (θ − sen θ)`) e compara com a área de `outline` (abatido e ogival dentro de 0,2 %), e com a área analítica exata do arco pleno e do círculo.

## 3. Testes (o que provam)

Rodados nesta sessão, só as áreas tocadas:

- `packages/model/src/openingShapeSegments.test.ts` (7): fecho do anel; retângulo sem arco; arco pleno com área exata; abatido e ogival com área contra `outline`; círculo com área `πr²`; elipse em cordas; forma inválida; espelhar troca o sinal do bulge.
- `packages/engine/src/vaoContornoVistas.test.ts` (6, cliente falso): corte perpendicular abre pelo perfil e a parede fica sobre o arco; área de corte maior com o contorno que com o retângulo; `vaziosDoCorte` e `faixasSemVazio`; elevação com contorno no vão e furo na face, com o arco separado do retângulo bruto; vão retangular com o cliente instalado produz `computeSection` idêntico (JSON); vão com forma sem cliente produz o mesmo resultado do retangular.
- `packages/render/src/section/vaoContorno.test.ts` (2): hachura não cobre o miolo do arco no corte; elevação com o vão só com o preenchimento dele.
- `packages/io/src/dxfContorno.test.ts` (3): código 42 só no vértice com arco (uma entidade a mais em relação ao arquivo sem arco); bulge ausente ou zero: arquivo byte a byte igual; corte com arcos sai como polilinha fechada com bulge.
- `apps/web/src/editor/dxfContorno.test.ts` (4): vão retangular, com o cliente instalado, DXF de planta, corte e elevação idênticos aos sem cliente; vão com forma sem cliente igual ao retangular; elevação com cliente tem mais código 42; símbolo de planta com cliente é outro.

Regressão (vitest, só as áreas tocadas, a suíte inteira não foi rodada): engine `section*`, `furoContorno*`, `openingShape*`, `vaoContornoVistas` e model `openingShape*` (25 arquivos, 188 testes); render `section/`, web `dxf*` e io `dxf*` (49 arquivos, 457 testes); io `pkg` e `zip` (verdes em rodada anterior). Todos verdes. Antes da mudança, a linha de base de `section*`, `openingShapeViews`, `furoContornoTroca`, `render/section`, `io/dxf` tinha 44 arquivos e 427 testes verdes.

Igualdade para vão retangular: o caminho de código é o mesmo (`vaosDeContornoDaParede` vazio, `contornoDoOpeningNaSecao` nulo, sem campo `contorno`, `arcos` ausente, `bulges` ausente, `symbol` o de antes); os testes de identidade acima provam o resultado.

Checagens: `npx eslint` nos arquivos alterados e novos, sem erro (o `section.ts` estava em 421 linhas de código, um acima do limite de 420; a busca do vão com contorno foi para `contornoDoOpeningNaSecao`, e ficou em 420); `npx tsc -p tsconfig.json --noEmit` sem erro nos arquivos tocados; `node scripts/check-boundaries.mjs` ok.

## 4. Achados durante a implementação

- **Polígono de elevação só com os vértices dos segmentos era retângulo.** O arco pleno é um segmento com bulge; o polígono de preenchimento e o furo da face precisam do contorno tesselado. Corrigido: `pontosDaElevacao` usa `elevationOutline` (tesselado), e os segmentos ficam só para o DXF. O teste passou a conferir um ponto acima do arco e dentro do retângulo bruto.
- **Soleira do tipo muda o caso de teste.** `ot_j120` tem soleira de 1,10 m: com altura de 2,4 m o topo do vão passa de 3 m (altura da parede) e a parede acima não existe. Os testes usam a base do `ot_p90` (soleira zero).

## 5. O que ficou de fora

- **Caixilho, folha, vidro e divisões no corte e na elevação.** O vão com contorno sai com o perfil e o preenchimento (vidro, ou cor da porta); não há batente, alizar, folha nem divisões de vidro com a forma. As peças do modelo são caixa retangular (`build.ts:211`). [V]
- **Corte oblíquo ao eixo da parede.** `modoDoVao` devolve `null`: o vão sai retangular, sem o furo de contorno, mesmo que o 3D tenha o furo. [V pelo código]
- **Face atrás do vão no corte perpendicular.** `vazioDoVaoNaVista` remove da face da parede, além do plano, a faixa de z do perfil em toda a extensão `t` do item. A parede que continua ao longo da parede, atrás do vão, deixa de aparecer dentro do arco. É um limite da vista (o plano de corte não sabe a profundidade de cada ponto). [I]
- **DXF de elevação: furo da face em cordas, arco no vão.** O furo da face (`PAREDE_PROJECAO_*`, `PAREDE_ALEM`) sai da engine como polígono tesselado (`difference`), então é polilinha de cordas com erro de 1 mm; o contorno do vão sai com arcos na camada do vão. As duas linhas coincidem a menos de 1 mm. Trocar por arco no furo da face exige a engine devolver o furo como segmentos. [V pelo código]
- **Retorno e recuo.** O retorno (`closure: both`) e o recuo não aparecem nas vistas: são do 3D e do quantitativo (doc 27 §3). [V]
- **Vão com folha no DXF de planta** segue o símbolo do modelo (fase 3, como na tela, `simboloContorno.ts:17`). [V]
- **Símbolo de planta em projeção** (vão acima ou abaixo do corte): usa a meia altura do vão, como a tela. Não foi comparado com a tela no navegador. [I]
- **Cliente real.** Os testes usam o cliente falso (`furoContornoFalso.ts`). A decisão de rota (`clienteFuroContorno() !== null`) é a mesma com o real; o wasm não foi rodado nesta tarefa. [I]
- **Desempenho.** A exportação de planta chama `resolveLevel` uma vez por nível (cache compartilhado). Não medido. [I]
- **Browser.** Nada foi visto na tela: o render foi testado pela lista de desenho (`buildSectionDrawList`), não pelo canvas.

## 6. Como rodar

```
cd /home/user/Hestia
npx vitest run packages/model/src/openingShapeSegments.test.ts packages/engine/src/vaoContornoVistas.test.ts packages/render/src/section/vaoContorno.test.ts packages/io/src/dxfContorno.test.ts apps/web/src/editor/dxfContorno.test.ts
npx vitest run packages/engine/src/section packages/engine/src/furoContorno packages/engine/src/openingShape packages/engine/src/resolve packages/model/src/openingShape packages/render/src/section apps/web/src/editor/dxf packages/io/src/dxf
npx tsc -p tsconfig.json --noEmit && node scripts/check-boundaries.mjs
```
