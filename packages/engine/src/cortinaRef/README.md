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
3. Fusão (duas sobrescritas na mesma célula): vence a de menor distância ao centro; empate, a primeira na ordem da lista. Duas células de uma região fundida **não** se fundem: as duas são adotadas (como o Rust), e o painel da região é o da célula de menor (j, i) com sobrescrita.
4. Vizinhança: ponto fora da grade, a célula mais próxima se estiver a até uma célula de distância e livre.
5. Órfã: fora de tudo (estado 2), perdedora na fusão (1) ou sem vizinha livre (3). Sai no aviso `cortina-override-orfao` (7, 8 ou 9, conforme o alvo). Linha que sai do vão (extra ou sobrescrita de linha gerada) também é órfã de linha, com a posição resolvida; não há `posicao-fora` para ela.
6. Reescrita: a chave adotada leva o índice e a posição novos (`normalizarSobrescritas`).

Linhas usam o mesmo critério em 1D (índice; senão a linha interna mais próxima, a até uma célula média). Segmentos: a linha pelo critério de linha, depois o segmento pelo índice ou pelo meio.

## Saída de `cortina_grade` e `cortina_avisos` (fase 2)

- `linhas` u32 x5: `[cortina_num, eixo, indice, origem, flags]`. `origem`: 0 gerada, 1 extra, 2 manual (eixo de modo manual). `flags` bit0 = travada.
- `celulas` u32 x6: `[cortina_num, i, j, regiao, painel_tipo_num, flags]`. `regiao` = índice (i·nv+j) da célula canônica (menor j, depois menor i). `flags`: bit0 menor lado livre < minCell; bit1 célula com sobrescrita adotada; bit2 região com mais de uma célula.
- `segmentos` u32 x5: `[cortina_num, linha, k, removido (0/1), montante_tipo_num]`. `removido` = 1 para segmento sem montante por remoção (explícita, de borda, ou interno a uma região). `linha` é global: U = 0..nu; V = nu+1..nu+nv+1.
- `remapeamento` (u32/f64, **só quando a instância tem sobrescritas**; sem ela a saída é a da fase 1):
  - `sobrescritas` u32 x7: `[cortina_num, tipo (0 célula, 1 linha, 2 segmento), ordem, estado (0 adotada, 1 fusão, 2 fora, 3 ocupada), regra (0, 1, 2, 4), alvo_a, alvo_b]`. Alvo: célula (i, j); linha (índice, eixo 0 U / 1 V); segmento (linha global, k). `ID_AUSENTE` se órfã.
  - `chaves` f64 x2: `[s, z]` a chave gravada de volta (célula: centro; linha: fração; segmento: meio). 0 se órfã.
- `cortina_avisos` u32 x4 `[cortina_num, codigo, i, j]`, f64 x5 `[medido, limite, x, y, z]`. Códigos (iguais aos de `esquema.rs` e de `kernelCortinaTabelas.ts`): 6 `arco-nao-suportado` (reservado aqui, não é emitido); 7 órfã de célula (i, j = a chave gravada); 8 órfã de linha (i = índice da gerada gravada, ou a posição 1 a n da extra em `addedLines`; no eixo U vai em `i`, no V em `j`); 9 órfã de segmento (i = a linha gravada, j = k); 10 `cortina-celula-nao-retangular` (i, j = a célula de um lado do segmento recusado; medido = células da região que a remoção daria; limite = área da caixa; x e z = centro dessa célula). Nas órfãs de célula, linha e segmento, `medido` = x e `limite` = z (m), como o Rust. `posicao-fora` (4) é só de posição manual fora do vão.

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
5. **Painel de região.** Duas sobrescritas de painel numa mesma região: as duas são adotadas (o Rust faz assim); o painel da região é o da célula de menor (j, i) com sobrescrita. Só duas na MESMA célula se fundem (regra 3).
   Com isso a flag bit1 vale célula a célula: cada célula cuja própria sobrescrita foi adotada leva o bit1 (em região de duas células com as duas adotadas, as duas levam).
