# cortinaRef: referência TS da parede cortina (decisão 0056, fase 1)

Referência TS **pura**, usada **só em testes de paridade** com o kernel Rust (`crates/geom-wasm`). O app nunca a chama. Precedente: `../guardaCorpoRef/`.

Cobre o que o ADR 0056 §10 (fase 1) lista como "referência TS barata": linhas da grade (§5.1), células (§5.2), montantes `rect`/`round` com borda, interior e prioridade de junção (§5.3), painéis (§5.4), quantitativos (§5.7) e os avisos da fase 1 (§5.8). Fica de fora: planta (casos dourados), `L`/`trapezoid`/`corner` (fase 3), `removedSegments`, `addedLines`, `lineOverrides` e sobrescrita de célula (fase 2), ângulo (fase 7).

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `tipos.ts` | Tipos **locais** de entrada (espelham `CurtainSpec`, `GridAxisSpec`, `MullionType`, `CurtainPanelType`, `CurtainInstance` do ADR §4). Não importa `@hestia/model`; para trocar pelos oficiais, reexporte os nomes de lá e mantenha `CortinaEntrada`. |
| `grade.ts` | `linhasDoEixo`, `eixoEfetivo`, `resolverGrade`: linhas e células. |
| `pecas.ts` | `calcularPecas`: montantes por segmento (aparo reto) e painéis por célula. |
| `quant.ts` | `calcularQuant`: linhas de `quant_cortina`. |
| `avisos.ts` | `calcularAvisos`: medidas de `cortina_avisos`. |
| `consulta.ts` | `resolverCortina` (tudo) e `paraConsulta` (formato de saída, abaixo). |
| `casos.ts` / `casos.json` | Os casos canônicos (41) e o arquivo gerado. |

Regenerar `casos.json`: `GERAR_CASOS=1 npx vitest run packages/engine/src/cortinaRef/casos.test.ts` (o teste normal recusa se o arquivo divergir do gerador).

## `casos.json`

```jsonc
{ "versao": 1, "adr": "0056",
  "casos": [ { "nome": "...", "entrada": <CortinaEntrada>, "esperado": <SaidaConsulta> }, ... ] }   // um caso por linha
```

### Entrada (`CortinaEntrada`, em `tipos.ts`)

```
L, H            comprimento do eixo e altura do plano (m), > 0   (o Rust os recebe de `cortinas.altura` e do eixo a→b)
num?            cortina_num das saídas (padrão 1)
tipo            { depth, u, v, mullions, defaultPanelTypeId, minCell? }   // = CurtainSpec do ADR §4.2
  u, v          GridAxisSpec { mode, count?, distance?, justify?, positions?, anchor?, offset?, angle?, minRemainder? }
  mullions      { interiorVertical, interiorHorizontal, borderStart, borderEnd, borderBottom, borderTop, corner, joinPriority }  // ids ou null
instancia?      { grid?: { u?: Partial<GridAxisSpec>, v?: ... }, defaultPanelTypeId? }   // o eixo efetivo é { ...tipo, ...instância }
montantes[]     { id, num, profile {shape, width, depth}, materialId, materialNum, offset? }   // num = id_num da seção 104; materialNum = material_num
paineis[]       { id, num, kind, thickness, bite?, offset?, materialId, materialNum }          // num = id_num da seção 105
```

Padrões: `minRemainder` 0,05 m; `minCell` 0,15 m; `bite` 0,012 m. Os dois primeiros são **configuráveis** (por eixo e por tipo), como decidiu o dono. `count` não inteiro ou < 1, `distance` <= 0, `angle` != 0, tipo inexistente, forma diferente de `rect`/`round` e `L`/`H` <= 0 são `ENTRADA` (a referência lança `Error('ENTRADA: ...')`; o Rust deve devolver o erro `ENTRADA`). Casos de erro não estão em `casos.json`, só nos testes.

### Saída (`esperado`, tipo `SaidaConsulta` em `consulta.ts`)

Vetores **planos**, como as consultas do §6.3; a coluna de cada posição está no comentário do tipo. Todos os `f64` em **grade de 1 µm** (`round(x·1e6)/1e6`, sem `-0`); `u32` exatos. Tolerância de paridade: `f64` 1e-6 (já arredondados, então a diferença esperada é 0 ou 1e-6), `u32` iguais. Ordem fixa (§6.4): por `cortina_num`, `eixo`, `indice`, `papel`, `i`, `j`.

| Chave de `esperado` | Consulta do ADR | Vetores (colunas) |
|---|---|---|
| `cortina_grade` | `cortina_grade` (100) | `linhas` u32x5 `[cortina_num, eixo 0U/1V, indice 1..n-1, origem 0, flags 0]` + `linhas_pos` `[pos]`; `celulas` u32x6 `[cortina_num, i, j, regiao, painel_tipo_num, flags]` + `celulas_ret` `[s0,s1,z0,z1]`; `segmentos` u32x5 `[cortina_num, linha, k, removido 0, montante_tipo_num]` + `segmentos_ext` `[de, ate]` |
| `cortina_pecas` | instâncias de `cortina_malha` (101), em parâmetros | `montantes` u32x7 `[cortina_num, papel, tipo_num, linha, k, vertical, continuo]` + `montantes_geo` `[s, z, comprimento, largura, profundidade]`; `paineis` u32x5 `[cortina_num, i, j, tipo_num, papel]` + `paineis_geo` `[s0,s1,z0,z1, area_visivel, area_bruta]` |
| `quant_cortina` | `quant_cortina` (104) | `linhas` u32x5 `[cortina_num, papel, tipo_num, material_num, n]` + `valores` `[comprimento, area, area_liquida, volume]` |
| `cortina_avisos` | `cortina_avisos` (105) | `avisos` u32x4 `[cortina_num, codigo, i, j]` + `valores` `[medido, limite, x, y, z]` |

