# Metodologia de execução: parede com formas, parede inclinada, perfil de topo e base

Manual do fiscal. Decisões de produto estão fechadas; o que este documento chama de "padrão proposto" é detalhe técnico que o fiscal confirma no spike indicado e registra em `docs/parede-formas/ESTADO.md`.
Fases: 1 Parede com formas · 2 Parede inclinada · 3 Perfil de topo e base · 4 Laje livre · 5 Massa v2. Detalhe só das fases 1 a 3.

## 1. Regras do jogo

1. **Papéis.** Dono decide produto e testa à mão no fim de cada fase. Fiscal (Sonnet) despacha, confere, mescla, renumera esquema e escreve o ESTADO. Executor faz UMA ficha e nada além dela.
2. **Uma ficha por vez por executor.** Paralelo só entre fichas sem arquivo em comum e nunca duas fichas com `.rs` (conflitam em `packages/geom/assets`).
3. **Escopo de arquivos.** A ficha lista os arquivos permitidos. Precisou de outro: o executor para e pede; o fiscal autoriza por escrito no ESTADO ou abre ficha nova.
4. **Modelo.** Haiku 5.5 effort high: interface, i18n, faixa, testes de matriz, capturas, fichas com oráculo pronto. Sonnet 5.5 effort medium: geometria, junções, migração, comandos de modificar, IFC. Nunca opus/fable.
5. **Ambiente.** `. ~/hestia-tools/env.sh`; branch `frente/parede-formas` a partir de `integracao/massa-suplementos`; worktree manual por ficha (`git worktree add /home/dennylson/hestia-wt/<id> -b pf/<id> frente/parede-formas`, depois `npm ci` dentro dele; nunca symlink de `node_modules`, nunca `isolation: "worktree"`). Rust: `CARGO_TARGET_DIR=/tmp/hestia-target-pf`.
6. **Commits `wip`** antes de todo comando longo (testes, build:wasm). Executor interrompido é retomado do `wip`.
7. **Devolver a ficha quando:** portão vermelho; arquivo fora do escopo tocado; teste sem valor literal da seção 4; relatório sem a saída dos comandos; teste existente alterado ou apagado sem autorização.
8. **Relatório do executor:** arquivos tocados, saída resumida de cada portão, pendências. Sem relatório, o fiscal confere pelo worktree e pelos testes.
9. **Uma suíte por vez** na máquina. O fiscal não roda portão enquanto executor roda teste; falha de tempo se repete com a máquina livre antes de virar devolução.
10. **Passo 0 do fiscal:** medir a linha de base de todos os portões (números no ESTADO), guardar `clippy-base.log`, e responder com `grep` as três perguntas da seção 3.0.

## 2. Spikes de risco (antes de qualquer ficha da fase correspondente)

Spike = branch descartável `pf/spike-sN`, executor Sonnet, entrega: um arquivo de função pura + um arquivo de teste + 10 linhas de conclusão no ESTADO. Não toca interface, não toca `joins.ts` (copia o que precisar para o arquivo do spike). O fiscal aprova ou aplica o plano B. S2 e S3 antecedem a Fase 1; S1 e S4 antecedem a Fase 2 e podem rodar durante a Fase 1.

Convenções dos spikes: `tilt` em graus com sinal, positivo = topo desloca para a esquerda de a→b (mesma convenção de `sag`); `d(z) = z·tan(tilt)`; H = altura vertical; t = espessura perpendicular à face.

### S1 · Junção de duas paredes inclinadas

- **Pergunta.** Calcular a junção no nível da base e no nível do topo e ligar por faces regradas dá um sólido fechado e correto para reta×reta, reta×arco e arco×arco, em canto (`pair`) e encosto (`tee`)?
- **Regra fixa.** A topologia (quem junta com quem, `endPartners`/`joinStatus`) é decidida SÓ na base, pelos eixos, como hoje. O topo reaplica a mesma topologia aos eixos deslocados por `d(H)`; nunca procura parceiros de novo.
- **Entrega mínima.** `wallTiltJoin.spike.ts`: dados dois `WallFrame` com tilt, devolve os polígonos de planta em z=0, z=H/2 e z=H e a malha do par. Teste com os casos abaixo e fuzz.
- **Referência à mão (H=3).** Parede A no eixo x (y=0), topo deslocando para −y; parede B no eixo y (x=0), topo deslocando para −x; canto na origem. Cruzamento das linhas de base na altura z: `(−z·tanθB, −z·tanθA)`.

