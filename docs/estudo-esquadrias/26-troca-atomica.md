# Troca atômica do furo por contorno no engine (3D, planta, quantitativo)

Data: 2026-11-18. Continua `24` (§5, "o que NÃO foi ligado") e `25`. Marcas: [V] verificado nesta sessão (código lido ou teste rodado); [I] inferência, a validar. Linhas valem para o estado do branch `claude/lucid-bell-hwk4ln` nesta data.

Princípio: o vão com `via: 'contorno'` (forma válida, cliente instalado, parede reta e vertical, sem perfil de topo/base e sem parede inclinada no cluster) deixa de cortar as faixas. A camada fica INTEIRA em `bands` e o furo é aplicado depois, pela malha do cliente, no 3D, no quantitativo e (na largura da cota) na planta. Vão retangular e projeto sem cliente seguem pelo caminho de antes, byte a byte.

## 1. O que foi ligado (arquivo:linha)

| Peça | Onde | O que faz |
|---|---|---|
| Porta estendida | `furoContornoDespacho.ts` (`ClienteFuroContorno.furarPrisma?`, `retornoDoVao?`, `furarPrismaPorContorno`, `retornoPorContorno`, `versaoClienteFuro`) | métodos opcionais: furo do prisma pós-junção (doc 25) e retorno que segue o contorno (doc 22). Memo por conteúdo (256 entradas), limpo a cada `definirClienteFuroContorno`. [V] |
| Rota | `furoContornoDespacho.ts` `rotaDoVao` (`ParedeDoFuro.perfil`, `.clusterInclinado`; motivos `parede-com-perfil`, `cluster-inclinado`) | perfil de topo/base e cluster com parede inclinada ficam retangulares. [V] |
| Escolha do grupo | `resolveContorno.ts:37` `contornoDoGrupo` | quais vãos vão por contorno, e o retorno (camadas envolventes, recuo, faixa de s). [V] |
| Faixas | `resolve.ts:~346` (`opens` filtrado dentro de `solveCluster`), `resolveQuebras.ts` | vão por contorno não gera furo retangular nem quebra de peitoril/topo. [V: teste "sai da rota retangular"] |
| Retorno retangular | `resolve.ts:~430` (laço de `returns` pula o vão) | sem ombreiras retangulares no vão por contorno. [V] |
| Planta (hachura) | `resolveContorno.ts:54` `furoDePlanta`, usado em `resolve.ts:344` | retângulo com a meia-largura de `cutHalfWidth` na cota do corte; vazio acima do arco ou abaixo do peitoril. [V: 1,2 m = largura cheia; no arco = corda; acima = sem furo] |
| Planta (símbolo) | `render/src/plan/simboloContorno.ts`, chamado em `plan/build.ts:232` | vão LIVRE (`leaves = 0`) com forma usa `openingPlanSymbolPaths`. [V] |
| Cache do cluster | `resolve.ts:442` | chave ganha `contorno:<ids>@<cota do corte>`. Sem a cota, dois cortes diferentes reaproveitavam a hachura do primeiro (bug achado pelo teste de planta). [V] |
| Despacho ao Rust | `resolve.ts:381` `nivelComContorno` | nível com vão com forma e cliente instalado resolve no TypeScript (o kernel Rust fura em retângulo). [V] |
| Dado na parede | `types.ts` `ResolvedWall.furosContorno`, `FuroContornoDaParede` | `OpeningGeometry` + retornos; preenchido em `resolve.ts:468`. [V] |
| Camada furada | `furoContornoParede.ts:75` `camadaFurada(rw, l, bands)` | por camada: um prisma por faixa (anéis em [u, s], z relativo), até 32 por chamada; malha, volume removido, retornos, volume líquido. Falha do cliente ou ausência de `furarPrisma`: recuo para faixas furadas em retângulo (a parede nunca fica sem vão). [V] |
| 3D | `render/src/model3d/solids.ts:~390` (`wallLayerSolid`), `wallContornoSolid.ts` | malha do cliente no lugar de `extrudeLayer`, normais chapadas, coordenadas do mundo; chave de cache com `versaoClienteFuro` e os vãos. Só em parede não inclinada. [V] |
| Quantitativo | `quantities.ts:~89` | volume bruto da camada = faixas inteiras - removido + retornos; `cortado` por piso/laje sobre as faixas efetivas. `openingsArea` usa a área REAL do contorno (`quantities.ts:127`). Com vão por contorno o despacho de quantidades do Rust é ignorado. [V] |
| Qto do vão | `furoContornoParede.ts` `areaPerimetroDoContorno` (shoelace sobre `outline`), `areaDoVaoDoTipo` em `openingSchedule.ts` (`unitArea`/`totalArea`) | área e perímetro reais; no quadro, área real só com cliente instalado. [V] |
| Cliente falso | `furoContornoFalso.ts` (exportado do engine) | analítico, sem booleana: área do polígono recortada pela caixa do prisma x área do contorno convexo; "malha" = caixa do prisma. |

