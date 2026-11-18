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
- Folha em movimento (`motion` rotate): o prisma `tz` herda `motion`; 3D (pivô por `geometriaRelativaAoPivo`) e planta (anel por intervalo, movimento aplicado em `slicePartsAtZ`) usam a seção real. [V para porta de giro; correr: não testado]

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
- Janela de correr com forma: o trilho superior vira um pedaço central solto (recorte horizontal fino); trilho em arco não foi feito. [V no probe]
- Composição com bandeira lateral e divisores em arco (leque, cruz): só o recorte genérico; sem barras novas (etapa 5 da síntese).
- `OpeningPart` não tem campo de comprimento linear: o metro linear de batente em arco sai de `faceArea` e espessura, não de uma função.
- Parede curva, inclinada ou com perfil: o furo volta ao retângulo (doc 26) mas as peças seguem o arco; [I] o batente em arco dentro de furo retangular fica sem encosto no arco.
- Rise do contorno acabado: usa a flecha gravada com a largura da esquadria; se `rise > w/2` na esquadria (vão bruto válido, esquadria menor) o modelo cai no retângulo. [V pela regra, sem teste]
- Medida de tempo no navegador: não rodei o app.

## 5. Como rodar

```
npx vitest run packages/engine/src/openingModelContorno.test.ts packages/model/src/openingShapeInset.test.ts packages/render/src/model3d/openingContorno3d.test.ts
npx tsc -p tsconfig.json --noEmit && node scripts/check-boundaries.mjs
```

Não houve mudança em Rust nem no `.wasm` (`build:wasm`/`wasm:check` não foram necessários).
