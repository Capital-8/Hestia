# Peças da esquadria que seguem o contorno do vão

Data: 2026-11-18. Continua `24`, `26` e `27`; cumpre a etapa 3 da fase 2 de `00-sintese.md` (§4) e parte da etapa 5. Marcas: [V] verificado nesta sessão (código lido ou teste rodado); [I] inferência, a validar. Linhas valem para o branch `claude/lucid-bell-hwk4ln` nesta data.

## 1. Como as peças eram geradas (antes)

- Todas as vistas leem UM modelo: `buildOpeningModel(p, o, g, f)` (`engine/src/openingModel.ts:25`) devolve `OpeningModel.parts: OpeningPart[]`. Cada peça é uma caixa `PartBox` (t, s, z) com `role`, `material`, `motion` opcional e `profile` opcional (`openingModelTypes.ts:76` `PartProfile`, `:81` `OpeningPart`). [V]
- `PartProfile` já tinha três planos: `ts` (extruda em z, ombreira com rebaixo), `sz` (extruda em t, travessa com rebaixo) e `tz` (seção (t, z) extrudada em `s`; só usado em maçaneta e roseta). A caixa da peça é sempre a envolvente exata do prisma. [V]
- Os construtores (`openingModelDoors*.ts`, `openingModelWindows*.ts`, `openingModelComposition.ts` + `openingModelMembers.ts`, `openingModelCasing.ts`, `openingModelDetails.ts`) só criam caixas. O vão com forma só afetava o furo da parede (`OpeningGeometry.forma`, `types.ts:151`); as peças ficavam retangulares. [V]
- Consumidores: 3D `render/src/model3d/openingParts.ts:77` (`openingPieces`, `pecasDoModelo` :90) copia `profile`/`group` para `OpeningPiece`; `geometriaPeca3d.ts:79` (`geometriaDoPerfil`) já extruda `tz`. Planta: `slicePartsAtZ` (`openingModelTransforms.ts:245`) e `openingPlanNew.ts:179,209`. Elevação: `projectParts` (:303) já usa a seção `tz` real. IFC: `apps/web/src/editor/ifcExport.ts:107` só lê a caixa; `packages/io/src/ifc/ifcExport.ts:54,242` extruda um retângulo em z. [V]
- Quantitativo de PEÇAS não existia: o quadro (`openingSchedule.ts`) só tem área de vão. [V]
- Não existia `inset` do contorno: o spike (`engine/src/spike/outline.ts:24`) só cobre `round` e `segmental`. [V]

## 2. Desenho

Princípio: a montagem retangular de sempre fica intacta e um pós-processo (`contornoDoModelo`, `openingModelContorno.ts:253`, chamado nos dois `return` de `openingModel.ts:45,62`) troca só as peças que tocam o contorno. Vão retangular, ausente ou forma inválida devolve o MESMO objeto. A forma usada é `g.forma` com largura e altura da esquadria (`m.width`, `m.height`), não as do vão bruto; a flecha fica como gravada. [V]

### 2.1 Geometria nova (`packages/model/src/openingShapeInset.ts`, arquivo novo; `openingShape.ts` intocado)

- `crownOf(shape, inset)` (:72): coroa do contorno recuado, arco CONCÊNTRICO (raio R - d; ogival: mesmos centros, raio r - d). Cordas com erro <= 1 mm como `outline`. Sem aproximar por faixas. Distância negativa expande (alizar).
- `outlineInset(shape, inset)` (:165): região recuada (anel anti-horário). `inset` é número ou `{ side, arc, base }`. Elipse/círculo: recuo paralelo (pontos deslocados pela normal), recusado se o recuo passa do menor raio de curvatura.
- `crownBand(shape, dOut, dIn)` (:192): faixa entre dois contornos acima do `floor` (menor arranque). As ombreiras retas sobem até `floor`, então ombreira e faixa fecham sem sobra nem sobreposição.
- `ringHalves(shape, dOut, dIn)` (:211): anel de círculo em duas metades fechadas em x = 0 (um prisma `tz` não tem furo).
- `clipRect` (:233), `ringSignedArea`, `ringPerimeter`: utilitários.
- Quando o recuo do arco é maior que o lateral, a coroa ganha uma prateleira na cota do centro do arco (a região continua definida e convexa por partes). [I: casos extremos]

