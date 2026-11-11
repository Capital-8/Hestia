# cortinaRef: referência TS da parede cortina (decisão 0056, fases 1 e 2)

Referência TS **pura**, usada **só em testes de paridade** com o kernel Rust (`crates/geom-wasm`). O app nunca a chama. Precedente: `../guardaCorpoRef/`.

Fase 1 (ADR 0056 §10): linhas da grade (§5.1), células (§5.2), montantes `rect`/`round` com borda, interior e prioridade de junção (§5.3), painéis (§5.4), quantitativos (§5.7) e avisos (§5.8).

Fase 2 (ADR §4.3, §4.4, §5.2, §6.1): linhas extras (`addedLines`) e travadas, sobrescrita de linha (`lineOverrides`), sobrescrita de célula (`cells`, só painel), segmentos removidos (`removedSegments`) com região fundida retangular, e o remapeamento das sobrescritas quando a grade muda (regras 1 a 6 de §4.4).

Fica de fora: planta (casos dourados), `L`/`trapezoid`/`corner` (fase 3), arco (fase 4), porta/janela na célula (fase 5, recusada com `ENTRADA`), ângulo (fase 7).

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `tipos.ts` | Tipos **locais** de entrada (espelham `CurtainSpec`, `GridAxisSpec`, `MullionType`, `CurtainPanelType`, `CurtainInstance` do ADR §4). `LineRef`, `SegmentRef`, `CellKey`, `AddedGridLine`, `LineOverride`, `CellOverrideEntry`. `LIMITES` (§4.3). Não importa `@hestia/model`. |
| `grade.ts` | `linhasDoEixo` (fase 1, intacta), `resolverEixo` (linhas extras, travadas e sobrescritas de linha), `resolverGrade` (grade inteira com remapeamento). |
| `remap.ts` | `remapearLinha`, `remapearCelulas`, `remapearSegmentos`, `celulaDoPonto`, `chaveDaCelula`. Regras 1 a 4 e a fusão (regra 3). |
| `segmentos.ts` | `aplicarRemocoes` (região fundida retangular, segmentos sem montante), `podeRemoverSegmento` (`removeSegment` recusa o não retangular), `restaurarSegmento`. |
| `normalizar.ts` | `normalizarSobrescritas`: descarta órfãs e regrava as chaves adotadas (regra 6). |
| `pecas.ts` | `calcularPecas`: montantes por segmento (com tipo por linha, aparo pelos segmentos adjacentes), painéis por **região**. |
| `quant.ts` | `calcularQuant`: linhas de `quant_cortina`. |
| `avisos.ts` | `calcularAvisos`: medidas de `cortina_avisos`, inclusive órfãs e região não retangular. |
| `consulta.ts` | `resolverCortina` (tudo) e `paraConsulta` (formato de saída). |
| `casos.ts` / `casos.json` | Os 41 casos canônicos da fase 1. **Não mudam na fase 2.** |
| `casos2.ts` / `casos2.json` | Os casos da fase 2 (formato abaixo). |

Regenerar: `GERAR_CASOS=1 npx vitest run packages/engine/src/cortinaRef/casos.test.ts` (fase 1) e `GERAR_CASOS2=1 npx vitest run packages/engine/src/cortinaRef/casos2.test.ts` (fase 2). Os testes normais recusam se o arquivo divergir do gerador.

## Entrada (`CortinaEntrada`, em `tipos.ts`)

```
L, H            comprimento do eixo e altura do plano (m), > 0
num?            cortina_num das saídas (padrão 1)
tipo            { depth, u, v, mullions, defaultPanelTypeId, minCell? }
instancia?      { grid?: { u?, v? }, defaultPanelTypeId?,
                  addedLines?: AddedGridLine[], removedSegments?: SegmentRef[],
                  lineOverrides?: LineOverride[], cells?: CellOverrideEntry[] }
montantes[]     { id, num, profile {shape, width, depth}, materialId, materialNum, offset? }
paineis[]       { id, num, kind, thickness, bite?, offset?, materialId, materialNum }
```