| Caso | θA | θB | Canto em z=1,5 | Canto em z=3 |
|---|---|---|---|---|
| iguais | 15° | 15° | (−0,4019; −0,4019) | (−0,8038; −0,8038) |
| diferentes | 15° | 30° | (−0,8660; −0,4019) | (−1,7321; −0,8038) |
| uma vertical | 0° | 30° | (−0,8660; 0) | (−1,7321; 0) |

- **Critérios de aceite (reta×reta, exato).** (a) os três cantos de cada caso são colineares e batem com a tabela a 1e-6 m; (b) todo vértice da face de junção dista < 1e-9 m dos dois planos de face; (c) malha fechada: toda aresta em exatamente 2 triângulos, normais para fora; (d) volume da malha = `H/6·(A0 + 4·Am + AH)` com as áreas de planta dos três níveis, erro relativo < 1e-9 (a área é quadrática em z, Simpson é exato); (e) com θA=θB=0 o resultado é idêntico ao `computeEnds` atual.
- **Critérios (com arco, aproximado).** Mesmos (c) e (e); (d) com erro relativo < 1e-3 usando N níveis intermediários; o spike informa o menor N que garante desvio < 1 mm entre a face regrada e a interseção real cone×plano (padrão proposto: N=4, sobe até 16).
- **Fuzz.** 500 pares com semente fixa (PRNG próprio, nunca `Math.random`): ângulo entre eixos 20° a 160°, tilt −45° a 45° em cada parede, t 0,10 a 0,40, H 2 a 6, sag 0 ou até metade da corda. Propriedades: (c), (d), nenhum NaN, nenhum triângulo de área < 1e-12, tempo < 2 ms por par.
- **Não passou.** reta×reta falha: parar a Fase 2 e chamar o dono (o modelo de dois níveis está errado). Só arco falha: Fase 2 entrega junção exata em reta×reta e, com arco inclinado, corte de topo simples (`noJoin` geométrico) com aviso; abre ficha de dívida.

### S2 · Arcos consecutivos tangentes (junção de ~180°)

- **Pergunta.** Duas paredes em arco que se encontram tangentes (círculo = 2 arcos de 180°; cadeia de elipse) formam hoje uma parede contínua, sem dente, sem linha de emenda na planta e sem face interna no 3D?
- **Por que é risco.** A esquadria de canto degenera quando o ângulo entre as tangentes tende a 180° (divisão por seno perto de zero); `sag = corda/2` é o limite exato do campo; a tolerância de junção é 0,02 m pelo eixo.
- **Entrega mínima.** Teste só de leitura sobre o código atual: círculo r=3 (paredes a=(−3,0) b=(3,0) e a volta, `sag` = 3 em módulo), t=0,2, H=3; e dois arcos tangentes de raios 2 e 5.
- **Referência.** Área de planta do círculo = `2π·r·t` = 3,7699 m²; volume = 11,3097 m³; comprimento do eixo = 18,8496 m.
- **Passa se.** `joinStatus` das 4 pontas = `pair`; área da união dos polígonos de planta bate a 1e-4 (tolerância relativa da discretização documentada); a face de topo de cada parede na ponta é radial (desvio angular < 1e-6 rad); zero aresta de emenda desenhada na planta entre paredes do mesmo tipo; resultado igual ao trocar a ordem (`order`) das duas paredes.
- **Não passou.** Abre a ficha F1.5 (caso "tangente" no `joins.ts`: se |sen do ângulo entre tangentes| < 1e-3, corte de topo perpendicular à tangente em vez de esquadria). Sem S2 aprovado ou F1.5 mesclada, as fichas de círculo/elipse/spline não começam.

### S3 · Ajuste de elipse e spline a cadeia de arcos tangentes