### 2.2 Regras por peça (`openingModelContorno.ts`)

| Peça | Regra | Onde |
|---|---|---|
| Batente, ombreiras (`jamb`) | sobem (ou descem) até o arranque da faixa; perfil `ts` do rebaixo preservado | :127 |
| Batente, travessa (`head`) | uma faixa em arco POR FATIA de `s` do perfil `sz` (o rebaixo do batedor vira prismas `tz` do mesmo `group`, mesmo volume do perfil em L) | `fatiasDaTravessa` :56, `arco` :105 |
| Alizar | travessa vira faixa em arco com recuo negativo; laterais sobem até o arranque; soleira do alizar fica reta; círculo vira duas metades por face | `alizarEmArco` :182, `alizarEmAnel` :195 |
| Vidro, folha, divisores, baguetes, almofadas, trilhos | caixa recortada pelo contorno recuado (`outlineInset` e `clipRect`); só vira prisma `tz` se a caixa ultrapassa o contorno, senão fica a mesma caixa | `recortada` :84 |
| Travessa superior da folha de janela | faixa em arco entre o recuo do topo e o do fundo da travessa | `travessaDaFolha` :96 |
| Círculo | jamb/head/sillFrame viram `jamb-right` e `jamb-left` (anel em duas metades) | `circulo` :212 |
| Verga, contraverga, peitoril, soleira, ferragens | não mudam | |

### 2.3 Decisão: folha segue o arco OU bandeira em arco com folha retangular?

Escolhido: AS DUAS, pela mesma regra, sem campo novo. [V]

- Tipo SEM bandeira (`transom` ausente, composição de uma célula): a folha de porta é recortada pelo contorno recuado e segue o arco (porta em arco, estilo colonial). Teste: `leaf-0` vira `tz` e fica dentro do contorno.
- Tipo COM bandeira (`OpeningType.transom` ou composição folha + vidro superior): a folha termina abaixo do arranque, não ultrapassa o contorno, e a regra "só recorta se a caixa passa do contorno" a deixa como caixa. O vidro da bandeira (`glass-transom`, composição) é o que vira arco. Teste: `leaf-c1` continua caixa e `glass-transom` vira `tz` com topo a `J` do topo do vão.
- Justificativa: usa o campo existente (`transom`/composição), não cria estado novo e não muda o tipo de quem já tem bandeira. Quem quer folha retangular embaixo põe a bandeira; quem quer a folha em arco não põe. A folha que o arco cortaria só em parte (porta com bandeira baixa, topo da folha acima do arranque) é recortada: [I] resultado aceitável, sem teste dedicado.
- Folha em movimento (`motion` rotate): o prisma `tz` herda `motion`; 3D (pivô por `geometriaRelativaAoPivo`) e planta (anel por intervalo, movimento aplicado em `slicePartsAtZ`) usam a seção real. [V para porta de giro; correr: ver §6.2]

### 2.4 Planta, 3D, elevação

- 3D: nenhuma mudança no render. `pecasDoModelo` copia `profile` e `geometriaDoPerfil` extruda `tz` com normais para fora (teste de volume da malha = volume do quantitativo, a 1e-7). [V: `render/src/model3d/openingContorno3d.test.ts`]
- Planta: `slicePartsAtZ` (`openingModelTransforms.ts:245`) passou a devolver UM ANEL POR INTERVALO para peças `tz` (par-ímpar). Acima do arranque o batente tem duas pernas e o meio do vão fica livre; perto do topo a faixa cobre t = 0. Peças `handle` seguem o caminho de antes. A folha cortada acima do arranque tem a largura do arco naquela cota, fechada e aberta a 90 graus. [V]
- Elevação: `projectParts` já usava a seção `tz` real; as peças em arco aparecem com o contorno. [V pela leitura, sem teste novo]
- Corte transversal: a faixa projetada é a envolvente (s, z), correta como projeção. [I]