- `LineRef`: `{ added: id }` (linha extra) ou `{ axis: 'u'|'v', index, pos, n }` (gerada). `index` é 1..n-1 para linha interna; **0 ou n** para borda (só vale em `removedSegments`). `pos` = fração (s/L ou z/H) na gravação; `n` = células do eixo na gravação.
- `SegmentRef`: `{ line, k, nk, mid }`. `k` = índice do segmento ao longo da linha; `nk` = total; `mid` = meio normalizado (0..1).
- `CellKey`: `{ i, j, s, z, nu, nv }`. `s`/`z` = centro normalizado na gravação; `nu`/`nv` = topologia na gravação.
- `AddedGridLine`: `{ id, axis, pos (m), locked?, mullionTypeId?, comprimentoGravado? }`.
- `LineOverride`: `{ line, locked?, pos? (m), mullionTypeId? (null = sem montante), comprimentoGravado? }`.
- `CellOverrideEntry`: `{ key, override: { kind: 'panel', panelTypeId } }`.

## Regras de remapeamento (ADR §4.4)

1. Mesma topologia (`nu`, `nv` iguais): vale o índice, se o centro novo ficou a até 0,5 da posição gravada.
2. Topologia diferente, ou falha da 1: vale a posição `(s·L', z·H')`, localizada na grade nova; na fronteira, a célula de menor índice.
3. Fusão (duas sobrescritas na mesma célula, ou na mesma região): vence a de menor distância ao centro; empate, a primeira na ordem da lista.
4. Vizinhança: ponto fora da grade, a célula mais próxima se estiver a até uma célula de distância e livre.
5. Órfã: fora de tudo (estado 2), perdedora na fusão (1) ou sem vizinha livre (3). Sai no aviso `cortina-override-orfao`.
6. Reescrita: a chave adotada leva o índice e a posição novos (`normalizarSobrescritas`).

Linhas usam o mesmo critério em 1D (índice; senão a linha interna mais próxima, a até uma célula média). Segmentos: a linha pelo critério de linha, depois o segmento pelo índice ou pelo meio.

## Saída de `cortina_grade` e `cortina_avisos` (fase 2)

- `linhas` u32 x5: `[cortina_num, eixo, indice, origem, flags]`. `origem`: 0 gerada, 1 extra, 2 manual (eixo de modo manual). `flags` bit0 = travada.
- `celulas` u32 x6: `[cortina_num, i, j, regiao, painel_tipo_num, flags]`. `regiao` = índice (i·nv+j) da célula canônica (menor j, depois menor i). `flags`: bit0 menor lado livre < minCell; bit1 célula com sobrescrita adotada; bit2 região com mais de uma célula.
- `segmentos` u32 x5: `[cortina_num, linha, k, removido (0/1), montante_tipo_num]`. `removido` = 1 para segmento sem montante por remoção (explícita, de borda, ou interno a uma região). `linha` é global: U = 0..nu; V = nu+1..nu+nv+1.
- `remapeamento` (u32/f64, **só quando a instância tem sobrescritas**; sem ela a saída é a da fase 1):
  - `sobrescritas` u32 x7: `[cortina_num, tipo (0 célula, 1 linha, 2 segmento), ordem, estado (0 adotada, 1 fusão, 2 fora, 3 ocupada), regra (0, 1, 2, 4), alvo_a, alvo_b]`. Alvo: célula (i, j); linha (índice, eixo 0 U / 1 V); segmento (linha global, k). `ID_AUSENTE` se órfã.
  - `chaves` f64 x2: `[s, z]` a chave gravada de volta (célula: centro; linha: fração; segmento: meio). 0 se órfã.
- `cortina_avisos` u32 x4 `[cortina_num, codigo, i, j]`, f64 x5 `[medido, limite, x, y, z]`. Fase 2: 6 órfã de célula (i, j da chave gravada); 7 órfã de linha (i = eixo); 8 órfã de segmento; 9 `cortina-celula-nao-retangular` (i, j = canto da caixa, medido = células, limite = área da caixa).

## `casos2.json`