- **Pergunta.** Um ajuste por biarcos com bisseção recursiva atende a tolerância com poucos arcos, de forma determinística?
- **Entrega mínima.** `curveFit.ts` puro: `fitArcs(curva, tol, maxArcos) → {a, b, sag}[]`, sem dependência de ids nem de relógio. Padrões propostos: tol 5 mm (configurável 1 a 50 mm), máximo 64 arcos por curva, spline = interpoladora cúbica centrípeta pelos pontos clicados (Catmull-Rom). O spike também diz se `ellipseShape` do esboço é reaproveitável ou só serve de conferência.
- **Referência (elipse rx=4, ry=2).** Perímetro 19,3769 m; área 25,1327 m². Círculo como spline de 8 pontos: raio de todo arco = r ± tol.
- **Passa se.** (a) desvio máximo curva×arcos, amostrando 32 pontos por arco, ≤ tol; (b) tangência: diferença de direção entre arcos vizinhos < 1e-6 rad; pontas coincidentes a 1e-9 m; (c) todo arco ≤ 180° e |sag| ≤ corda/2; (d) elipse sai com número de arcos múltiplo de 4 e simétrica nos dois eixos; com tol 5 mm usa ≤ 16 arcos; (e) |Σ comprimentos − 19,3769| < 0,02 e |área − 25,1327| < 0,1; (f) determinismo: duas execuções dão JSON idêntico byte a byte, e inverter a ordem dos pontos dá a mesma cadeia invertida; (g) ao bater `maxArcos` devolve o melhor ajuste mais um aviso, nunca lança erro; (h) arco com raio < t/2 + 1 cm gera aviso (face interna se cruza).
- **Não passou.** (a) ou (b) falham: trocar biarco por ajuste em 3 pontos com tangente herdada (`arcTangent` já existe). Se ainda falhar, spline sai da Fase 1 (elipse fica com a forma fechada de 4·n arcos) e o dono é avisado.

### S4 · Abertura em parede inclinada

- **Pergunta.** Qual o sólido de corte e a posição do caixilho nos modos "plano vertical" e "plano inclinado"?
- **Definições (padrão proposto).** Peitoril `s` sempre vertical (cota z). Largura `w` medida ao longo da linha de base. Modo inclinado: o caixilho fica no plano da parede, a altura `h` é medida na face; ocupação vertical = `h·cosθ`; o corte é um prisma perpendicular à face. Modo vertical: caixilho em plano vertical, o corte é uma extrusão horizontal na normal da parede.
- **Entrega mínima.** `openingTilt.spike.ts`: devolve o sólido de corte e o referencial do caixilho; testes com os valores abaixo. Parede reta; no fim, o spike relata se o modo inclinado é viável em arco (plano tangente no centro do vão).
- **Referência (θ=15°, t=0,2).**

| Caso | Valor |
|---|---|
| Janela 1,2×1,0, s=1,0, inclinado: topo do vão | z = 1,0 + 1,0·cos15° = 1,9659 |
| idem: deslocamento horizontal do centro do caixilho | (1,0 + 0,4830)·tan15° = 0,3974 |
| idem: volume retirado | w·h·t = 0,2400 m³ |
| Porta 0,9×2,1, s=0, vertical: profundidade horizontal do corte | t/cosθ + h·tanθ = 0,2071 + 0,5627 = 0,7697 |
| idem: volume retirado | w·h·t/cosθ = 0,3913 m³ |
| idem: posição do plano do caixilho (centro da parede a meia altura) | (s + h/2)·tanθ = 0,2813 |

- **Passa se.** Valores a 1e-4; parede menos corte é malha fechada; com θ=0 os dois modos dão exatamente o corte atual (`openingCut.ts`); o recuo (reveal) informado nas quatro bordas é ≥ 0.
- **Não passou.** Modo inclinado fica só para parede reta; em arco inclinado só o modo vertical, com aviso. Se nem o reto passar, a Fase 2 sai sem aberturas em parede inclinada (validação bloqueia) e o dono decide.

## 3. Fichas das fases 1 a 3

