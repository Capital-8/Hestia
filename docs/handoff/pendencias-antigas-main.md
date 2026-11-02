# Pendências antigas — investigação (branch `fix/pendencias-antigas-main`)

Data: 2026-11-02

## 1) Porta editada: caminho comum x remontagem do zero

### Sintoma reproduzido

Depois de **apagar uma porta** e rodar o caminho comum (`ModelScene.update`; a porta é recusada pelo caminho rápido
`atualizarAberturas`, recusa 10, quando o projeto usa camadas de piso/laje com término por parede), a cena reutilizada
exporta mais triângulos que uma cena montada do zero, com as **arestas idênticas**:

```
apagar door pav1-O039: rápido=false (recusa 10) resolver 187 ms + cena 0 ms | remontagem comum DIFERENTE do completo
   tri 317552 ... arestas 84083 ...
   tri 317140 ... arestas 84083 ...
```

O relato original cita `371268 x 370816` em outro projeto; o padrão (diferença só de triângulos, arestas iguais) é o
mesmo. Reprodução usada aqui (o prédio gerado pelo importador DWG, 11 níveis e 550 aberturas):

```
SEM_DXF=1 npx vite-node scripts/lancar-edificio-dwg.mts \
  "C:/Users/DENNYL~1/AppData/Local/Temp/opencode/edificio.hestia.json"
npx vite-node scripts/equiv-edicao-elemento.mts \
  "C:/Users/DENNYL~1/AppData/Local/Temp/opencode/edificio.hestia.json"
```

### Hipótese descartada: chave por nível insuficiente

`chavesDeNivel` (`packages/render/src/model3d/chaveNivel3d.ts:37`) e o cache de resolução
(`LevelResolveCache`, `packages/engine/src/resolveLevels.ts:112`) **não** são a causa deste caso:

- `niveisAfetados(p0, p1)` devolve exatamente `{pav1, subsolo2, semisubsolo, pav2}` para a porta apagada;
- a resolução de cada nível (com cache compartilhado e com cache novo) só difere em `pav1` (o nível da porta);
- comparando `EntradaNivel.lotes`, `instancias`, `arestasSolidas` e `arestasCaixas` de cada nível da cena reutilizada
  com uma cena nova, **todos os níveis são iguais**;
- os caches de `resolveMemo.ts` (`pinturasDoCluster`, `furosDe`, `estruturaDasJuncoes`) são indexados por conteúdo
  (itens/furos) ou por identidade dos quadros; apagar porta muda os furos e não deixa resultado preso.

Ou seja: a geometria por nível está correta; o número de triângulos diverge na **leitura dos buffers da GPU**.

### Causa: `exportarVetores` ignora o `drawRange` das malhas

`ModelScene.exportarVetores` respeita o `drawRange` para `LineSegments`
(`packages/render/src/model3d/scene3d.ts:658`, correção de arestas), mas para `Mesh` usa o tamanho total do índice/
posição (`packages/render/src/model3d/scene3d.ts:681`):

```ts
const contar = indice ? indice.count : pos.count;
for (const m of matrizes) {
  for (let i = 0; i + 2 < contar; i += 3) { ... }
}
```

Os lotes globais da GPU mantêm **capacidade sobrando** além do `drawRange` quando um nível muda de tamanho em uma
montagem já fechada: `LoteGeometriaGpu.definir` remove e re-adiciona o segmento
(`packages/render/src/gpu/loteGeometria.ts:152`), `garantir` cresce as arrays (`loteGeometria.ts:277`) e o
`GestorRecursosGpu` não reconsolida (`consolidado`, `packages/render/src/gpu/gestorRecursos.ts:104`). O lixo fica atrás
do `drawRange` — a GPU não o desenha, mas `exportarVetores` o conta.

Confirmado no caso reproduzido:

```
exportar cena 952656  fresco 951420      (triângulos "exportados")
drawRange cena 178278 fresco 178278      (triângulos realmente desenhados)
capacidade cena 178690 fresco 178278     (diferença 412 = triângulos fantasma)
folga cena door cap 69840 draw 69660
folga cena door cap 409728 draw 408672  (412 triângulos no total)
```

As arestas coincidem porque aquele laço já corta pelo `drawRange`.

### Proposta de teste que reproduz

Em `packages/render/src/model3d/atualizarAberturas3d.test.ts` (ou arquivo próprio de `exportarVetores`):

1. **Teste direto do contrato**: montar um `ModelScene`, anexar ao `model` uma `THREE.Mesh` com uma geometria indexada
   de 2 triângulos e `geometry.setDrawRange(0, 3)`; `exportarVetores().trianglePositions.length / 3` deve ser `1`.
   Hoje devolve `2`. (Cobre também `drawRange.start` diferente de zero.)
2. **Teste de regressão do fluxo**: projeto com piso/laje de camadas com término por parede e uma porta; `update(p0)`,
   apagar a porta, `update(p1)`; comparar `exportarVetores()` com uma cena nova em `p1` **e** com a contagem que respeita
   `drawRange` (percorrendo as malhas visíveis). O teste falha hoje pela diferença de capacidade descrita acima.
3. Opcional: repetir com `edges: true`, garantindo que as arestas continuam iguais (já cobertas pelo `drawRange`).

Correção sugerida (não aplicada nesta tarefa): usar `indicesDesenhados`/`drawRange` no ramo de `Mesh` de
`exportarVetores` (a mesma regra de `LineSegments`), ou zerar a capacidade sobrando no `finalizar` do lote.
