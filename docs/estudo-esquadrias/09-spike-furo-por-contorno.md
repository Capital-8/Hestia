# 09. Spike 1a: furo da parede por contorno não retangular

Status: spike de viabilidade, só TypeScript. Código em `packages/engine/src/spike/outline.ts` e `packages/engine/src/spike/arcHole.test.ts` (38 testes verdes). Nenhum arquivo existente do produto foi alterado.

## 0. Veredito

**Viável, com ressalvas.** O motor já fura a parede por faixas de altura e já funde faixas adjacentes iguais. Um vão em arco entra nesse mecanismo como "N retângulos empilhados", sem mudar o algoritmo de camadas, de junção nem o cálculo de volume. Provado com o motor real (`resolveLevel`): meia-lua de 1,20 m, 24 faixas, volume removido da parede 0,036% diferente de `área do contorno x espessura`. As ressalvas são de custo, não de possibilidade:

1. o furo vira escada (desvio de 5,8 mm com 48 faixas, 2,2 mm com 192);
2. cada faixa é uma banda a mais por camada (em 5 camadas, 24 faixas dão 26 bandas por camada, e o 3D desenha uma caixa de recorte por banda);
3. o **retorno do acabamento** (`wrap.ts`) e o **Rust** (`a3.rs`, `a3c.rs`) precisam aprender a mesma regra. O Rust é o item mais caro.

Recomendação: seguir com a abordagem de faixas horizontais para meia-lua e arco abatido, com tolerância de escada configurável (padrão 24 a 48 faixas para vãos até 1,5 m), e tratar a escada como aproximação de 3D (planta e quantitativos exatos). O 3D curvo "liso" (malha extrudada pelo contorno) fica como etapa seguinte, só se a escada incomodar na visualização.

## 1. O que o motor faz hoje, passo a passo

1. **Geometria do vão** (`resolve.ts:229-256`, `openingGeometry`): `OpeningGeometry` só carrega `width`, `height`, `roughWidth`, `roughHeight`, `sill`, centro `center` e tangente `u`. Não há campo de contorno (R1).
2. **Pontos de quebra** (`resolve.ts:279-296`, `breakpoints`): reúne base e topo de cada parede, limites das faixas de camada e, para cada vão, as cotas `sill` e `sill + roughHeight`. Só essas duas cotas por vão geram quebra.
3. **Faixas** (`resolve.ts:~313-360`, laço `for k` em `solveCluster`): para cada intervalo `[za, zb]` entre quebras, acha os itens ativos, pinta (prioridade de junção, só entre os que existem naquela altura) e, para cada item, calcula os furos como "aberturas da parede cuja faixa `[sill, sill+roughHeight]` contém o meio `mid` do intervalo" (`resolve.ts:340-343`). O furo é `openingHole(g)` (`openingCut.ts:39`), um anel retangular de largura `roughWidth` e profundidade `espessura/2 + 0,02` (`:28`, `:23`). Em parede curva é um setor radial (`openingBandRing`). O recorte é `furosDe` (`resolveMemo.ts:49`), que é `difference(fragmento, ...furos)` em cache.
4. **Retorno do acabamento** (`resolve.ts:345-349`): para cada abertura que atravessa a faixa, soma `clipReturn(r, ...)` ao polígono. Os retornos vêm de `insertReturns` (`wrap.ts:135`), montados com `rect` (`wrap.ts:121`) e `ringRect` (`:109`): tiras de largura da camada nas duas ombreiras, na profundidade da parede.
5. **Fusão de faixas** (`resolve.ts:~352-358`): se a faixa seguinte tem o mesmo polígono (`sigCanonica`), estende a `z1` da anterior; senão abre nova `LayerBand {z0, z1, poly}` (`types.ts:32`). É esse mecanismo que mantém uma parede reta com 3 ou 4 bandas.
6. **Planta** (`resolve.ts:~365-368`): `cut` = fragmento menos `openingHole` de cada abertura que fura o plano de corte (`planOpen`). Aqui não há altura: usa-se a largura plena `roughWidth` (ver risco 3).
7. **3D e quantidade** (`quantities.ts:85`, `profile.ts:18`): cada `LayerBand` é um prisma `poly x [z0, z1]`; volume = `multiArea(poly) * (z1 - z0)`. O 3D (`packages/render/src/model3d/layerTopology.ts`, `solids.ts`, `paredesInstanciadas3d.ts`) extruda cada banda. Nada disso lê o vão; só lê as bandas.
8. **Rust**: `a3.rs:101` (`retangulo_do_vao`), `:107` (`furo_do_vao`), `:126` (`furos_de`); `a3c.rs:93` (`pontos_de_quebra`, mesma lógica do item 2) e o laço de faixas (`a3c.rs:174-222`); retornos em `a3b.rs` (`faixa_da_parede`, `:173`). O contrato `cena-v11.json` entrega o resultado como seção `faixas_juncao` e `pontos_faixas_juncao`, região por faixa.