`cortina_pecas` não existe como consulta: o Rust devolve matrizes 3x4 por instância. Para comparar, derive do Rust (translação e escalas de cada matriz) a mesma tabela de parâmetros, ou compare só `cortina_grade`, `quant_cortina` e `cortina_avisos`, que casam 1 para 1 com o §6.3.

### Convenções que a referência fixou (o ADR deixa em aberto; o Rust deve seguir ou o teste mapeia)

Convenções de coluna:

- **`linha`** (coluna de `segmentos`): índice global; U = `0..nu` (0 = borda início, `nu` = borda fim, os do meio são as linhas internas), V = `nu+1 .. nu+1+nv` (`nu+1` = borda base, `nu+1+nv` = borda topo). `k` = índice do segmento ao longo da linha (U: de baixo para cima; V: do início ao fim). Há **um segmento por (linha, intervalo entre linhas que a cruzam)**, bordas incluídas: `(nu+1)·nv + (nv+1)·nu` segmentos. Uma linha sem montante (`null`) mantém o segmento, com `montante_tipo_num = 4294967295` (`ID_AUSENTE`).
- **`segmentos_ext`**: extensão **nominal** (de linha a linha, centro a centro), sem aparo. O aparo está em `montantes_geo`.
- **`regiao`**: índice da célula na ordem de saída (`i·nv + j`); na fase 1 cada célula é a sua própria região.
- **Ordem das células**: `i` primeiro, `j` depois (i-major), como "..., `i`, `j`" do §6.4.
- **`flags` de célula**: bit0 = menor lado **livre** < `minCell`. `flags` de linha: 0.
- **Papéis** (`papel`): montante 0 interior vertical, 1 interior horizontal, 2 borda início, 3 borda fim, 4 borda base, 5 borda topo; painel 10 vidro, 11 sólido, 12 vazio; 20 = o sistema inteiro (só em `quant_cortina`).
- **`quant_cortina`** (colunas por papel, ver `quant.ts`): montante `area = area_liquida = comprimento × largura vista`, `volume = comprimento × área do perfil` (rect `w·d`; round `πw²/4`); painel `area` = área **bruta** (retângulo livre + `bite` nos lados com montante), `area_liquida` = área **visível** (retângulo livre), `volume = área bruta × espessura`, `comprimento` 0; vazio: `area = area_liquida` = o vão, `volume` 0; sistema: `n 1`, `comprimento L`, `area = area_liquida = L·H`, `tipo_num = material_num = 0`.
- **Avisos**: `codigo` 1 `cortina-celula-pequena`, 2 `cortina-montante-sobreposto`, 3 `cortina-sobra-fundida`, 4 `cortina-posicao-fora`, 5 `cortina-profundidade-menor-que-perfil` (os valores finais são de `esquema.rs`; casar por nome se divergir). `i`/`j` = índices da célula (ou da coluna/fileira no aviso de eixo; `ID_AUSENTE` onde não se aplica; no código 5, `i` = `num` do tipo de montante). `x` = s e `z` = z no plano da cortina, `y` = 0. Ordem: `codigo`, `i`, `j`, `medido`.
- **Tolerâncias numéricas**: soldagem 1e-6 m (linhas a menos disto viram uma, a primeira vale; linha a menos disto da borda não existe; peça com comprimento <= 1e-6 não existe); `m = floor(A/d + 1e-9)` e `n = ceil(A/d − 1e-9)` (ruído de ponto flutuante: `0,3/0,1` dá `2,9999999999999996`); limiar de sobra comparado como `x < r − 1e-9`.

Convenções de geometria (escolhas a confirmar; ver o relatório da fase):

- Montante **centrado na linha**, inclusive o de borda: metade dele sai de `[0, L] × [0, H]` (§5.3 literal).
- Painel livre = célula menos a **meia** largura do montante de cada lado (0 onde o papel é `null`), em qualquer prioridade.
- Prioridade `vertical`: verticais por segmento sem aparo (centro a centro); horizontais aparados em `largura_vertical/2` em cada ponta. `horizontal`: o inverso. Peças são **por segmento**, não por linha (a contagem do §9: ~120 para 60 células).
- `offset`: em `fixedNumber`/`maxDistance` o padrão de `n` células iguais desliza inteiro (as linhas `k=0` e `k=n` entram ou saem); em `fixedDistance` o padrão **periódico** `p0 + k·d` desliza (offset de um período reproduz a grade). Em `fixedDistance` com `d` maior que o eixo (`m = 0`) há uma célula só e o `offset` é ignorado.
- Fusão da sobra: `fixedDistance` sempre; os demais modos **só quando `offset != 0`**. Cada ponta tem no máximo uma fusão.
- `manual`: posições desordenadas são aceitas (ordenam); `offset` é somado depois da âncora; posição fora de `(1e-6, A−1e-6)` é ignorada com aviso (já com o offset).
- Célula mínima mede o **menor lado livre** (não o nominal) e avisa em qualquer tipo de painel, inclusive `empty`.
- Montante sobreposto: distância entre linhas vizinhas (bordas contam) `< (largura_a + largura_b)/2`, só se os dois têm montante.

## Testes

`grade.test.ts` (243: casos de borda de cada modo, `d >= L`, sobra minúscula e no limiar, `count = 1`, `L` muito pequeno, dedupe, offsets, e 200 casos aleatórios com semente 56), `pecas.test.ts` (montantes, prioridade, papéis, painéis, avisos, quantitativos), `casos.test.ts` (o arquivo é o que o gerador produz e a forma dos vetores).
