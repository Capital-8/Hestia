# Plano: aberturas por booleana (portas, janelas e aberturas em geral)

Data: 2026-11-17. Planejamento, sem implementação. Marcas: [V] verificado no repositório nesta sessão; [S] spike (`09-spike-furo-por-contorno.md`); [I] inferência minha, a validar; [E] estimativa minha, ordem de grandeza.

## 1. Ponto de partida

- A parede é uma pilha de camadas. Cada camada é uma lista de **bandas**: polígono em planta mais `z0`/`z1`, com topo inclinado opcional (`slope`) [V `packages/engine/src/types.ts:32`]. Junção, quantitativo, planta, corte e 3D consomem bandas, nunca o vão [S].
- O furo hoje é um retângulo constante por faixa de altura [S]. O 3D desenha um prisma por banda [S].
- O kernel Rust (`crates/geom-wasm`) só faz booleana e offset **2D** de polígonos, com a biblioteca `i_overlay` (Rust puro) [V `Cargo.toml`]. O próprio `Cargo.toml` registra que dependências C++ não compilam para `wasm32` neste ambiente [V].
- Não existe CSG 3D no Hestia [V: busca por manifold/csg não achou código de motor].
- O Lapin faz a booleana 3D: extruda o contorno e subtrai da parede com kernel B-rep e manifold [V `Openings.cs`, função `Cutter`].

## 2. Três caminhos

| | Descrição | Resultado | Custo | Risco |
|---|---|---|---|---|
| **A. Booleana 3D real** | Cada camada vira sólido; subtrai-se o prisma do contorno | Curva lisa, sem degrau | Alto [E] | Desempenho de edição; duas fontes de verdade (sólido x bandas) |
| **B. Híbrido** | Bandas continuam sendo a verdade para quantitativo, junção, planta e corte. A booleana 3D só gera a malha visual e a exportação IFC | Visual liso, quantitativo com erro desprezível (0,036% com 24 faixas [S]) | Médio-alto [E] | Dois caminhos de geometria a manter iguais |
| **C. Faixas verticais inclinadas** (alternativa sem booleana) | Em vez de faixas horizontais, decompor a elevação em colunas verticais cujo topo ou base segue a corda do arco, estendendo o `slope` de topo que já existe para base também | Arco poligonal exato (erro 1 mm) com algumas dezenas de peças, sem degrau | Médio [E] | Bandas com base inclinada ainda não existem; junção, retorno e Rust precisam aceitá-las. **[I] não verificado: o spike não avaliou esta opção** |

Recomendação: antes de comprometer A ou B, fazer um **spike de 2 a 3 dias que compara A (biblioteca de booleana 3D) e C (colunas inclinadas)** no mesmo caso (meia-lua em parede de 5 camadas), medindo: volume, número de bandas ou triângulos, tempo de resolução, e o que quebra em junção, retorno e planta. A decisão sai dos números.

## 3. Como seria a booleana (caminhos A e B)

**Biblioteca [I]:** o Lapin usa manifold. Para o Hestia, a opção realista é a versão JavaScript/WASM pré-compilada (`manifold-3d`, Apache-2.0), porque compilar C++ para WASM já falhou neste projeto. Alternativa em TypeScript puro: `three-bvh-csg` (MIT), menos robusta em casos degenerados. Verificar no spike: licença e `NOTICE`, tamanho do pacote, carregamento no navegador e nos testes, determinismo.

**Fluxo:**
1. Por camada e por parede, montar o sólido (extrusão das bandas já resolvidas) ou usar o prisma da camada.
2. Para cada abertura com forma não retangular, gerar o **cortador**: o contorno (`outline(shape, w, h, recuo)`) extrudado pela espessura mais folga, no referencial da parede (reta, curva ou inclinada).
3. Subtrair o cortador de cada camada. A camada de acabamento recebe o retorno pelo contorno deslocado.
4. Malha resultante vai para o 3D e para o IFC. No caminho B, as bandas aproximadas seguem alimentando o resto.
5. Cache por parede: recalcular só as paredes tocadas pela edição.

**Desempenho [I]:** o projeto tem baselines de 20 pavimentos e já sofreu com latência de edição (handoffs de GPU e Rust). Booleana 3D por camada por abertura em toda edição é o maior risco. Mitigações: só aplicar booleana em aberturas **não retangulares** (as retangulares continuam no caminho atual, sem custo), cache por parede, e recalcular em segundo plano.

## 4. Peças que seguem o contorno (portas e janelas)

Todas derivam de uma única função `outline(shape, w, h, recuo)` usada por motor e interface (lição do Lapin; ele tem fórmulas diferentes na interface e no motor, defeito a evitar).