Conclusão desta leitura: a **única** coisa retangular no caminho de camadas é "o furo da abertura é um retângulo constante em toda a faixa `[sill, sill+roughHeight]`". Camadas, junções, volume e 3D tratam bandas genéricas (polígono + `z0`/`z1`).

## 2. Abordagem escolhida e alternativas

**Escolhida: furo = união de faixas horizontais finas** que aproximam o contorno. Cada faixa é um retângulo (`largura(z)` por `dz`). Entra no motor como uma sequência de aberturas empilhadas, ou, na versão de produto, como `breakpoints` extras e `openingHole(g, z)`.

| Alternativa | Veredito |
|---|---|
| Polígono do contorno extrudado pela espessura (sólido 3D subtraído de cada camada) | Exige subtração de sólidos 3D por camada, junção e quantitativo. O motor trabalha em polígonos 2D por faixa de altura; não há CSG 3D. Reescreve o núcleo. Descartada para este spike. |
| Faixas horizontais (escolhida) | Reaproveita bandas, junções, prioridade, fusão, volume. |
| Faixas por ângulo em vez de por altura | Mesma coisa; a distribuição dos níveis (abaixo) é o que importa. |

Distribuição dos níveis: **passos de igual comprimento de arco** ao longo da curva, mais a base e a nascença. Passos iguais em `z` deixam a coroa grosseira; iguais em `x` deixam a ombreira grosseira. A meia-largura da faixa é a do meio (`mid`, erro de área ~ 0); há também `outer` (o furo contém o contorno, conservador, para folga/acabamento) e `inner`.

## 3. O que foi provado (números)

Contorno (`outline(kind, w, h, rise, inset)`, cordas com sagita máxima de 1 mm):

- meia-lua w = 0,6 / 0,9 / 1,2 / 2,4 m: área do polígono nunca passa de πw²/8; perda <= comprimento do arco x 1 mm; erro relativo < 0,5% (0,41% no menor, < 0,15% de 1,2 m em diante); tudo em `[-w/2, w/2] x [0, h]`, topo = `h` (vértice da coroa exato).
- arco abatido (três casos, flechas 0,1 a 0,3): área bate com `w(h-f) + R²α - (w/2)(R-f)` com o mesmo limite de corda; nascença em `h - f`; topo = `h`.
- recuo (`inset`): arco concêntrico (raio `R - inset`), topo recua exatamente o `inset`; recuo que consome a forma devolve `[]`.

Aproximação em faixas (meia-lua w = 1,20 m, raio 0,60 m):

| Faixas (n) | Desvio máx. do canto ao arco (`mid`) | `outer` | Erro de área (`mid`) |
|---|---|---|---|
| 12 | 20,0 mm | 37,3 mm | 0,152% |
| 24 | 10,7 mm | 18,8 mm | 0,036% |
| 48 | 5,8 mm | 9,3 mm | 0,008% |
| 96 | 3,4 mm | 4,6 mm | 0,002% |
| 192 | 2,2 mm | 2,3 mm | 0,001% |