### 3.0 Perguntas que o fiscal responde no Passo 0 (definem arquivos e modelo)

1. O sólido 3D e o corte da parede são gerados em TS (`packages/engine`) ou no kernel Rust? Se Rust, F2.3, F2.4, F2.8 e F3.2 viram fichas de Rust sequenciais, com contrato novo (seção 6).
2. Quais arquivos implementam os 9 comandos de modificar (lista exata vai para F1.6, F2.11 e F3.6).
3. Onde ficam as opções da ferramenta (`wallShape` em `env.options()`), a faixa e os arquivos `areas/*.ts` de i18n.

**Achado do dono da sessão (já resolve parte da pergunta 1):** as junções existem **nas duas linguagens**. `packages/engine/src/joins.ts` (TS) e `crates/geom-wasm/src/juncoes.rs` (Rust), este último descrito como porte passo a passo do TS (sub-etapa A1, ponte em `packages/engine/src/kernelA1.ts`). Logo, toda mudança de junção (S2/F1.5, S1/F2.4) vale nas DUAS e precisa dos testes de paridade TS×Rust; ficha de junção é de Rust e entra no contrato do kernel, com a regra de renumeração da seção 6. Falta o Passo 0 confirmar se o sólido 3D da parede também passa pelo Rust.

Onde a tabela diz "(P0)", o fiscal troca pelo caminho achado. Todo aceite inclui os portões da seção 5.1.

### Fase 1 · Parede com formas (sem mudança de esquema)

| Id | Objetivo | Arquivos permitidos | Dep. | Modelo | Aceite |
|---|---|---|---|---|---|
| F1.1 | `fitArcs` definitivo a partir do S3 | `packages/geom/src/curveFit.ts` + teste | S3 | sonnet | critérios do S3 como testes |
| F1.2 | Forma → lista `{a,b,sag}`: polígono inscrito/circunscrito, círculo (2 arcos), elipse, spline, reusando os geradores de `sketchShapes*.ts` sem alterá-los | `packages/tools/src/wallShapes.ts` + teste | F1.1 | haiku | hexágono r=3: 6 paredes de 3,000 (inscrito) e 3,4641 (circunscrito); círculo: 2 paredes, sag=±r |
| F1.3 | Modos novos no `wallTool` (pré-visualização, cancelar, desfazer em um passo só) | `wallTool.ts`, tipo das opções (P0) + teste | F1.2, S2 | sonnet | cada modo cria N paredes comuns em UM comando de desfazer; pontas em `pair` |
| F1.4 | Barra de opções (lados, inscrito/circunscrito, tolerância), faixa, atalhos, i18n 7 idiomas | (P0) faixa, `areas/*.ts`, ribbon-i18n JSON | F1.3 | haiku | `check:ribbon-i18n` 0 faltando |
| F1.5 | Junção tangente (só se o S2 reprovar) | `packages/engine/src/joins.ts`, `joinTypes.ts` + teste | S2 | sonnet | critérios do S2; os 43 testes de junção existentes intactos |
| F1.6 | Matriz 9 comandos × {círculo, elipse, polígono}: só testes; defeito vira ficha nova | arquivo de teste novo | F1.3 | haiku | 27 casos; cada um confere contagem de paredes, tangência e `joinStatus` depois do comando |
| F1.7 | Portas/janelas, cotas, IFC e DXF sobre as formas; roteiro E2E e capturas | script e2e novo + testes | F1.4 | haiku | 0 erro de console; porta em parede de elipse abre vão |

### Fase 2 · Parede inclinada (sobe o esquema uma vez, na F2.1)

