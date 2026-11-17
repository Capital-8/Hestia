# Spike do caminho C: colunas verticais com base inclinada

Data: 2026-11-17. Código: `packages/engine/src/spike/columns.ts` e `columns.test.ts` (só arquivos novos; nada do produto foi alterado). [V] = verificado por teste ou leitura do código; [I] = inferência.

## 1. O que foi feito

A elevação da parede é decomposta em colunas verticais entre os vértices do contorno (`outline()`, cordas com erro máximo de 1 mm). Acima do furo, a base de cada coluna segue a corda do arco (base inclinada); as laterais têm altura total; com soleira, há um parapeito reto sob o vão.

## 2. Resultados medidos

(a) **Volume removido** [V]: igual a área do contorno x espessura, erro relativo < 1e-9, para meia-lua 0,9 x 1,4 m, arco abatido 1,2 x 1,5 m (flecha 0,2) e o mesmo arco com soleira 0,9 m. Isso é esperado: a coluna trapezoidal reproduz o polígono exato. Já as faixas horizontais têm erro de escada (teste confirma erro de área > 1e-5 m² com 24 faixas).

(b) **Peças por camada** [V para colunas, [I] para faixas]: meia-lua com 24 cordas gera **26 colunas** (24 acima do furo + 2 laterais). O caminho por faixas gera por contagem simples cerca de 49 peças com 24 faixas e 97 com 48 (2 por faixa, mais a de cima), pois cada faixa vira duas peças laterais. Colunas: metade das peças, e a precisão não depende do número de faixas. Atenção: a contagem de faixas é uma estimativa minha, não medida no motor.

(c) **O que o motor aceita** (só leitura) [V]:
- `LayerBand` (`types.ts:32`) só tem **topo** inclinado (`slope`); não existe base inclinada. Precisa de um campo novo (por exemplo `baseSlope`) e de ajuste em `bandVolume`/`bandTopAt` (`profile.ts:11-30`).
- `fuseBands` (`bandFuse.ts:29-69`) funde faixas por intervalo de z e compara `slope`; com base inclinada a fusão por z deixa de valer, e o intervalo z0..z1 de uma coluna inclinada se sobrepõe ao das vizinhas.
- O pintor e o furo trabalham em **fatias horizontais globais** do conjunto de paredes (`resolve.ts` ~270-349: `breakpoints`, furo `furosDe(frag, holes)` por faixa de cota). Colunas inclinadas contrariam esse desenho: cada fatia horizontal tem um polígono em planta, não uma peça inclinada. É a maior mudança.
- Retorno de acabamento (`wrap.ts` ~109-135) é um polígono em planta recortado só por faixa de cota (`resolve.ts` ~340-349); com contorno curvo precisaria seguir a mesma decomposição.
- `wallJunction.ts:84` e `wallTiltQuantities.ts:76` abandonam a lógica quando há `slope`; com bases inclinadas as junções de paredes e o quantitativo cairiam nesse atalho (d) [I; não testado, só leitura].

## 3. Veredito

**C é viável com ressalvas, e mais caro que parece.** Em geometria é melhor que faixas (exato, menos peças). Em arquitetura do motor é intrusivo: exige base inclinada em `LayerBand`, mudar a fusão, o pintor (fatias horizontais) e o retorno do acabamento, e a junção/quantitativo precisam de testes novos [I].

Comparação com A (doc 11): a booleana 3D custa de 3 a 45 ms por parede de 5 camadas com 1 a 4 aberturas [V, doc 11], dá volume exato e não mexe no modelo de bandas, mas traz biblioteca nova (Apache-2.0) e a malha do furo fica fora das bandas (quantitativo e junção precisam ler o resultado). Minha leitura [I]: **A** é o melhor para contorno livre; **C** só compensa se o produto quiser manter tudo em bandas. Decisão é do dono do projeto.

## 4. O que não foi feito

Não rodei o furo dentro do motor real (só a decomposição geométrica), não medi tempo das colunas e não testei junção de paredes nem quantitativo; as ressalvas (c)/(d) vêm de leitura de código.