(O desvio cai com 1/n. O erro de área é medido contra o polígono do contorno; a área quase não depende de n, o que importa para n é o desvio visual.)

Furo de parede de teste (`difference` de `@hestia/geom`, parede 4 m x 0,20 m, 48 faixas): volume removido = área do contorno x espessura com erro < 0,5%.

**Motor real, sem alterar o motor** (parede `wt_alv14`, 4 m x 2,8 m, 5 camadas, espessura 0,184 m; cada faixa como uma janela de vão livre empilhada, `wrapInserts: none`):

| Caso | Faixas | Bandas por camada | Volume removido | Esperado (área x 0,184) | Erro |
|---|---|---|---|---|---|
| meia-lua 1,2 m | 12 | 14 | 0,10399 m³ | 0,10383 | +0,152% |
| meia-lua 1,2 m | 24 | 26 | 0,10387 | 0,10383 | +0,036% |
| meia-lua 1,2 m | 48 | 50 | 0,10384 | 0,10383 | +0,008% |
| abatido 1,2 x 1,5, flecha 0,2 | 24 | 27 | n/d | n/d | 0,000% |

Isso prova: os pontos de quebra, a fusão de bandas, o volume e todas as camadas aceitam furos com largura variável em altura sem nenhuma mudança. Tempo de `resolveLevel` desta parede: ~20 ms vazia, 45 a 65 ms com 12 a 48 faixas (medição de spike, ruído alto, só ordem de grandeza).

Achado extra: com `wrapInserts: both`, o motor acrescenta o retorno do acabamento em **cada degrau** (0,00484 m³, 4,7% do volume furado, para 24 faixas). Hoje o retorno é uma tira por ombreira com a altura do vão; com escada ele vira N tiras. Aqui o retorno **segue a escada, não o contorno**, mas o volume ainda é razoável. Com vergas de gesso/azulejo isso pede tratamento (item 4).

## 4. Custo estimado do resto

| Item | O que muda | Estimativa |
|---|---|---|
| Forma no modelo | `OpeningType.shape` (`rect` padrão, `round`, `segmental`, `rise`), migração sem efeito para tipos existentes. | 0,5 a 1 dia (model + validação + migração) |
| `OpeningGeometry` | campo opcional `outline` (anel em `t,z`) ou `slices`; `roughWidth/roughHeight` viram a caixa envolvente (R20 continua valendo). | 0,5 dia |
| Pontos de quebra (`resolve.ts:279`) | para vão com contorno, acrescentar as cotas das faixas ao conjunto (já há dedup por `EPS_Z`). | 0,5 dia |
| Furo por altura (`openingCut.ts:39`, `resolve.ts:340`) | `openingHole(g, zMid)` devolve o retângulo com a meia-largura da faixa; sem contorno, igual a hoje (parâmetro opcional). Parede curva: o setor radial usa a mesma `halfWidth(z)`. | 1 dia |
| Planta (`resolve.ts:365`, `planOpen`) | o anel de planta deve usar a largura na **altura do plano de corte**, não a máxima. Hoje `planOpen` é por abertura, sem altura. Precisa receber `zCorte`. | 1 dia |
| Retorno do acabamento (`wrap.ts:135`) | decidir: (a) uma tira por degrau (já funciona, volume razoável); (b) tira só nas faixas do arco, coladas ao contorno; (c) retorno 3D lofted. Recomendação: (a) agora, (b) depois. Deve respeitar `insertFrameFootprint`. | 1 a 2 dias |
| Parede inclinada (`openingTilt.ts:112`) | `tiltCutZ` só remapeia as duas cotas do furo; as faixas intermediárias precisam do mesmo remapeamento. Pode-se recusar forma em parede inclinada na 1ª versão. | 0,5 dia (recusar) ou 2 dias (suportar) |
| 3D | nada novo para a parede (bandas já são prismas). Esquadria (batente, folha, vidro) em arco é outra tarefa (R6, R7, R13), fora deste spike. | fora do escopo |
| IFC (`ifcExport.ts:215`) | vazio retangular hoje; arco pede `IFCARBITRARYCLOSEDPROFILEDEF`. | fora do escopo (R16) |
| **Rust** | `a3c.rs:93` (`pontos_de_quebra`), `a3.rs:107` (`furo_do_vao`), `a3c.rs:174-222` (laço de faixas) e `a3b.rs` (retornos): mesma regra, "mesmas contas na mesma ordem" (decisão 0047 §7), mais testes de equivalência TS x Rust. | 3 a 5 dias |
| **Contrato `cena-v*.json`** | **Muda a entrada, não a saída.** A saída (`faixas_juncao`, `pontos_faixas_juncao`, `resolver_nivel`) já é "região por faixa", sem assumir retângulo. Falta a **entrada**: colunas novas em `tipos_abertura` (forma, flecha) ou seção nova `contornos_abertura`; sobe `versao` (v20) e os dois lados. | contrato: 0,5 dia; incluso no Rust acima |