| Id | Objetivo | Arquivos permitidos | Dep. | Modelo | Aceite |
|---|---|---|---|---|---|
| F2.1 | Campo `tilt?: number` na `Wall` (ausente = 0), `makeWall`, validação, comando `setWallTilt`, migração | `packages/model/src/types.ts`, migração e comandos (P0) + testes | Fase 1 | sonnet | ver detalhe |
| F2.2 | Funções puras: `d(z)`, espessura horizontal, eixo no nível z (reta e arco), volume, área de face | `packages/engine/src/wallTilt.ts` + teste | F2.1 | sonnet | tabela 4.2 a 1e-4 |
| F2.3 | Sólido de UMA parede inclinada (sem junção), reta e arco, com camadas | (P0) gerador do sólido + teste | F2.2 | sonnet | volume da malha = 4.2; malha fechada; tilt=0 dá malha idêntica à atual |
| F2.4 | Junção em dois níveis, do S1 para a produção | `joins.ts`, `joinTypes.ts`, (P0) + testes | S1, F2.3 | sonnet | ver detalhe |
| F2.5 | Planta: seção no plano de corte deslocada por `d(zCorte)`, projeção de base e topo | (P0) planta + teste | F2.4 | sonnet | hachura deslocada 0,3215 para θ=15° e corte a 1,20; tilt=0 sem diferença de pixel |
| F2.6 | Corte e elevação | (P0) + teste | F2.4 | sonnet | seção é paralelogramo de base t/cosθ |
| F2.7 | Quantitativos pela face real | (P0) tabelas + teste | F2.2 | haiku | 4.2 |
| F2.8 | Abertura: campo `plano: 'vertical' \| 'inclinado'`, corte e recuo do S4 | `openingCut.ts`, `openingExtents.ts`, tipo da abertura + testes | S4, F2.4 | sonnet | tabela do S4; padrão janela=inclinado, porta=vertical |
| F2.9 | Interface da opção por abertura + i18n | (P0) | F2.8 | haiku | i18n completo |
| F2.10 | Painel de propriedades, barra de opções ao desenhar, comando "Inclinar" (várias paredes, um desfazer), i18n, faixa | (P0) | F2.1 | haiku | Inclinar em 5 paredes = 1 passo de desfazer |
| F2.11 | Comandos de modificar preservam o tilt | arquivos dos 9 comandos (P0) + teste de matriz | F2.4 | sonnet | ver detalhe |
| F2.12 | Snaps e cotas pela linha de base; IFC (reta: extrusão com direção inclinada; arco: malha), DXF | (P0) | F2.5 | sonnet | volume no IFC = 4.2 a 1e-3; reimportar não quebra |
| F2.13 | Roteiro E2E e capturas da fase | script e2e | todas | haiku | seção 5.3 |

**Detalhe F2.1.** `tilt` em graus com sinal (positivo = topo para a esquerda de a→b), limite proposto |tilt| ≤ 60°. Validação: `tilt ≠ 0` e `topProfile ≠ null` não coexistem (o comando recusa com mensagem traduzida; nunca apaga um dos dois calado). Arco inclinado para o centro exige `R − H·tan|θ| > t/(2cosθ) + 0,01`, senão recusa. Migração: só sobe a versão; nenhum elemento é reescrito. Aceite: arquivo de exemplo da versão anterior abre e, salvo de novo, tem os elementos idênticos byte a byte (fora o número da versão).

**Detalhe F2.4.** Só começa com o S1 aprovado no ESTADO. A assinatura de `computeEnds` não muda para quem não usa tilt: a função nova recebe o nível z e chama a existente com os eixos deslocados; a topologia vem da base. Aceite: todos os critérios do S1 como testes permanentes (fuzz de 500 pares com semente fixa incluído); os testes de junção existentes passam sem edição; `tee` em parede inclinada: a ponta da parede que encosta é cortada pelo plano inclinado da hospedeira (comprimento varia `d(z)` entre base e topo).

**Detalhe F2.11.** Matriz 9 comandos × {reta, arco} × tilt {+15°, −15°}. Regras: Espelhar inverte o sinal; qualquer operação que troque `a` com `b` inverte o sinal de `tilt` junto com o de `sag` (a "esquerda" muda); Dividir e Matriz copiam o tilt; Deslocar, Aparar, Estender, Girar e Alinhar operam pela linha de base e não tocam o tilt; Filete entre tilts diferentes cria o arco com o tilt da primeira parede e emite aviso traduzido. Aceite de cada caso: o plano da face (ou cone) depois do comando é o esperado em 3 pontos de conferência a 1e-9, não só "o campo tilt continua lá".