6. **Solda de linhas.** Dentro de 1e-6, linha extra vence linha gerada; a gerada perdida vira órfã por fusão. Entre duas do mesmo tipo, vale a primeira.
7. **Códigos de aviso.** Iguais aos do Rust (é a verdade): 6 arco (reservado), 7 órfã de célula, 8 órfã de linha, 9 órfã de segmento, 10 região não retangular. Os três de órfã têm o mesmo nome (`cortina-override-orfao`).
8. **Órfã de linha.** `i` (ou `j`) é o índice da linha gerada gravada ou a posição da extra em `addedLines` (1 a n, como o conversor da fixture numera). A linha que sai do vão só emite a órfã (sem `posicao-fora`).
9. **Regra 4 do dono (flag bit1).** Na prática, o Rust marca cada célula com sobrescrita adotada, não só a canônica. Com as duas células de uma região adotadas, as duas levam bit1 (caso "duas sobrescritas de painel numa região"). Marcar só a canônica daria 4 na segunda célula e não bateria com o Rust.
10. **Estado 3 (ocupada).** O ADR não nomeia: é a órfã da regra 4 quando a vizinha já foi adotada.
11. **Linha 1D pela regra 2.** O ADR define a regra 2 para células. Para linha uso a interna mais próxima do ponto, se estiver a até uma célula média; o ADR manda "o mesmo", e isto é a leitura mais simples.

## Testes

- `grade.test.ts` (243): casos de borda de cada modo, `d >= L`, sobra minúscula, `count = 1`, dedupe, offsets, e 200 casos aleatórios com semente 56.
- `pecas.test.ts` (24): montantes, prioridade, papéis, painéis, avisos, quantitativos.
- `casos.test.ts` (44): os 41 casos da fase 1 (o arquivo é o que o gerador produz e a forma dos vetores).
- `remap.test.ts` (23): cada regra 1 a 6 com resultado escrito à mão; linhas extras e travadas; sobrescrita de linha.
- `segmentos.test.ts` (10): região retangular e não retangular (L, T), remoção de borda, painel de região, fusão de sobrescritas.
- `casos2.test.ts` (44): `casos2.json` é o que `gerarCasos2()` produz; forma dos vetores; cobertura das regras; avisos 7 e 10 nos casos que os exercitam.

## Divergências do Rust que a referência NÃO acompanha (não cobertas pelos 40 casos)

Conferidas por leitura do código, sem caso que as exercite. Se o dono decidir, a referência se alinha; até lá, o Rust (a verdade) pode diferir:

- **Remoção de segmento repetida.** A referência põe o perdedor como órfão de segmento (aviso 9, `fusao`). O Rust deduplica em silêncio (`mapear_segmentos`: "remoção repetida vale uma vez"), sem aviso.
- **Linha gerada sobrescrita que some numa fusão com extra.** A referência a torna órfã de linha (estado `fusao`, teste em `remap.test.ts`). O Rust a deixa sem aviso (dedup em `linhas_finais`).
- **Linha de grade: limite de distância.** A referência só aceita a linha mais próxima se estiver a até uma célula média (`remapearLinha`). O Rust sempre adota a mais próxima (`mapear_gerada`).
- **Sobrescrita de linha de borda.** A referência a torna órfã (`fora`). O Rust a trata como gerada (índice 0 cai no caminho da mais próxima).
- **Ordem das remoções.** A referência aplica na ordem da lista. O Rust aplica em ordem canônica (eixo, linha, k) e só então decide quem é recusado; em conflitos de L/T a recusa pode mudar.
- **Segmento: escolha do k.** A referência usa a regra 1 só se o meio ficou a até 0,5 e, senão, o segmento que contém o ponto. O Rust usa o k gravado se a contagem for a mesma e, senão, o segmento de centro mais próximo.