Total estimado, só TS, produto utilizável (modelo, resolve, planta, retorno e testes): **5 a 7 dias**. Com Rust: **8 a 12 dias**. O Rust pode ficar desligado para vão com contorno (despachante cai no TS, como já cai em outras falhas do kernel) se a prioridade for entregar antes.

## 5. Riscos

1. **Escada visível no 3D.** Com 24 faixas o degrau de 10 mm aparece em zoom. Mitigação: tolerância configurável; n por vão proporcional a `sqrt(R)`; ou a etapa de 3D liso depois.
2. **Explosão de bandas.** Cada faixa é uma banda por camada e uma caixa de recorte no 3D. Parede com 3 vãos em arco de 48 faixas = ~150 bandas por camada. O cache (`furosDe`, `pintarCompartilhado`) ajuda, mas o teste de perf (`test:perf`) deve cobrir.
3. **Planta usa a largura máxima hoje** (`planOpen` sem altura). Se o plano de corte cai na nascença ou acima, a planta mostra o furo largo demais.
4. **Retorno do acabamento** vira degraus (item 3, achado extra); rodapé e azulejo (`strips`) que cruzam o vão também.
5. **Duplo motor TS e Rust**: qualquer diferença de arredondamento em `halfWidth(z)` quebra a comparação `kernelComparaA3.ts`. Mitigação: o TS calcula as faixas e **envia** pelo contrato (como já faz com `perfis_z`), o Rust só consome.
6. **Alças de elevação, quadros e áreas** (R11 a R19) continuam retangulares: a área do quadro de esquadrias (R19) precisa de `ringArea(outline)`.
7. **Colisão vertical por empilhamento**: o spike usa aberturas empilhadas só como prova; no produto é um único vão com N faixas (sem violar R20).
8. **Limite da forma:** o `holeSlices` atual assume contorno simétrico e convexo (suficiente para meia-lua e abatido). Ogival, ferradura e livre exigem varredura geral de interseção.

## 6. Recomendação

1. Aprovar a abordagem de faixas horizontais para `round` e `segmental` (spike 1b: implementar no `resolve.ts` atrás de `shape` opcional no tipo, com o laço de faixas e `openingHole(g, z)`).
2. Fixar tolerância de escada padrão em ~6 mm (n entre 24 e 48) e expor a configuração.
3. Fazer a planta e o quadro corretos antes do 3D liso (valor maior por esforço menor).
4. Portar ao Rust só depois do TS estável, enviando as faixas calculadas no contrato.
5. Registrar a decisão de arquitetura (nova ADR) quando o 1b começar.

## 7. Como reproduzir

```
npx vitest run packages/engine/src/spike
npx vitest run packages/engine/src/opening packages/model/src/opening   # 665 testes, sem regressão
npx tsc -p tsconfig.json --noEmit
npx eslint packages/engine/src/spike
```

Funções: `outline(kind, w, h, rise, inset, tol)`, `ringArea`, `halfWidthAt`, `holeSlices(ring, n, mode)`, `slicesArea` em `packages/engine/src/spike/outline.ts`.