### Fase 3 · Perfil de topo e base (sobe o esquema uma vez, na F3.1)

| Id | Objetivo | Arquivos permitidos | Dep. | Modelo | Aceite |
|---|---|---|---|---|---|
| F3.1 | `baseProfile: ProfilePoint[] \| null`; `topProfile` liberado em arco (`t` = comprimento ao longo do eixo); migração | `types.ts`, migração, comandos (P0) | Fase 2 | sonnet | regravação idêntica; exclusão tilt × perfil mantida, salvo ordem do dono |
| F3.2 | Sólido e junções com perfil em reta e arco, topo e base | (P0) gerador + teste | F3.1 | sonnet | 4.3; perfil nulo = malha atual |
| F3.3 | Vista de desenvolvimento (parede desenrolada) para editar os pontos, inclusive onda | (P0) vista e ferramenta | F3.2 | sonnet | arco de 90° r=5 desenrola em 7,8540 de largura |
| F3.4 | Validação de soleira e verga: em todo `t` do vão, base(t) ≤ peitoril e topo(t) ≥ peitoril + altura + verga mínima | `openingChecks.ts` + teste | F3.2 | haiku | aviso traduzido; não bloqueia salvar |
| F3.5 | Planta, corte, elevação e quantitativos com perfil | (P0) | F3.2 | sonnet | 4.3 |
| F3.6 | Comandos de modificar preservam perfis (Dividir reparte em `t`; inverter a↔b faz `t → L − t`); IFC | (P0) | F3.2 | sonnet | matriz 9 × {reta, arco} |
| F3.7 | i18n, faixa, E2E e capturas | (P0) | todas | haiku | seção 5.3 |

## 4. Valores de referência (oráculos)

Todo teste de geometria compara com número literal desta seção ou dos spikes, nunca com valor calculado pelo próprio código testado. Tolerâncias: fórmula fechada 1e-9 relativo; malha de reta 1e-6; malha de arco 1e-3 (discretização); posição 1e-6 m; ângulo 1e-6 rad.

### 4.1 Fórmulas (θ = |tilt|, s = +1 topo afastando do centro do arco, −1 aproximando)

| Grandeza | Reta | Arco (raio R do eixo, ângulo φ em rad) |
|---|---|---|
| Deslocamento do topo | `H·tanθ` | igual, na direção radial |
| Espessura horizontal | `t/cosθ` | igual |
| Volume (sem junções, sem vãos) | `L·H·t/cosθ` | `φ·H·(t/cosθ)·(R + s·H·tanθ/2)` |
| Área real da face (no eixo) | `L·H/cosθ` | `φ·(H/cosθ)·(R + s·H·tanθ/2)` |
| Comprimento do eixo na altura z | `L` | `φ·(R + s·z·tanθ)` |
| Arco: raio e flecha | — | `R = (c²/4 + sag²)/(2·|sag|)`; 180° quando `|sag| = c/2` |

### 4.2 Casos numéricos (t=0,2; H=3)

| Caso | Topo desloca | Esp. horiz. | Volume | Área da face |
|---|---|---|---|---|
| Reta L=4, θ=15° | 0,8038 | 0,2071 | 2,4847 | 12,4233 |
| Reta L=4, θ=30° | 1,7321 | 0,2309 | 2,7713 | 13,8564 |
| Arco R=5, φ=90°, θ=15°, afastando | 0,8038 | 0,2071 | 5,2708 | 26,3540 |
| Arco R=5, φ=90°, θ=15°, aproximando | 0,8038 | 0,2071 | 4,4865 | 22,4323 |
| Qualquer caso com θ=0 | 0 | 0,2000 | igual ao valor atual do projeto | igual |

### 4.3 Perfil (Fase 3)

Área da face = `∫(topo(t) − base(t)) dt` (trapézios nos pontos do perfil); volume = área × t. Onda `topo(t) = H + A·sen(2πt/λ)` sobre número inteiro de períodos: área = `L·H` exato (L=6, H=3, A=0,5, λ=2 → 18,0000 m², 3,6000 m³). Empena de 2,5 a 4,0 e volta em L=6: 19,5000 m². Em arco, L = comprimento do eixo `φ·R`.

