# 23. Perfil do vão e IfcOpeningElement em IFC4 (função pura, sem conexão ao export)

> **Atualização (2026-11-19):** este módulo foi ligado ao export (vão com forma no peitoril), com `Lining/Panel Properties`, `Qto` real, peças em arco e import da forma. Ver docs 30 (IFC) e 35 (mescla). As pendências do §5 sobre conectar ao export e sobre o import estão superadas; continua sem validação em visualizador.

Data: 2026-11-17. Status: **módulo pronto e testado, não conectado a `exportIfc`.** Nada em arquivos existentes foi alterado.

Marcas: **[V]** = verificado no código ou nos testes; **[I]** = inferência, não validada em visualizador IFC.

## 1. O que foi feito

| Arquivo (novo) | Conteúdo |
|---|---|
| `packages/io/src/ifc/ifcOpeningProfile.ts` | `addOpeningProfile(w, ctx, placement, key, name, shape, opts)`: escreve no `StepWriter` recebido o perfil, o vazio extrudado, a representação e o `IFCOPENINGELEMENT`, e devolve os ids |
| `packages/io/src/ifc/ifcOpeningProfile.test.ts` | 18 testes (ver §4) |

Entidades escritas, nesta ordem:

1. `IFCCARTESIANPOINT` por vértice do contorno (x, z);
2. `IFCPOLYLINE` fechada (primeiro ponto repetido no fim);
3. `IFCARBITRARYCLOSEDPROFILEDEF(.AREA., $, polilinha)`;
4. `IFCCARTESIANPOINT` de origem, `IFCDIRECTION` de eixo e de X, `IFCAXIS2PLACEMENT3D` do sólido;
5. `IFCEXTRUDEDAREASOLID(perfil, posição, (0,0,1), profundidade)`;
6. `IFCSHAPEREPRESENTATION` / `IFCPRODUCTDEFINITIONSHAPE` (via `bodyShape`, o mesmo helper do resto do export);
7. `IFCOPENINGELEMENT(GlobalId, $, nome, $, $, colocação, representação, $, .OPENING.)`.

O contorno vem de `outline()` de `packages/model/src/openingShape.ts`, então as cinco formas (`rect`, `round`, `segmental`, `pointed`, `circle`) passam por um único caminho. Forma inválida lança erro **antes** de qualquer escrita, então o escritor não fica com entidades parciais.

## 2. Escolha da representação do arco

Opção escolhida: **polilinha com cordas de 1 mm** (`IFCPOLYLINE`, erro máximo `CHORD_TOL`).

Alternativas consideradas:

- **`IFCCOMPOSITECURVE` com `IFCTRIMMEDCURVE` sobre `IFCCIRCLE`** (coleta 17, §5). Descartada como padrão porque:
  - não cobre a elipse (`circle` com `width != height`), que não é círculo;
  - a ogival tem dois centros, o que obriga dois arcos com trim por aresta;
  - o trim exige ângulos na unidade de ângulo do projeto (coleta 17 registra isso como relato de commit, não como norma). Esse ponto é uma fonte de erro que a polilinha não tem.
- **`IFCINDEXEDPOLYCURVE`**: mesma geometria que `IFCPOLYLINE` com índices extras. Sem ganho aqui, porque não há pontos reutilizados.

A polilinha é a mais simples, tem um caminho só para as cinco formas e já é o padrão do próprio `topProfileSolid` em `ifcExport.ts`. O custo é aproximação: para um vão redondo de 1 m, a corda de 1 mm dá cerca de 25 segmentos no arco pleno.

**[I] Não validado:** a representação de arco por `IFCTRIMMEDCURVE`/`IFCCIRCLE` não foi testada em visualizador. Quando houver, dá para trocar só o miolo de `addOpeningProfile` (linhas do perfil) sem mudar o contrato. Só vale a troca se a polilinha causar problema de precisão ou de tamanho de arquivo.

## 3. Geometria do vazio e contrato de colocação

