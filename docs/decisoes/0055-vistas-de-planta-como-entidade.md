# Decisão 0055 — Vistas de planta como entidade (`PlanView`)

Data: 2026-11-10. Status: proposta. O plano não registra aprovação do dono. Plano de execução: [`docs/vistas/PLANO-MESTRE.md`](../vistas/PLANO-MESTRE.md). Este registro fixa a decisão; a ordem de trabalho, as raias e a coordenação ficam no plano.

**1. Contexto (como é hoje, fatos verificados no código).**
- A planta de piso é o próprio nível. `Level` (`packages/model/src/types.ts`) guarda o intervalo de vista (`viewRange`), os gráficos (`graphics`), os ocultos (`hidden`, `roofHidden`) e as anotações (cotas, textos, linhas e regiões de detalhe, etiquetas) e as linhas de separação de ambiente (`roomSeparators`).
- A planta de cobertura é uma variante pendurada no nível.
- A planta de área é uma entidade separada, `AreaPlan` (`packages/model/src/areaPlan.ts`), em `Project.areaPlans`, com gráficos próprios (`AreaPlanGraphics`), etiquetas de ambiente, legenda, tabela e anotações.
- Herança de anotações: `AreaPlan.annotations === undefined` quer dizer "mostra as anotações do nível" (`planOwnsAnnotations`). Definido, mesmo vazio, é conjunto próprio.
- `packages/model/src/annotations.ts` já tem `AnnotationScope` com três implementações (`levelScope`, `planScope`, `sectionScope`); é o ponto de partida da generalização.
- A vista é identificada de três formas diferentes: `ViewHiddenTarget` (`types.ts`), `SheetViewSource` (`sheet.ts`, sem fonte de cobertura) e `OpenView` (`apps/web/src/editor/openViews.ts`).
- A vista ativa da interface são campos soltos no estado (`view`, `levelId`, `planKind`, `areaPlanId`, `sectionId`, `sheetId`).
- As ferramentas da planta de área são limitadas por `AREA_PLAN_TOOLS` (`apps/web/src/editor/controller.ts`), consultada também em `apps/web/src/ui/ribbon/parts.tsx`.
- Cotas e etiquetas referenciam o elemento pelo id (`Dimension.refs`, `ElementTag.hostId`), não pelo nível. Trocar o dono da anotação não quebra o vínculo.
- O kernel Rust (`crates/`) não tem nenhum parâmetro de vista e deve continuar assim.
- Alcance: 27 arquivos de produção em `apps/web/src/editor`, 24 em `apps/web/src/ui`, 20 em `packages/render`, 19 em `packages/model`, 14 em `packages/tools`, mais `packages/io` e `packages/engine`; 43 testes.

**2. Decisão.**

2.1 *Entidade.* Uma `PlanView` (`packages/model/src/planView.ts`) é uma vista de planta, e um nível pode ter várias. O `kind` é `floor`, `roof`, `area` ou `ceiling`. `ceiling` entra no tipo já, mas só ganha comportamento na Fase 4. `structural` não entra, porque o modelo não tem pilar nem viga. `Project.planViews: PlanView[]`.
- `id`, `name`, `levelId`, `kind`.
- `viewRange`, sempre presente, com cotas relativas à elevação do nível.
- `graphics` e `hidden`, opcionais (ausente = padrão do tipo de vista).
- `annotations`, sempre própria (`PlanAnnotations`: cotas, textos, linhas e regiões de detalhe, etiquetas).
- `area`, só quando `kind === 'area'`: `schemeId`, `scale`, `graphics` (`AreaPlanGraphics`), `tags` (`RoomTag[]`), `legend` e `table`.

2.2 *O que fica no nível.* `Level` mantém só `id`, `name`, `elevation` e `roomSeparators`. A linha de separação é modelo: muda a área do ambiente em todas as vistas.

2.3 *Vistas principais.* Todo nível tem exatamente uma vista `floor` e uma `roof` principais, criadas junto com o nível, o que preserva o comportamento de hoje. Remover um nível remove suas vistas e, em cascata, o que já é removido hoje (viewports de prancha, abas).

2.4 *Ids determinísticos na migração.* Piso `pv_<levelId>`, cobertura `pvr_<levelId>`. A vista de área mantém o id do `AreaPlan`. Vistas criadas depois usam `newId`.