## 5. Portões

### 5.1 Por ficha (o executor roda e cola a saída; o fiscal repete na árvore combinada)

`npm run typecheck` · `npm run lint` (não aumentar avisos) · `npm run test:rapido`. Ficha com interface: mais `npm run check:ribbon-i18n`. Ficha com `.rs`: mais `cargo test -p geom-wasm` (de dentro de `crates/geom-wasm`), `npm run build:wasm`, `npm run wasm:check`, `npm run test:wasm`, clippy com o mesmo número e os mesmos locais da base (39) e zero em linha tocada, e commit dos arquivos de `packages/geom/assets`. Ficha sem `.rs` que rodou build:wasm: `git checkout packages/geom/assets`. Uma suíte por vez.

### 5.2 Por fase

Todos os portões acima na branch da frente, mais: contagem de testes ≥ linha de base; nenhum teste antigo alterado sem registro; documento com versão anterior abre e regrava idêntico; roteiro E2E da fase com 0 erro de console.

### 5.3 Portão visual

Script de capturas por fase (planta, 3D, corte, elevação; tema claro). O fiscal OLHA cada captura (uma por vez) e anota no ESTADO. Capturas mínimas: F1 círculo, elipse, spline, hexágono com porta; F2 canto de duas inclinadas com tilts diferentes em 3D e planta, arco inclinado, janela inclinada e porta vertical; F3 onda em reta e em arco, vista de desenvolvimento.

### 5.4 O que o dono testa à mão

- **Fase 1.** Desenhar círculo, elipse, hexágono e spline e ver parede contínua, sem emenda; pôr porta e cota numa parede de elipse; Deslocar e Filete num trecho de spline; desfazer um círculo em um passo; exportar IFC e abrir em outro visualizador.
- **Fase 2.** Inclinar uma casa de 4 paredes com valores diferentes e conferir os cantos no 3D; planta mostra a parede deslocada no plano de corte; janela inclinada e porta vertical na mesma parede; Espelhar e conferir que o lado inverteu; comparar o volume da tabela com a conta à mão.
- **Fase 3.** Onda no topo de parede reta e de parede em arco; editar pontos na vista de desenvolvimento; base em degraus; porta sob o ponto baixo da onda dispara o aviso de verga; Dividir a parede e ver o perfil repartido.

## 6. Esquema e contrato

- **Quando subir `SCHEMA_VERSION`.** Fase 1: não sobe. Fase 2: uma vez, na F2.1 (o campo `plano` da abertura da F2.8 entra na mesma versão, já declarado como opcional na F2.1). Fase 3: uma vez, na F3.1. Campo novo é sempre opcional com ausente = comportamento atual; a migração só troca o número.
- **Numeração em disputa (hoje esquema 26, contrato v19; estrutura e terreno querem 27/28 e v20/v21).** Dentro desta frente usam-se os próximos números livres da própria branch. O número definitivo é de quem mescla primeiro na branch de integração; quem chega depois renumera. Só o fiscal renumera, no rebase, em um commit isolado "renumera esquema N→M" que toca apenas a constante, a tabela de migrações e os testes de migração. Executor nunca escolhe nem altera número.
- **Ordem de rebase.** Antes de abrir cada fase e antes de mesclar a frente: `git fetch` e rebase sobre `integracao/massa-suplementos`; conflito em `types.ts` ou na tabela de migrações se resolve empilhando (a migração desta frente passa a partir da versão da outra), nunca fundindo duas migrações numa.
- **Contrato do kernel.** Só muda se a resposta 3.0-1 for Rust. Nesse caso: uma ficha de contrato própria (JSON, esboço Rust, esquema TS) antes das fichas de geometria; depois dela o contrato fica congelado até o fim da fase. A tabela do contrato nunca é editada à mão sem regenerar os derivados e rodar `build:wasm` + `wasm:check`. Mesma regra de renumeração do esquema.

## 7. Erros prováveis dos executores e como o fiscal detecta

