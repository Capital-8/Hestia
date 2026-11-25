# Guia de ícones das ferramentas de instalações (MEP)

Referência: `apps/web/src/ui/Icon.tsx` (gramática) e `apps/web/src/ui/iconesMep.ts` (4 ícones de referência).
Prévia visual: `previa.html` / `previa.png` (claro e escuro, 32 e 64 px, ao lado de parede, componente e biblioteca).

## 1. Gramática encontrada em Icon.tsx

- `viewBox="0 0 32 32"`, SVG com classe `ic`; marcação é uma string de `<path>`/`<circle>`/`<text>` montada por `p(classe, d, extra)` => `<path class="ic-CLASSE" d="..."/>`.
- Sólidos cinza sombreados, luz de cima-esquerda: `s1` topo/claro, `s2` face esquerda/frontal, `s3` face direita/sombra. `bl` azul (superfícies, resultado), `gl` cinza-azulado (vidro/solo). Preenchimento por degradês `#ic-g1/g2/g3/gb/gg` (definidos em `IconDefs`), contorno fixo `#5b6369` de 1px.
- Linhas: `ln` (1,1px) e `ln2` (1,8px) na cor `--ic-ink`; `ds` acrescenta tracejado `3 2`.
- Laranja `#e8892b` só para a AÇÃO: `ac` (traço 1,6px: eixo, esboço, marca) e `fa` (preenchido: ponta de seta, ponto, vértice).
- Todo traço usa `vector-effect: non-scaling-stroke` (espessura em pixels de tela, nítida de 14 a 28 px).
- Tema: os degradês e o contorno cinza são iguais nos dois temas; só `--ic-ink` muda (`#5b6369` claro, `#c3c9cf` escuro) e afeta `ln`, `ln2` e texto. O laranja é fixo. Cores próprias fora das classes usam `fill` inline (caso de `materialSphere`, `qhelp`).

## 2. Regras

**Grade e margens.** 32x32, margem mínima de 2 (ideal 3) até a borda; o desenho ocupa o quadro (como parede e componente). Coordenadas inteiras ou meias; sem geometria fora de 1..31.

**Espessura.** Nunca definir `stroke-width` em sólido de classe: vem do CSS (1px sólidos, 1,1px `ln`, 1,8px `ln2`, 1,6px `ac`). Em cor própria inline usar `stroke="#5b6369" stroke-width="1"`.

**Arredondamento.** Cantos vivos, como o resto do sistema (junções e pontas já são arredondadas por `stroke-linejoin/linecap: round`). Curvas só quando a peça é curva (arcos `A`). Nós de rede e pontos: círculos.

**Paleta.** Cinza para a peça física (s1/s2/s3), azul `bl` para resultado/superfície/selo, laranja só para o que o usuário faz ou confere (eixo, ponto de clique, seta, marca). Máximo de um acento laranja e um azul por ícone. Emblemas de sistema são a exceção: disco `r=13` de cor própria do sistema com glifo branco, sem laranja. Cores: esgoto `#8a5a2b` (marrom), água fria `#2a7fd4` (azul), elétrico `#d4a017` (amarelo), HVAC `#2fa36b` (verde), estrutura `#6b7280` (cinza-grafite). Glifo do emblema sempre branco `#ffffff`.

**Composição (metáfora por ferramenta).**
- Tubo: duas linhas paralelas (corpo em metades s1/s3), bolsa na ponta (s2, mais alta que o corpo), eixo laranja embaixo com ponto de clique e seta.
- Joelho: o mesmo tubo dobrado a 90 graus, bolsas nas duas pontas, eixo laranja tracejado com ponto no vértice.
- Verificar rede: rede (tronco e ramais `ln2` com nós `s2`) e selo azul com marca de conferência laranja no canto inferior direito.
- Sistemas (esgoto, água fria, elétrico, HVAC, estrutura): emblema de disco com a cor do sistema e glifo branco que o distingue (queda, gota, raio, ar, viga).
- Cada ferramenta tem o seu; nunca reaproveitar o ícone de outra (o problema que esta família resolve).

**Nomes.** Chave em `ICONES_MEP` = `mep` + nome em PascalCase sem acento: `mepTubo`, `mepJoelho`, `mepVerificarRede`, `mepEsgoto`, `mepAguaFria`. Sistemas: `mep` + nome do sistema.

**Como testar claro e escuro.** Abrir `previa.html` (copia o CSS `.ic` de `styles.css`, degradês e os dois valores de `--ic-ink`) ou regerar: `node` importando `iconesMep.ts` e fotografar com Playwright (chromium, `--no-sandbox`). Conferir 32 e 64 px e, no app real, 20 px com `data-theme="light"` e `"dark"`. Os ícones devem se ler em 20 px sem depender do tracejado.

## 3. Checklist de revisão (8 itens)

1. Cabe em 32x32 com margem mínima de 2 e ocupa o quadro.
2. Só usa as classes do sistema (`s1 s2 s3 bl gl ln ln2 ac fa ds tx`); cor própria só em emblema de sistema.
3. Luz de cima-esquerda coerente (claro em cima/esquerda, sombra embaixo/direita).
4. Laranja só em ação (eixo, clique, seta, marca) e no máximo um acento azul.
5. Lê-se a metáfora da ferramenta em 20 px, sem legenda.
6. Não repete nem se confunde com outro ícone da faixa.
7. Legível em claro e escuro (conferido na prévia nos dois fundos).
8. Chave `mepNome` única, string estática no formato de `Icon.tsx`, `tsc` e `eslint` limpos.