| Peça | O que muda | Porta | Janela |
|---|---|---|---|
| Corte da parede | contorno extrudado, ou colunas (C) | cabeça em arco; base vai até o piso, contorno aberto embaixo | contorno fechado (meia-lua, óculo, oval) |
| Retorno do acabamento (`wrap.ts`) | faixa em torno do contorno | idem | idem |
| Batente / aduela | perfil varrido ao longo do contorno deslocado (precedente: `PartProfile`) | só lados e cabeça; soleira reta | anel fechado |
| Folha / vidro | prisma do contorno reduzido | folha segue o arco; folha de correr em arco é inválida e deve avisar | vidro fixo ou folha de abrir; correr e guilhotina em arco: avisar |
| Alizar | faixa em torno do contorno | idem | anel; peitoril reto só se a base for reta |
| Verga / arco de alvenaria | verga curva ou reta oculta (parâmetro) | sim | sim |
| Planta | largura do vão na altura do plano de corte (hoje usa a largura máxima [S]) | arco de giro continua; porta em arco abre em planta como as demais | idem |
| Corte e elevação | contorno projetado; barras de bandeira | sim | sim |
| IFC export | perfil arbitrário do vão e das peças (`IfcIndexedPolyCurve` com `IfcArcIndex`; círculo por `IfcCircleProfileDef`) | sim | sim |
| IFC import | reconhecer perfil, classificar a forma, avisar quando aproximar (já aproxima com aviso, tarefa 0c) | sim | sim |
| Quadro e quantitativos | área, perímetro e largura/altura de caixa envolvente | sim | sim |
| Validações | dentro da parede pela caixa envolvente; forma inválida (auto-interseção) recusada | sim | sim |
| Alças e cotas | alça de flecha, largura, altura; cota do arco | sim | sim |

**Diferenças porta x janela:** porta tem peitoril 0 e contorno aberto embaixo (o cortador atravessa o piso acabado até a soleira); janela tem contorno fechado e peitoril. Bandeira em arco sobre porta de folha reta é combinação frequente: a composição precisa aceitar uma célula superior com contorno. Janela circular (óculo) funciona em B e em A; em C exige decomposição em colunas dos dois lados do círculo.

## 5. Aberturas em geral

O mesmo mecanismo (contorno -> cortador -> subtração) serve para tudo que fura um elemento. Estado no Hestia [V só do hospedeiro parede; o resto não foi verificado nesta sessão]:

| Tipo de abertura | Hospedeiro | Observação |
|---|---|---|
| Porta e janela | parede (reta, curva, inclinada) | foco deste plano |
| Vão nu (sem esquadria) | parede | Lapin tem `BareOpenings` com forma e contorno livre; só o cortador, sem peças |
| Vão que atravessa várias paredes | várias | o Lapin tem; o Hestia: a confirmar |
| Portão de garagem | parede | retangular na maioria; arco só como cabeça |
| Esquadria em parede cortina | célula da cortina | hoje um retângulo virtual por célula e região fundida retangular [V auditoria R*]; contorno em arco fica **fora da primeira versão** |
| Vão em laje ou piso (escada, shaft, claraboia) | laje | a confirmar como o Hestia fura laje; o contorno vale também aqui |
| Abertura em telhado (claraboia, dormer) | telhado | o Lapin tem; o Hestia: a confirmar |
| Nicho (não passante) | parede | cortador com profundidade limitada; a confirmar se existe |

**Regra de projeto:** um tipo `Cutter` genérico (contorno + profundidade + referencial do hospedeiro), usado por parede, laje e telhado. Cada hospedeiro só traduz seu referencial. Na primeira versão, só parede reta e curva; parede inclinada e cortina recusam forma não retangular com aviso.

## 6. Fases

| Fase | Entrega | Quem | Gate |
|---|---|---|---|
| S0 | Spike comparativo A x C (meia-lua e arco abatido, parede de 5 camadas, medir volume, bandas/triângulos, tempo, quebras) + decisão sua | Sonnet | relatório com veredito |
| 1 | Modelo `OpeningShape`, `outline()` única, migração de esquema, testes de invariantes | Sonnet | testes de modelo |
| 2 | Cortador e corte da parede no caminho escolhido, parede reta e curva | Sonnet | volume bate com a área do contorno x espessura |
| 3 | Retorno do acabamento e peças (batente, vidro, folha, alizar) | Sonnet (batente) + Haiku (vidro, alizar) | colisão e dentro do vão |
| 4 | Planta, corte, elevação, DXF, 3D | Haiku | goldens |
| 5 | Composição: bandeira em arco, barras, muntins | Sonnet | testes de composição |
| 6 | IFC export e import com perfil; quadro e quantitativos | Haiku | round-trip |
| 7 | Interface: seletor de forma, alças, editor de contorno, avisos | Haiku (formulários), Sonnet (alças) | testes de UI |
| 8 | Rust: porte do corte e do retorno, contrato novo (versão do esquema sobe), WASM refeito, equivalência TS x Rust | Sonnet | `test:wasm` |
| 9 | Outros hospedeiros (laje, telhado) e vão nu com forma | Haiku/Sonnet | por hospedeiro |

## 7. Esforço e riscos [E]

- Spike S0: 2 a 3 dias. Caminho C: de 5 a 8 dias só em TypeScript, mais 3 a 5 do Rust. Caminho A ou B: de 8 a 15 dias [E], mais o Rust se a booleana for também portada, o que provavelmente não acontece (a booleana 3D ficaria em JavaScript e o Rust cairia no caminho TypeScript para essas aberturas).
- Riscos principais: desempenho de edição com booleana 3D; duas fontes de verdade em B; robustez da biblioteca em geometria degenerada (cortador tangente à face); retorno de acabamento acompanhando o contorno; goldens visuais a regravar; contrato `cena-v*.json` muda na entrada.
- Licença: Lapin é MIT (pode-se reimplementar e citar no `NOTICE`); CreaBIM é GPL (só ideias).

## 8. Decisão pedida

Aprovar o **spike S0 comparativo (A x C)** antes de qualquer implementação. Se o resultado indicar que C resolve com qualidade suficiente, a booleana 3D fica descartada por custo; se não, segue o caminho B.