| Erro | Detecção |
|---|---|
| Ampliar escopo | `git diff --stat frente/parede-formas...` contra a lista da ficha |
| Teste que só confere o próprio código (espera = chamada da mesma função) | grep dos literais das seções 2 e 4 no teste; sem literal, devolve |
| Afrouxar tolerância ou editar teste antigo para passar | diff em `*.test.ts` existentes; `toBeCloseTo` com menos casas que o pedido |
| Esquecer i18n ou faixa | `check:ribbon-i18n`; grep da chave nova nos 7 arquivos de `areas/` |
| Não preservar tilt ou perfil nos comandos de modificar | matriz F2.11/F3.6 com conferência geométrica, não de campo |
| Não inverter o sinal de `tilt` ao trocar a↔b | caso de espelhar e de inverter parede na matriz |
| Mexer em `joins.ts` sem spike aprovado | diff do arquivo fora de F1.5/F2.4; ESTADO sem "S1/S2 aprovado" |
| Decidir topologia de junção no topo | teste: parede cujo topo cruza uma terceira parede não ganha junção nova |
| Usar espessura horizontal onde é a perpendicular (ou o contrário) | oráculo 4.2: volume errado por fator cosθ ou 1/cosθ |
| Graus × radianos em `tan`/`cos` | caso θ=30° da tabela 4.2 |
| Arco acima de 180° ou `sag` > corda/2 | critério (c) do S3 como teste permanente |
| Não determinismo (ids, `Math.random`, ordem de `Map`) | teste de duas execuções com JSON idêntico |
| Subir ou escolher número de esquema por conta própria | diff de `SCHEMA_VERSION` fora de F2.1/F3.1 |
| Migração que reescreve dados | teste de regravação idêntica |
| Esquecer `packages/geom/assets` após `.rs` (ou commitá-los sem `.rs`) | `hash-fontes.test.ts` no `test:rapido`; `git status` |
| Vários desfazer para uma forma | teste da F1.3: 1 comando por forma |
| Relatório otimista ("tudo verde") sem saída | fiscal roda os portões na árvore combinada antes de mesclar |
| Regressão em parede comum | toda ficha de geometria tem o caso tilt=0 / perfil nulo = resultado atual |

## 8. Fases 4 e 5 (só o roteiro)

**Dependência comum (fazer antes das duas):** C1 esboço comum com spline (reaproveita `fitArcs` da F1.1) e C2 editor de curvas (alças de pontos e tangentes). Servem à laje livre e à massa v2.

**Fase 4 · Laje livre.** Objetivo: laje cuja superfície é um campo de alturas definido por seções em planos de corte, com pontos de controle e furos. Depende de C1, C2 e da Fase 3 (vista de desenvolvimento e perfis).
- L1 modelo: contorno, seções (plano de corte + curva de altura), pontos de controle, furos; migração.
- L2 kernel: interpolação do campo entre seções, malha, espessura na normal, volume e área.
- L3 planta, corte e elevação; curvas de nível opcionais.
- L4 ferramentas: criar, editar seção em vista de corte, mover ponto de controle, furo.
- L5 interface, i18n, quantitativos, IFC.
- L6 E2E e capturas.

**Fase 5 · Massa v2.** Objetivo: massa com restrição de nível superior e inferior, material, furos, vazios e booleanas, alças no 3D, parede e laje por face associativas. Depende de C1, C2, da Fase 2 (parede por face inclinada usa `tilt`) e da Fase 4 (laje por face não plana).
- M1 modelo: restrições de nível, material, vazios; migração.
- M2 kernel: booleanas (união, subtração, interseção) e furos, com fuzz de malha fechada.
- M3 alças no 3D (arrastar face, aresta, seção).
- M4 parede por face associativa (regenera quando a massa muda, preserva aberturas).
- M5 laje por face associativa.
- M6 interface, i18n, tabelas, IFC.
- M7 E2E, desempenho e capturas.

Antes de abrir a Fase 4 ou a 5, o fiscal escreve os spikes dela no mesmo formato da seção 2 (candidatos: interpolação do campo de alturas; robustez das booleanas; associatividade parede×face após edição da massa).