```jsonc
{ "versao": 1, "adr": "0056", "fase": 2,
  "casos": [ { "nome": "...", "regra": "regra1", "entrada": <CortinaEntrada>, "normalizado"?: <CurtainInstanceRef>, "esperado": <SaidaConsulta> }, ... ] }   // um caso por linha
```

- `regra`: `regra1` … `regra6` (a regra de §4.4 que o caso exercita), `linha` (linha extra, travada, sobrescrita de linha) ou `regiao` (remoção de segmento e região retangular ou não).
- `normalizado`: a instância que a próxima edição gravaria (`normalizarSobrescritas(entrada)`). Presente só quando a entrada tem instância.
- `esperado`: `paraConsulta(resolverCortina(entrada))`, formato de `SaidaConsulta` acima.

Os 40 casos cobrem as regras 1 a 6, linhas extras e travadas, sobrescrita de linha, região retangular 1×2, 2×2 e 3×1, região em L e em T (removida), segmento de borda e painel por região.

## Decisões e ambiguidades (escolhas desta referência)

1. **Regra 4 e posição normalizada.** Com `s` e `z` em [0,1], o ponto `(s·L', z·H')` nunca sai da grade, então a regra 4 só dispara com chave inválida (s ou z fora de [0,1]). Está implementada e testada assim; o caso legítimo de "parede encurtou" cai na regra 2 (célula proporcional).
2. **Comprimento gravado.** O ADR diz que a fração `pos/L` acompanha o eixo quando a linha não está travada, mas `AddedGridLine.pos` é em metros e o tipo não guarda o `L` da gravação. Acrescentei `comprimentoGravado` (opcional) em `AddedGridLine` e `LineOverride`. Ausente = posição absoluta. Trava sem `pos` em linha gerada não tem efeito. Em linha extra, `lineOverride` só troca o montante.
3. **Região retangular.** Critério: o componente das células ligadas por remoções é um retângulo cheio. Dentro de uma região não há montante (mesmo sem remoção explícita). A remoção é aceita na ordem da lista; a que quebra o retângulo é ignorada com aviso 9. `podeRemoverSegmento` é o que o comando usa para recusar.
4. **Bordas.** O ADR fixa `index` em 1..n-1, o que não aponta a borda. Estendi só para `removedSegments` (índice 0 ou n: remove o montante da borda, sem fundir). Sobrescrita de linha de borda sai órfã (`fora`), porque o montante da borda vem do tipo.
5. **Painel de região.** Duas sobrescritas de painel numa mesma região: vale a regra 3 (menor distância ao centro da região); a outra é órfã por fusão.
6. **Solda de linhas.** Dentro de 1e-6, linha extra vence linha gerada; a gerada perdida vira órfã por fusão. Entre duas do mesmo tipo, vale a primeira.
7. **Códigos de aviso 6 a 9.** O ADR dá o nome, não o código; os valores estão em `avisos.ts`. Órfãs de célula, linha e segmento têm o mesmo nome (`cortina-override-orfao`).
8. **Estado 3 (ocupada).** O ADR não nomeia: é a órfã da regra 4 quando a vizinha já foi adotada.
9. **Linha 1D pela regra 2.** O ADR define a regra 2 para células. Para linha uso a interna mais próxima do ponto, se estiver a até uma célula média; o ADR manda "o mesmo", e isto é a leitura mais simples.

## Testes

- `grade.test.ts` (243): casos de borda de cada modo, `d >= L`, sobra minúscula, `count = 1`, dedupe, offsets, e 200 casos aleatórios com semente 56.
- `pecas.test.ts` (24): montantes, prioridade, papéis, painéis, avisos, quantitativos.
- `casos.test.ts` (44): os 41 casos da fase 1 (o arquivo é o que o gerador produz e a forma dos vetores).
- `remap.test.ts` (23): cada regra 1 a 6 com resultado escrito à mão; linhas extras e travadas; sobrescrita de linha.
- `segmentos.test.ts` (10): região retangular e não retangular (L, T), remoção de borda, painel de região, fusão de sobrescritas.
- `casos2.test.ts` (44): `casos2.json` é o que `gerarCasos2()` produz; forma dos vetores; cobertura das regras; avisos 6 e 9 nos casos que os exercitam.
