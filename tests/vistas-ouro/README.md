# Ouro das vistas de planta

Rede de segurança da refatoração "vistas de planta como entidade" (`docs/vistas/PLANO-MESTRE.md`, seção 5). Grava a saída
do programa antes da refatoração e compara depois de cada fase: desenho da planta, DXF, pranchas, seleção, ocultos,
avisos de intervalo de vista e quantitativos.

## Como rodar

```bash
npm run test:vistas-ouro
```

Compara com `ouro/`. Se algo mudou, a falha diz qual projeto, qual vista, qual saída e as primeiras linhas divergentes.
Não faz parte do `npm test` (o arquivo é `*.spec.ts`, fora do `include` padrão); tem config própria
(`vitest.vistas-ouro.config.ts`) e leva cerca de 20 s.

## Como regravar

```bash
npm run test:vistas-ouro -- --gravar
# equivalente: VISTAS_OURO_GRAVAR=1 npm run test:vistas-ouro
```

**Regra: não regrave para fazer passar.** Diferença fora da lista prevista no plano (Fase 3) é defeito do código, não do
ouro. Regravar só na Fase 0 e, na Fase 3, para as diferenças previstas, conferidas uma a uma.

## O que tem aqui

- `projetos/*.json`: os oito casos do plano (casa de vários níveis; anotações em níveis; área que herda; área com
  anotações próprias e com `annotations: {}`; ocultos e `roofHidden`; intervalo e gráficos fora do padrão; pranchas;
  arquivo legado no esquema 6). São gerados por `scripts/vistas-ouro-projetos.mts` a partir de `construtores/`, mas o
  **JSON é a fonte**: não regere os projetos sem motivo, porque isso muda as entradas do ouro.
- `adaptador.ts`: **único** arquivo que conhece a forma interna do projeto e a API de render, DXF, seleção e
  quantitativos. Abre os JSON pela função de migração de produção. É o único ponto a reescrever quando a API mudar.
- `serializar.ts`, `comparar.ts`, `ouro.spec.ts`: só texto e chaves lógicas; não conhecem o projeto.
- `ouro/<projeto>/<chave>.<saída>.txt`: o ouro gravado. A chave lógica da vista sobrevive à mudança de esquema:
  `floor_<levelId>`, `roof_<levelId>`, `area_<areaPlanId>`, `sheet_<sheetId>` (e `projeto` para os quantitativos).

## Saídas por vista

| Saída | Vistas | Gerada por |
|---|---|---|
| `lista` | floor, roof, area | `planFrameUpdateOf(...).geometry()` + `resolverZoom` |
| `dxf` | floor, area, sheet | `planDxf`, `areaPlanDxf`, `sheetDxf` |
| `prancha` | sheet | `buildSheetDrawList` |
| `selecao` | floor, roof, area | `SelectTool` (clique numa grade de pontos e em pontos do conteúdo) |
| `ocultos` | floor, roof, area | `visibilityOf` e `planViewOf(...).hidden` |
| `avisos` | floor, area | `viewRangeWarnings` |
| `quantitativos` | projeto, area | `quantifyLevel`, `build*Schedule`, `areaTableRows`, `areaLegendRows` |

Números saem arredondados a 6 casas, com chaves em ordem alfabética: nada de data, id aleatório ou ordem instável.
A planta de cobertura não tem DXF no programa (não existe exportação), por isso não há saída `dxf` para `roof`.
