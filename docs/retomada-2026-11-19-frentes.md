# Frentes enviadas como backup — 2026-11-19

Cada branch local foi publicada como `backup/2026-11-19-<nome-original>` (as originais no GitHub não foram alteradas). Para retomar: `git fetch origin` e `git switch -c <nome> origin/backup/2026-11-19-<nome>`.

| Branch original | Último commit |
|---|---|
| `feat/0.2.5-corte-aterro-secoes` | fd7c9550 feat(secoes): mapa de corte e aterro no corte e na elevacao |
| `feat/0.2.5-malha-terreno` | 914b85b0 Terreno: alcance do talude sequencial (talude sobre talude), aviso 7 no TS, fuzz de curvas suavizadas |
| `feat/0.2.5-mapa-corte-aterro` | c0d0a828 fix(terreno): mapa de corte e aterro exato na linha de zero, so dentro de E |
| `feat/0.2.5-pasta-projeto` | 9c7b45a0 fix(i18n): aspas em textos FR/IT da biblioteca que quebravam o dicionario |
| `feat/0.2.5-pranchas` | ce791860 test(pranchas): bateria de estabilidade com projetos grandes (gerador, suite media e perf grande) |
| `feat/0.2.5-snap-curvas` | 992a1aad test(terreno): ajusta expectativas do snap nas curvas (grade desligada por padrao) |
| `feat/0.2.5-suavizar` | b11a499a wip(suavizar): servico TS e UI do Editar tipo em andamento, sem teste (ver docs/retomada-0.2.5.md) |
| `feat/0.2.5-telhado` | 63cbb2ff fix(3d-telhado): emenda entre aguas robusta, solda em T e descarte de triangulos degenerados |
| `feat/0.2.5-telhado-parede` | 333169a7 feat(telhado): topo da parede cortado pelo telhado em toda a espessura e oferta de anexar ao criar |
| `feat/marca-corte-bolha-prancha` | bc0244e9 Marca de corte com bolha, bandeira tangente e número da prancha; novo ícone da ferramenta (v0.2.0) |
| `feat/sobre-atualizacao` | c77d0232 0.2.1: biblioteca de projetos em pasta, tela inicial e 7 idiomas |
| `feat/terreno-tipo` | ea30b724 feat(ui): Editar tipo do terreno, seletor no topo das propriedades, textos nos sete idiomas e decisã |
| `fix/3d-troca-projeto` | da39e6ce 3d: descarta a montagem ao carregar outro projeto |
| `integracao/0.2.5` | 93d1e651 test: avisos do terreno com o aviso 7 e TerrainTypeDialog classificado; retomada com o resultado da s |
| `materiais/abas` | a0bd3827 feat(model): blocos opcionais do Material e materialEfetivo (decisao 0056) |
| `materiais/abas-main` | c7aee6b6 wip(texturas): interface Texturas online e gerador do catalogo (incompleto, agentes interrompidos) |
| `materiais/p2-dialogo` | c516a1ab feat(web): navegador de materiais com prévia fixa e abas |
| `materiais/p3-planta` | 3404ea1c refactor(render): decisao unica de cor e padrao do material em planta e corte (decisao 0056) |
| `vistas/base` | 006fcb3c wip(face-paint): motor Rust/TS de pintura de faces, planificacao 2D, extrusoes/ripados 3D e documento |
| `vistas/f2a-1` | 6ddfffca fix(vistas): runner do ouro funciona no Windows e ouro fica em LF |
| `vistas/f2a-2` | 8c31afc8 wip(vistas): etapa 2a-2 interrompida - vista ativa nas ferramentas e no editor (nao revisado) |
| `vistas/f2b` | 4ffa11a9 fix(vistas): cobertura nao e fonte de prancha por comando; perimetro acompanha planViewId; testes de  |
| `vistas/f3-e` | 9f80ed47 test(vistas): regrava ouro 03 e 04 apos auditoria da raia E (etiquetas do nivel copiadas para as area |
| `vistas/f3-h` | 6b961c80 test(vistas): regrava as 5 selecoes do ouro apos auditoria (item nao visivel deixa de ser selecionave |
| `vistas/f3-i` | 4b5a8fab fix(vistas): contexto de cotas refaz o conjunto de ocultos ao trocar de vista do mesmo nivel |
| `vistas/f3-j` | 38c8cbef Merge vistas/f3-h em vistas/f3-j (traz o ouro regravado das selecoes) |
| `vistas/f3-k1` | 325dffd0 chore(vistas): e2e planta-cobertura sem planKind e comentarios atualizados |
| `vistas/f3-k2` | 1dc30083 fix(vistas): viewScale le a escala grafica da vista ativa |
| `vistas/f4-0a` | 67c08ff7 test(vistas): migracao 24 para 25 nos projetos do ouro, showRoofOnTop, prefixo pvc_ e import IFC anti |
| `vistas/f4-0b` | fdf6649e wip(vistas): raia 0b interrompida pelo limite de uso - roofPlanMode vem de showRoofOnTop, viewId e fo |
| `vistas/f4-0e` | 8da774b4 test(vistas): adaptador, auditoria e casos do ouro leem a cobertura pela forma nova (legacyRoofViewId |
| `wip/vistas-base-2026-11-18` | 2d220528 wip(vistas): trabalho nao commitado do vistas/base em 18/11/2026 (pintura de face e demais alteracoes |
| `worktree-agent-a17f7d609ff8a1858` | 78afa83f Merge pull request #26 from engdennylsonsantos-cloud/release/0.2.4 |
| `worktree-agent-a2ded841ae5915f5e` | 78afa83f Merge pull request #26 from engdennylsonsantos-cloud/release/0.2.4 |
| `worktree-agent-a334f666ec09dd651` | 78afa83f Merge pull request #26 from engdennylsonsantos-cloud/release/0.2.4 |
| `worktree-agent-a3bfb8e80fe0a8a95` | 78afa83f Merge pull request #26 from engdennylsonsantos-cloud/release/0.2.4 |
| `worktree-agent-a59f21fe3d70fe3eb` | 78afa83f Merge pull request #26 from engdennylsonsantos-cloud/release/0.2.4 |
| `worktree-agent-aa6afe99589fc994e` | 78afa83f Merge pull request #26 from engdennylsonsantos-cloud/release/0.2.4 |
| `worktree-agent-ad7f478d3041e7aa5` | 78afa83f Merge pull request #26 from engdennylsonsantos-cloud/release/0.2.4 |
| `worktree-agent-ae39efeaad6b8f8a2` | 78afa83f Merge pull request #26 from engdennylsonsantos-cloud/release/0.2.4 |
| `worktree-agent-aed69df5eba1a41c1` | 78afa83f Merge pull request #26 from engdennylsonsantos-cloud/release/0.2.4 |
| `worktree-agent-af54dd7e689b557fc` | 78afa83f Merge pull request #26 from engdennylsonsantos-cloud/release/0.2.4 |

Também: `backup/2026-11-19-stash-antes-das-vistas` é o `stash` da main ("antes-das-vistas").

**Não enviado:** alterações sem commit nos worktrees `Hestia-0.2.5`, `Hestia-p2`, `Hestia-terreno-tipo`, `Hestia-w-mapa` e `Hestia-w-pasta`. São só arquivos `.snap` de testes (provável regeneração) e uma pasta `node_modules_parcial/`, sem código novo. Os worktrees em `C:/Users/User/...` não existem mais nesta máquina.