## 2. Testes

- Novos [V, todos verdes]: `engine/src/furoContornoTroca.test.ts` (10: sem cliente = retangular; retangular idêntico com cliente; vão sai da rota e a porta segue furada; volume e área do vão; recuo sem `furarPrisma`; planta nas cotas 1,2 / arco / acima; retorno pelo cliente; quadro; parede curva e inclinada; Rust não despachado), `render/src/model3d/wallContornoSolid.test.ts` (3), `render/src/plan/simboloContorno.test.ts` (2).
- Regressão do vão retangular [V]: vitest de `resolve*`, `engine.test`, `netQuantities`, `roughOpening`, `openingHeight`, `openingSchedule*`, `openingShape*`, `schedule*`, `roofWall*`, `wallFloorProfile`, `wallJunction`, `profile`, `membrane*`, `stacked`, e render `solids`, `plan/*` (caracterizacao, revealPlanta, symbols, planFrame), `wallTiltOpening`, `desenhoQuantitativo` passaram (antes e depois da troca); resultado final na seção 5.

## 3. O que ficou de fora

- Fórmulas do Rust como referência: a área do contorno usa a mesma conta de `quant_vao`, mas a área de face líquida por malha (`quantificar_parede`) não foi chamada; o TS usa `volume / espessura` como já fazia. [I]
- Volume removido sobre piso/laje: `cortado` é medido sobre as faixas inteiras, então a parte do furo que cai dentro de piso/laje pode ser descontada duas vezes (desprezível em vão afastado do nível). [I]
- Retorno em canto (recorte contra a parede vizinha em 3D) e retorno de vão que toca o piso: não tratados (doc 22 §4.2 itens 4, 5). O `recuo` do pedido é entregue ao cliente; o adaptador real precisa deslocar o contorno por `recuo` antes de gerar o anel. [I]
- Junção: o vão é aplicado depois da junção, mas o prisma é o `fused` pós-junção SÓ no 3D; o quantitativo usa `l.bands`. Vão junto de ponta em esquadria depende do `furar_prisma` aceitar o polígono (doc 25). [I]
- Vista de corte (`section.ts:393`), contorno do vão em planta (`view.ts`/`planOverlay.ts`), elevação, IFC e DXF continuam retangulares: a parede aparece SEM o furo do contorno nessas vistas. O ponto é `section.ts` (usar `verticalCutProfile`). [V pela leitura, não alterado]
- Planta: o símbolo com folhas (`leaves > 0`) segue o do modelo (caixa retangular, fase 3). O símbolo de vão livre decide a rota só pela inclinação da parede (não vê perfil), então em parede com perfil o símbolo pode estreitar com a hachura retangular. [I]
- Rust: `kernelA3.ts` ainda codifica esses vãos como retângulo; por isso o nível cai no TypeScript. O comparador `kernelComparaA3` não foi ajustado. Retomar quando o kernel resolver a forma. [I]
- `resolveLevel` cai no TypeScript por nível inteiro: custo de desempenho não medido. [I]
- Wasm real: nada rodado com cliente real; só o falso. `build:wasm` não rodado.
- Quadro: a área real usa o vão BRUTO (forma dimensionada por `roughOversize`), e mostra a real também em parede curva/inclinada, onde o furo é retangular. [I]

## 4. Como ligar o cliente real

`definirClienteFuroContorno({ furarParede, furarPrisma, retornoDoVao })`, com `furarPrisma` mapeando `PedidoFuroPrisma` para os buffers de `furo_prisma_furar` (doc 25 §3; um prisma = polígono(s) em [u, s] + z0/z1) e devolvendo `MalhaPrismaFurada` com os índices locais. Sem `furarPrisma` tudo recua para o furo retangular em faixas.

## 5. Verificação final

[V] `tsc -p tsconfig.json --noEmit` limpo; `eslint` limpo nos arquivos alterados; vitest das áreas acima: 98 arquivos, 1109 testes verdes (inclui os 15 novos).
