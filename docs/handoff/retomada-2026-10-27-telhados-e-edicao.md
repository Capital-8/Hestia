# Retomada: telhados e ferramentas de edição (2026-10-27)

Documento de passagem. Branch de trabalho: `claude/eager-albattani-d9xyel` (no GitHub). Artefato de teste (versão 10): https://claude.ai/artifact/1g2X1e1KYR8pYdD7t2N3P4

## 1. Como esta branch foi montada

- Base: `ccr-25143eb2-08pwa4` (a branch de integração do dono, com desempenho 3D R1/A1, esquadrias v2 e o perímetro).
- Mesclados nela: `perim/integracao2` (perímetro, Aparar/Estender, Alinhar universal, snap de aberturas) e `perim/T1` (acabamento do telhado em planta).
- A `main` do repositório continua em 22/10 e não foi tocada.
- **Não mesclados** (continuam nas suas branches): GPU `gpu/a1b-opening`, `gpu/r2-visibility`, `gpu/r3-picking`, `gpu/r5-plan` (WIP, base antiga) e esquadrias v3 `feat/esquadrias-v3` (108 testes quebrados de propósito) — **atualização 2026-11-17: a v3 já está no `main` e a suíte de esquadrias passa**. Ver `HANDOFF-GPU-2026-10-26.md` e `docs/aberturas/HANDOFF-ESQUADRIAS-v3-2026-10-27.md` nas respectivas branches.

## 2. O que foi entregue nesta sessão