### 2.5 Quantitativo (`openingPartQuantities.ts`, arquivo novo)

`partQuantity` (:30): volume (seção x extrusão, também `ts`/`sz`/`tz`), área da silhueta em elevação (= área do vidro) e perímetro dessa silhueta. `modelQuantities` (:64) soma por papel. `buildOpeningPartsSchedule(p)` (:109): uma linha por tipo e medida efetiva, com volume de batente, alizar e folha, área de vidro, e os totais x quantidade. Exportado do engine. [V: `openingModelContorno.test.ts`]

## 3. Garantia de peças idênticas no vão retangular [V]

- `contornoDoModelo` devolve o mesmo objeto quando `forma` é ausente, `rect` ou inválida; teste compara o JSON do modelo de `ot_p90`, `ot_p160`, `ot_j120` e `ot_jf_80x60` com e sem `shape: rect`.
- Regressão rodada (vitest): `packages/engine/src/opening*`, `section*`, `furoContorno*`, `packages/render/src/model3d`, `packages/render/src/plan`, `openingCatalogoVistas`, `packages/model/src/openingShape*`: 221 arquivos, 2597 testes verdes (10 já ignorados).

## 4. O que ficou de fora

- IFC das peças: `apps/web/src/editor/ifcExport.ts:107` e `packages/io/src/ifc/ifcExport.ts:54,242` só extrudam a caixa em z. Com a peça em arco isso exporta a caixa ENVOLVENTE (maior que o arco): regressão visual possível no IFC de vão com forma até ligar a extrusão `tz` (`extrudeHorizontalProfile` em `ifcSolids.ts:145` serve, com eixo (0,1,0)). Não toquei: os dois arquivos estavam em edição por outra frente (ficha 23). [V que a caixa é o que sai; I sobre o conserto]
- Corte (`section.ts`) e DXF seguem como estavam; o DXF usa o mesmo modelo, então a planta em arco entra no DXF sem mudança. [I]
- Faixa do quadro: `buildOpeningPartsSchedule` é uma função nova, não foi ligada ao quadro da interface nem ao CSV (`openingSchedule.ts` já passa de 420 linhas úteis).
- ~~Janela de correr com forma: trilho superior solto~~ FECHADO em §6.1 e §6.2.
- ~~Divisores em arco (leque, cruz, colonial, prairie, losango)~~ FECHADO em §6.3. Bandeira lateral (sidelights) com divisores: continua só com o recorte genérico.
- `OpeningPart` não tem campo de comprimento linear: o metro linear de batente em arco sai de `faceArea` e espessura, não de uma função.
- Parede curva, inclinada ou com perfil: o furo volta ao retângulo (doc 26) mas as peças seguem o arco; [I] o batente em arco dentro de furo retangular fica sem encosto no arco.
- ~~Rise do contorno acabado sem teste~~ FECHADO em §7 (regra, aviso e testes).
- Medida de tempo no navegador: não rodei o app.

## 6. Fechamento: correr, bandeira decorada e esquadria menor que o vão

Arquivos novos: `engine/src/openingModelContornoCorrer.ts` (trilho e folha que desliza), `openingModelMuntinsContorno.ts` (divisões decorativas), `openingModelPrisma.ts` (`prisma` movido de `openingModelContorno.ts`), `openingShapeEsquadria.ts` (regra do §7), `model/src/openingMuntinPattern.ts` (campo novo). No que já existia: `contornoDoModelo` ganhou o 3o parâmetro (`padrao`) e `recortada`/`arco`/`circulo` chamam o trilho e o recorte deslizante (`openingModelContorno.ts` 260 linhas); `openingModel.ts` passa o padrão nos dois `return`. Testes: `engine/src/openingModelContornoLacunas.test.ts` e `render/src/model3d/openingContornoLacunas3d.test.ts`.