2.5 *Anotações próprias.* Não existe herança entre vistas. Cota, texto, linha, região de detalhe e etiqueta pertencem a uma vista só e nunca aparecem em outra.

2.6 *API única de leitura* (`planView.ts`, exportada pelo `index.ts`): `planViewsOf`, `planViewOf`, `planViewsOfLevel`, `mainPlanViewOf`, `viewRangeOf`, `viewGraphicsOf` (já resolvido contra o padrão), `viewHiddenOf`, `viewAnnotationsOf` e `viewProfileOf`. Fora de `planView.ts`, `annotations.ts`, `migrate.ts` e dos comandos de vista, ninguém lê `viewRange`, `graphics`, `hidden`, `roofHidden`, as cinco listas de anotação do nível nem `areaPlans`. Na Fase 1, `planViewsOf` devolve uma projeção montada a partir de `levels` e `areaPlans`, estável por referência (memorizada por identidade), para seletores e caches não refazerem tudo a cada leitura. Na Fase 2 a leitura passa a ser direta.

2.7 *Escrita.* Os comandos de anotação recebem `viewId` (planta) ou `sectionId` (corte). Entram `updatePlanView { viewId, patch }`, que substitui os comandos que hoje alteram intervalo, gráficos e ocultos do nível (e `updateAreaPlan` no que for comum), `addPlanView` e `removePlanView`, que substituem `addAreaPlan` e `removeAreaPlan`. Comando exposto a `plugin-api` mantém o nome antigo como apelido que traduz para o novo. Desfazer e refazer continuam valendo para todos os comandos tocados.

2.8 *Forma única de identificar a vista* (depois da Fase 2):

| Lugar | Hoje | Depois |
|---|---|---|
| `ViewHiddenTarget` | `{plan, levelId}`, `{roof, levelId}`, `{area, planId}` | `{kind:'plan', viewId}` |
| `SheetViewSource` | `{plan, levelId}`, `{areaPlan, planId}` | `{kind:'plan', viewId}` (`areaTable` continua) |
| `OpenView` | `{plan, levelId, planKind?, areaPlanId?}` | `{kind:'plan', viewId}` |
| estado da interface | `levelId` + `planKind` + `areaPlanId` | `planViewId`; nível e tipo são derivados |

A sessão salva no navegador (`sessao.ts`) lê o formato antigo e converte, sem erro e sem perder abas.

2.9 *Visibilidade: a regra única, na ordem do Revit.* Uma função única, `visibleInView`, em `packages/model`, é usada por desenho, seleção, captura, DXF e prancha. Um item aparece se passar por todas as etapas, nesta ordem:
1. pertence ao alcance da vista (nível e intervalo; o recorte entra na Fase 4);
2. a categoria existe naquele tipo de vista (tabela 2.10);
3. a categoria não está em `hidden.categories` e a camada do perfil está ligada;
4. filtros (Fase 4): o primeiro filtro que casa e desliga a visibilidade oculta o item;
5. o elemento não está em `hidden.elements`;
6. ocultar ou isolar temporário da sessão: não é salvo e não vale para prancha, PDF nem DXF;
7. anotação presa a elemento: a cota some se qualquer elemento de `refs` não estiver visível na vista; a etiqueta some se o `hostId` não estiver (Fase 3).

Regras complementares: "revelar ocultos" mostra o que as etapas 3 e 5 escondem, com destaque, e permite reexibir; não se captura nem se seleciona o que não está visível; cota nova só referencia elemento visível; a prancha mostra a vista exatamente como ela é, sem ocultação por viewport; elemento de modelo criado numa categoria oculta na vista é criado, e a interface avisa.

2.10 *Tabela por tipo de vista* (`packages/model/src/planViewKinds.ts`, única fonte de intervalo padrão, camadas e ferramentas):

| Tipo | Direção | Intervalo padrão | Camadas padrão | Ferramentas |
|---|---|---|---|---|
| `floor` | para baixo | o padrão atual de `viewRange.ts` | `FLOOR_PROFILE_LAYERS` atual | todas |
| `roof` | para baixo | o que a cobertura usa hoje | o que ela mostra hoje | as que ela aceita hoje |
| `area` | para baixo | o do nível | `areaLayersOf(DEFAULT_AREA_GRAPHICS)` atual | Fases 1 e 2: `AREA_PLAN_TOOLS` atual; Fase 3: todas |
| `ceiling` | para cima | corte de 2,30 m (Fase 4) | forros, paredes e janelas cortadas; sem portas, pisos e mobiliário (Fase 4) | todas, menos ambiente e separação |