| Item | Resumo | Onde |
|---|---|---|
| Furo do esboço | Preenchimento laranja translúcido, sem hachura; token `sketchHole` (#e8890c claro, #ffb04d escuro) | `packages/render/src/plan/sketch.ts`, `types.ts` |
| Editar perímetro | Botão da faixa com ícone próprio `editperimeter` (L com lápis) e entrada no clique direito. Causa do clique direito: o `pointerdown` do menu ia ao canvas; corrigido em `PopupMenu.tsx`. Piso/laje vinculados às paredes são recusados já na abertura ("Use Desvincular") | `ui/Icon.tsx`, `ui/PopupMenu.tsx`, `editor/perimeterMode.ts` |
| Cancelar edição | Devolve a seleção de antes | `editor/perimeterMode.ts` (`selecaoAnterior`) |
| Faixa compacta | Botões pequenos só com ícone, 84 px de altura, sem rolagem lateral; o que não cabe vai para um botão suspenso ou "»" (`FitRow`, `fitMask` com prioridade). "Modificar" e a aba aberta têm prioridade. O painel do assunto (Editar perímetro) é o último a recolher | `ui/Ribbon.tsx`, `ui/ribbon/FitRow.tsx`, `fitCount.ts`, `panelPriority.ts`, `ribbon.css` |
| Barra de vista | Recolhe em "»" com popup, por prioridade | `ui/ViewControlBar.tsx`, `ribbon.css` |
| ViewCube | Cantos arredondados, degradê, sombra, anel de bússola N/L/S/O (norte = +Y), casinha. Rótulos ainda TOPO/FRENTE/DIREITA (o Revit usa SUPERIOR/FRONTAL) | `ui/ViewCube.tsx`, `ViewCubeRing.tsx`, `viewcube-ring.ts`, `styles.css` |
| Referências visuais | Regravadas (captura passou de 672 para 908 px), CPU e GPU, estáveis em duas execuções | `tests/e2e/baseline*` |

## 3. Estado da validação (2026-10-27)

- `npx vitest run --exclude "**/*perf.test.ts"`: 467 arquivos, 5383 testes verdes.
- `tsc` ok; fronteiras, paridade e densidade de propriedades ok; build ok.
- e2e verdes: `ribbon-compacto`, `vcb-compacto`, `viewcube-visual`, `editar-perimetro` (26 passos), `perimetro-modificar`, `telhados`.
- `npm run lint` falha só por `packages/model/src/.edit_room_sep.cjs` (script solto do dono, já vinha na `ccr`) e tem 2 avisos antigos (`OpeningFlipGrips.tsx`, `OpeningTempDims.tsx`). Perguntar ao dono se pode remover.
- `tests/e2e/escadas.mjs` falha (12 de 13): referência de 912 px e seletores da interface antiga. Parece anterior a esta sessão; **não foi confirmado na base**.
- A linha escondida de medição da faixa (`.fit-measure`) duplica as abas no DOM. Roteiros e2e devem usar `.rtab:visible`. Foi corrigido nos 5 que usavam `.rtab`.
- **Não conferido**: o telhado na casa de exemplo. A planta do Pavimento 2 do exemplo não mostra o telhado (ele fica acima do plano de corte e não há "Planta de cobertura" criada). As melhorias de telhado em planta só aparecem com o telhado cortado ou numa planta de cobertura; no 3D não mudou nada.

## 4. Pendências aceitas como estão

- **Forro**: sem "Editar perímetro" no clique direito, porque o forro não é desenhado na planta de piso e a planta de forro está "ainda não disponível". Pelo botão da faixa funciona. Resolver só junto com a planta de forro.
- **Download de arquivos no artefato** (DXF, IFC, PDF, `.hestia.json`): o visualizador não permite; o artefato precisaria declarar a capacidade `downloads`. Não feito.

## 5. Próxima rodada: o que o dono quer ver implementado

Pedido do dono (2026-10-27), com agentes Haiku 5.5 médio, **testando só ao final**:

1. **Arco real no telhado.** Hoje o arco vira vários lados curtos e os grips ficam só nos cantos. Plano: `Roof.edgeSag` por aresta (como o `sag` da parede); o motor divide em trechos só por dentro, antes do esqueleto (`packages/engine/src/roofSkeleton.ts`, `roofResolve`); planta desenha o arco, grips nos cantos e no meio do arco; recuperação em `perimeterArcFit.ts`. Migração de esquema v19 para v20.
2. **Cadeado do Alinhar** (restrição permanente) e **linhas de grade como referência.** A Grade não existe como elemento (botão "em breve" na aba Arquitetura): é um elemento novo (linha, bolha, nome, ferramenta, planta, snap). O cadeado: guardar o par de referências e reaplicar quando um dos elementos muda. Versão enxuta, sem cadeias.
3. **Remover os modos antigos** de criação de piso, laje, forro e telhado (`poly`, `rect`, `walls`, `room`, `paredes`, `perimetro`): classes, opções `floorMode`/`slabMode`/`ceilingMode`/`roofMode` e seletores. A lista de testes a migrar está em `docs/pendencias-perimetro.md` §4.
4. **Telhado em L com duas águas.** Hoje recusado (esqueleto não fecha, degrau de 0,60 m). Exige algoritmo novo (planos que se cortam, como no Revit). **Pode não ser viável** no motor atual; se não for, manter a recusa com a mensagem clara.
5. **Mansarda automática** (duas faixas de águas, íngreme no beiral e suave em cima, a partir do contorno; o preset de perfil `presetMansarda` já existe) e **seta de inclinação livre / águas livres** (`roofArrowTool.ts`, forma `free`).

### Divisão de trabalho proposta

- **Fase 0 (coordenador, ~15 min):** mudanças de modelo num lugar só: `edgeSag` no telhado, elemento Grade, cadeado, uma única migração para v20. Evita conflito em `types.ts` e `migrate.ts`.
- **Fase 1, em paralelo (4 agentes, arquivos que não se sobrepõem):**
  - A: arco real (modelo, contorno e planta).
  - B: remover modos antigos (ferramentas de piso, laje, forro, telhado e seus testes).
  - C: Grade (ferramenta, planta, snap).
  - D: mansarda, depois L com duas águas, depois seta livre. Num só agente, em sequência, porque os três mexem no esqueleto e nas águas.
- **Fase 2 (1 agente):** cadeado do Alinhar, depois da Grade.
- **Fase 3 (coordenador):** mesclar; lint, suíte completa, build, e2e; regravar referências visuais; roteiro de demonstração (criar telhado de 4 águas com furo e usar "Editar perímetro"); incluir no exemplo uma "Planta de cobertura"; atualizar o artefato.
- Estimativa: 3 a 4 horas de relógio. Manter ao menos `tsc` em cada agente (segundos) para pegar conflito cedo.

### Perguntas ainda sem resposta do dono

1. "Linhas de grade" é o elemento Grade do Revit (eixos com bolha e nome) ou só a grade de fundo da planta?
2. No telhado em L com duas águas, qual resultado ele espera? (um exemplo ou imagem do Revit ajuda)
3. A versão enxuta do cadeado serve?
4. Trocar os rótulos do cubo para SUPERIOR/FRONTAL?
5. Remover `packages/model/src/.edit_room_sep.cjs`?
6. Habilitar `downloads` no artefato?

## 6. Como retomar

```bash
git fetch origin && git checkout claude/eager-albattani-d9xyel && git pull
npm ci
npm run typecheck   # ou: npx tsc -p tsconfig.json --noEmit
npx vitest run --exclude "**/*perf.test.ts" --maxWorkers=4     # ~3 min
npm run build && npm run build:artifact                          # artefato em apps/web/dist/artifact.html
```

Dicas aprendidas com os subagentes:
- Os worktrees automáticos dos agentes (`isolation: worktree`) partiram de bases erradas (a `main` antiga ou outra). Crie o worktree você mesmo (`git worktree add -b h-X .claude/worktrees/X HEAD`, depois `npm ci`) e dê o caminho absoluto ao agente.
- O lint varre `.claude/worktrees/`; remova os worktrees (`git worktree remove --force`) antes de rodar `npm run lint`. Há uma linha local em `.git/info/exclude` para o git não reclamar de arquivos não rastreados.
- Cada agente deve receber os arquivos permitidos; os dois pontos em que isso causou atrito foram `PopupMenu.tsx` e `ViewControlBar.tsx`, fora do escopo inicial.
- Limite do repositório: 420 linhas por arquivo (ESLint `max-lines`); `controller.ts` e `perimeterTool.ts` estão no limite.