### 6.1 Trilho em arco (janela e porta de correr) [V]

- `track-head`: faixa em arco de espessura constante entre o recuo do topo e o do fundo do trilho (`crownBand`, mesma regra da travessa da folha), de arranque a arranque; deixa de ser o pedaço central solto. Arco pleno: área da faixa = (pi/2)((R-d)^2-(R-d-0,01)^2) a 1 %, e volume = área x profundidade. [V teste]
- `track-sill`: reto na base reta do arco (a base não muda); em CÍRCULO os dois trilhos viram a metade de cima e a de baixo do anel entre elipses (`ringHalves` cortado em z = H/2). [V teste]

### 6.2 Folha que corre sob o arco: decisão [V]

Folha móvel não pode ser só recortada na posição fechada: ao deslizar ela sairia do arco (o canto alto do recorte vai parar onde o arco é baixo). Regra: a peça com `motion` do tipo `slide` é recortada pela INTERSEÇÃO da região recuada com a mesma região deslocada pelo curso (`clipDeslizante`). A região recuada é convexa, então a folha cabe sob o arco em toda posição intermediária (combinação convexa das duas pontas). Para a região ser convexa o recuo do arco da peça móvel fica limitado ao lateral (`min(arco, lateral)`: no máximo 4 a 8 mm a menos que a folha fixa).

- Folha fixa: só o recorte pelo contorno, como antes. Folha móvel: montantes e vidro sob o envelope (topo em "empena" entre as duas pontas do curso).
- A travessa FINA de cima da folha móvel não cabe sob o arco nas duas pontas e SAI (`leaf-1-top` some; `leaf-0-top` fixa continua em faixa de arco). Consequência visual: a folha móvel fica sem travessa superior, com o vidro até o envelope. [I: aceitável; alternativa futura é fita de perfil ao longo do envelope]
- Vale também para correr de porta, `slide` vertical (guilhotina, `dz`) e a janela de correr em abatido, ogival e círculo (testados). Região não convexa (arco com prateleira) cai no recorte fechado.
- Testes: para cada forma (pleno, abatido, ogival, círculo), todo prisma fica dentro do contorno em 0, 25, 50, 75 e 100 % do curso. [V]

### 6.3 Divisões decorativas em vão com forma [V]

Campo novo e opcional `OpeningType.muntinPattern = { kind, cols, rows, on? }` (`kind`: `colonial | prairie | diamond | fan | cross | mullions`; 1 a 8; `on`: `'all'` padrão ou `'transom'`). Lido por `openingMuntinPattern` (model), validado em `opening.ts`, entrada nova no teste-guarda `contratoCamposEsquadria.test.ts`. Sem `shape` o campo é IGNORADO e o modelo é idêntico (teste com `rect`, sem forma e 3 tipos). As barras são prismas `tz` de 25 mm recortados pelo polígono do vidro (já recuado), com a profundidade da grade existente quando há:

| Desenho | Geração |
|---|---|
| `colonial` | `cols-1` montantes inteiros e `rows-1` travessas PARTIDAS entre montantes (sem sobreposição). Com `on = 'all'` deixa a grade `grid` que já existia (modelo idêntico, já recortada pelo contorno). Com `on = 'transom'` enfeita a bandeira, que não tinha grade |
| `mullions` | só os `cols-1` montantes, igualmente espaçados |
| `cross` | montante central e travessa partida (sem sobrepor) na cota do arranque; no meio do vidro se o arranque não cai nele |
| `prairie` | filete que acompanha o contorno do vidro recuado (margem de 1/5 do menor lado, 5 a 12 cm), em duas metades abertas |
| `diamond` | duas famílias de diagonais pela malha `cols x rows`; nos nós as barras se sobrepõem e o volume conta cada uma (superestima ~2 x 0,0125^2 x profundidade por nó) |
| `fan` | `cols-1` raios a partir do centro do arco (n setores de pi/n; círculo: 2n raios em 360 graus) com cubo vazado (os raios não se sobrepõem) e, com `rows > 1`, `rows-1` arcos concêntricos |