Função `toolAllowedInView(kind, toolId)`, que depois da Fase 3 é a única consulta de permissão de ferramenta. Ferramenta de ambiente, de separação de ambiente e de etiqueta de ambiente não valem em `roof` nem em `ceiling`. Os valores "o que usa hoje" são transcritos do código, com teste que prova a igualdade.

**3. Regras invioláveis.**
1. A vista nunca entra no kernel: nada em `crates/`, na cena enviada ao kernel ou em `packages/geom`. `git diff --stat` nesses caminhos fica vazio em todas as fases.
2. `SCHEMA_VERSION` e `migrate.ts` só mudam na Fase 2, por um único agente.
3. Cada raia toca somente nos arquivos do seu escopo. O que estiver fora volta ao coordenador.
4. Ninguém declara sucesso sem colar a saída de tipos, lint, testes e comparação de ouro.
5. O ouro não é atualizado para fazer passar. Diferença de ouro fora da lista da Fase 3 é defeito.
6. Sem pull request e sem merge em `main`. Só branches `vistas/*`.
7. Troca mecânica não decide. Se o arquivo exigir escolha que o exemplo não cobre, ele sobe para uma raia Sonnet.
8. Teste existente não é apagado nem enfraquecido para passar. Teste que cobria a gambiarra removida é reescrito para a regra nova, e isso é dito no relatório.

**4. Consequências.**
- *Migração de esquema 23 para 24 (Fase 2).* Cada nível gera `pv_` e `pvr_`. Cada `AreaPlan` vira vista `area` com o mesmo id. `Project.areaPlans` some e `Project.planViews` entra.
- *Fim da herança de anotações da planta de área.* Um `AreaPlan` com `annotations === undefined` recebe, na migração, uma cópia das anotações do nível, com id novo determinístico `<idOriginal>__<idDaVista>`. A cópia traz só as famílias que a planta mostra: cotas, se `showDimensions`; textos, detalhes e etiquetas, se `showAnnotations`. As famílias que a planta não mostra ficam vazias. Ids herdados que estão em `hidden.elements` da planta são trocados pelo id da cópia. A partir daí, editar as anotações do nível não altera a planta de área.
- *Ouro antes de tudo.* Antes de qualquer mudança, grava-se a saída atual de projetos de teste (desenho, DXF, prancha, seleção, avisos e quantitativos). Depois da Fase 2 a chave passa a ser o id da vista; o conteúdo comparado é o mesmo.
- *Mudanças de comportamento previstas, só na Fase 3:* (1) item não visível deixa de ser selecionável; (2) cota ou etiqueta cujo elemento está oculto na vista deixa de aparecer em desenho, DXF e prancha.
- *Gambiarras removidas na Fase 3:* `AREA_PLAN_TOOLS`, `areaPlanToolAllowed`, `roofHidden`, `planOwnsAnnotations`, cada `planKind === 'area'` restante e os dois caminhos de anotação. As buscas de conferência do plano (seção 8) devem sair limpas.
- *Plugins.* Comandos expostos a `plugin-api` mantêm o nome antigo como apelido.
- *Fase 1.* Não muda o arquivo salvo nem o comportamento. Só muda de onde o código lê e escreve.

**5. Fora desta decisão.**
- Fusão de `AreaPlanGraphics` em `ViewGraphics`: por ora fica sob `area`; a fusão é trabalho posterior.
- Planta estrutural: não entra.
- Fase 4, só com aceite do dono: duplicar vista, com e sem detalhamento; intervalo de vista editável por vista; modelos de vista; filtros (etapa 4 da visibilidade); vista filha com recorte e escala própria (o recorte entra na etapa 1); planta de forro (`ceiling`). Os campos novos (`templateId`, `crop`, `parentId`, filtros) exigem nova versão de esquema e serão detalhados quando a fase for aceita.

**6. Em aberto.**
- O intervalo e as camadas da cobertura (`roof`) e os valores "o que usa hoje" da tabela 2.10 não são fixados no plano. São transcritos do código na implementação, com teste de igualdade.
- A seção 1, item 6, do plano diz que as mudanças de comportamento estão só na Fase 3. Mas o fim da herança, na Fase 2, muda o comportamento de edições futuras da planta de área (ver a seção 4 desta decisão). Fica para o dono confirmar que é aceitável.