- Perfil no plano local: **x** ao longo da parede, **y local = Z do mundo** (o perfil cresce para cima). Isso sai de `Z × X = Y` com eixo local `-Y` do mundo e `X` local = X do mundo. **[V]** pelo produto vetorial; **[I]** na renderização, não conferida no visualizador.
- Extrusão ao longo do eixo local Z (= `-Y` do mundo), de `y = +half` até `y = -half`, com `half = espessura / 2 + folga`. A espessura fica centrada em y = 0.
- **Folga por face: 1 cm** (`MARGEM_FACE`). É o mesmo valor do cortador de `ifcExport.ts` (`rectOf(roughWidth, thickness + 0.02)`, linha 215), que evita faces coplanares no CSG do web-ifc (comentário na linha 214). **[V]**
- Quem chama fornece a colocação (`placement`): eixo X ao longo da parede, Z para cima e **origem na base do vão (peitoril)**. O `ifcExport.ts` hoje coloca o vazio retangular em `roughBottomZ` (vão bruto), não no peitoril. Ao conectar, usar o peitoril do vão e passar a altura do perfil, ou decidir explicitamente que o perfil é o do vão bruto.

## 4. Verificação

Testes (`npx vitest run packages/io/src/ifc/ifcOpeningProfile.test.ts`): **18 passando.**

- rect 1 × 2 com parede de 0,2: entidades esperadas (perfil, sólido, representação, elemento), profundidade `0.220000` (espessura + 2 cm), anel exato `(0.5,0) (0.5,2) (-0.5,2) (-0.5,0) (0.5,0)`, `.OPENING.`, colocação e representação referenciadas;
- GlobalId do elemento com 22 caracteres;
- para as cinco formas: anel fechado (último = primeiro), número de vértices distintos igual ao de `outline()`, área com sinal positiva (anti-horário), topo do contorno igual à altura dentro da tolerância de 1 mm;
- círculo de diâmetro 1: área da polilinha a menos de 0,005 m² da área exata (π/4);
- **IDs consistentes**: ids definidos sem repetição e todo `#n` referenciado existe;
- determinismo: mesma entrada, mesmo texto;
- margem zero: profundidade igual à espessura;
- erros: forma inválida, espessura zero e folga negativa lançam erro sem escrever linhas.

Outras checagens:

- `npx eslint` nos dois arquivos: código de saída 0.
- `npx tsc -p tsconfig.json --noEmit` (projeto inteiro, inclui `packages/io/src`): código de saída 0, zero erros.

Dois erros de teste foram corrigidos durante a verificação: regex de coordenadas e sufixo esperado de `args` (que vem sem o parêntese externo). Ambos eram do teste, não do módulo.

## 5. Desvios e pendências

1. **Import direto do código-fonte do modelo.** `openingShape` não é reexportado por `packages/model/src/index.ts`, e io só importa `@hestia/model` pelo índice. O módulo importa por `../../../model/src/openingShape.ts`. A checagem de fronteira (`scripts/check-boundaries.mjs`) só olha `@hestia/…`, então passa, mas isso burla o contrato do pacote. **Correção limpa:** uma linha `export * from './openingShape.ts';` no índice do modelo. Não foi feita porque o pedido proibia alterar arquivos existentes.
2. **Não conectado** ao `addOpenings` de `ifcExport.ts`. Continua usando o vazio retangular.
3. **[I] Visualizador:** nenhum arquivo gerado foi aberto em web-ifc ou IfcOpenShell. A validação de arco, de orientação e de furo no CSG fica para esse passo.
4. Em `ifcExport.ts` a extrusão do vazio fica dentro da própria parede. Ao conectar, confirmar que o vazio novo não corta além das faces por causa da folga de 1 cm.

## 6. Como usar (quando conectar)

```ts
const ids = addOpeningProfile(w, ctx, placementDoVazio, `void:${openingId}`, t.name, shape, { thickness: wallThickness });
```

Onde `shape` é o `OpeningShape` do vão, `placementDoVazio` um `localPlacement` no peitoril com eixo X da parede, e `ctx` o contexto geométrico do `exportIfc`.