`on = 'all'` troca a grade `grid` (muntins `muntin-*`); `on = 'transom'` mantém a grade e enfeita só o vidro `*transom*`. Testes: cada desenho na bandeira em arco (porta com bandeira): barras dentro do vidro (tolerância 1e-6), volume = área x profundidade, soma das áreas < área do vidro, tudo dentro do contorno, folha retangular sem barras; leque com raios alinhados a k pi/n e arcos de raio constante. [V] Limites [I]: vidro não convexo (arco com prateleira) fica sem divisões; padrão por célula de composição (`GlassSpec.grid`) não existe, só o do tipo; sem forma não há padrão novo (vão retangular fica como era, de propósito).

## 7. Esquadria menor que o vão bruto (`roughOversize`) [V]

O vão bruto (largura e altura + folga) fura a parede; a esquadria é menor e fica centrada em t, apoiada na base (a folga de altura vai para cima). Regra:

1. A esquadria tem a MESMA forma (tipo e flecha gravados) na largura e na altura DELA (`formaDaEsquadria`). Todas as peças recuam concentricamente a partir desse contorno (§2.2); o batente sobe até o arranque da esquadria e a travessa termina em `m.height`.
2. O contorno da esquadria cabe no do furo: nos casos testados (folgas 6x3, 6x6 e 10x0 cm, porta e janela de correr) todo prisma fica dentro do contorno da esquadria E do furo (`g.forma`). [V] As folgas não são sempre concêntricas (a folga de altura é só para cima), então o espaço entre esquadria e furo no arco não é uniforme: é espuma/argamassa, fora do modelo.
3. A flecha NÃO encolhe com a esquadria. Se deixa de caber na esquadria (abatido com `rise > w/2`, arco pleno mais largo que alto), a forma da esquadria é inválida: as peças ficam RETANGULARES (modelo idêntico ao do tipo sem forma, teste) e `openingShapeIssues` emite o aviso `forma-esquadria-retangular` (traduzido em pt, en, es, de, fr, it e pl; chave `egb_issue_opening_shape_frame`). O furo na parede continua com a forma. Sem aviso quando cabe. Só aviso, nunca bloqueia.
4. Mesma esquadria com e sem folga dá as mesmas peças (a folga só cresce o furo). Vão retangular com folga: modelo idêntico com e sem `rect`. [V testes]

## 8. Garantia do vão retangular após o fechamento [V]

Nenhuma peça de vão retangular mudou: `contornoDoModelo` devolve o mesmo objeto sem forma ou com `rect`; `muntinPattern` só é lido dentro do caminho de forma. Provas: as de §3 seguem verdes e foram somadas (com `muntinPattern`, com `roughOversize`, e `ot_j120` com e sem `rect`). Regressão rodada (vitest): `packages/engine/src/opening*`, `roughOpening`, `furoContorno*`, `packages/render/src/model3d`, `packages/render/src/plan`, `packages/model/src/opening*`, `contrato*` e `apps/web/src/editor/i18n`: 220 arquivos, 2686 testes verdes (10 já ignorados). `eslint` e `check-boundaries` limpos nos arquivos tocados.

## 9. Como rodar

```
npx vitest run packages/engine/src/openingModelContorno.test.ts packages/engine/src/openingModelContornoLacunas.test.ts packages/model/src/openingShapeInset.test.ts packages/render/src/model3d/openingContorno3d.test.ts packages/render/src/model3d/openingContornoLacunas3d.test.ts
npx tsc -p tsconfig.json --noEmit && node scripts/check-boundaries.mjs
```

Não houve mudança em Rust nem no `.wasm` (`build:wasm`/`wasm:check` não foram necessários).
