# Retomada no computador local

Este arquivo diz onde o trabalho das "vistas de planta como entidade" está e como continuar fora da nuvem.
Atualize a seção "Onde estamos" a cada etapa integrada.

## Branches no GitHub
| Branch | O que é |
|---|---|
| `vistas/base` | Tronco do trabalho. Só recebe etapa revisada e com a verificação verde. É daqui que se continua. |
| `vistas/f2a-1` | Etapa 2a-1 em andamento (migração 23 → 24). **Ainda não integrada nem revisada.** |
| `vistas/plano-mestre` | Só o plano original. Pode ser apagado. |

`main` não foi tocado. Nenhum pull request foi aberto.

## Onde estamos
- **Fase 0 — concluída e integrada.** Ouro (`npm run test:vistas-ouro`), API `planView.ts`, decisão 0055.
- **Fase 1 — concluída e integrada.** Raias A, B, C, D, E, G. Verificação sobre `vistas/base`: tipos e lint sem
  erro, 884 arquivos / 9.729 testes, ouro idêntico.
- **Fase 2a-1 — em andamento** no branch `vistas/f2a-1` (4 commits: testes da migração, armazenamento em
  `Project.planViews` com fachadas invertidas, auditoria do ouro e ouro regravado, validação e IFC). O agente foi
  interrompido pelo limite de uso **antes de entregar o relatório e a verificação final**. Nada disso foi revisado.
- **Fase 2a-2, Fase 3 e fechamento — não iniciadas.**

## Como continuar no computador
```bash
git fetch origin
```
```bash
git checkout vistas/base
```
```bash
npm ci
```
Abra o Claude Code na pasta do repositório e peça:

> Leia `docs/vistas/RETOMADA.md`, `docs/vistas/PLANO-MESTRE.md` (inclusive a seção 10), `docs/vistas/FASE-2A.md`,
> `docs/vistas/REGRAS-RAIAS.md` e `docs/vistas/INSUMOS-FASE-3.md`. Continue como coordenador a partir de "Próximos
> passos" da retomada, usando subagentes Sonnet e Haiku.

## Próximos passos (em ordem)
1. **Terminar a 2a-1.** No branch `vistas/f2a-1`: conferir o que falta da "Etapa 2a-1" de `FASE-2A.md` contra os
   commits já feitos, concluir, e rodar a verificação:
   `npm run typecheck`, `npm run lint`, `npm run test:rapido`, `npm run test:vistas-ouro`,
   `git diff --stat vistas/base -- crates packages/geom` (vazio).
2. **Ponto de controle 1 (revisão forte, pelo modelo mais capaz).** Ler o diff de `packages/model/src/migrate*.ts`,
   `types.ts`, `planView.ts` e dos testes da migração. Conferir a tabela da auditoria do ouro
   (`tests/vistas-ouro/auditoria.ts`): só podem existir as diferenças D1, D2 e D3 de `FASE-2A.md`; "NÃO PREVISTA"
   tem de ser zero. Conferir que o ouro foi regravado **só** depois disso.
3. Integrar `vistas/f2a-1` em `vistas/base` (merge), rodar a verificação e enviar.
4. **Etapa 2a-2** de `FASE-2A.md` (a vista ativa chega às ferramentas e ao editor). Um agente Sonnet.
5. **Fase 2b + Fase 3** (seção 7 do plano e `INSUMOS-FASE-3.md`): forma única de identificar a vista
   (`OpenView`, estado, `SheetViewSource`, `ViewHiddenTarget`, `PlanInput` do render por `viewId`), função única
   de visibilidade, cota e etiqueta somem com o elemento oculto, planta de área aceita todas as ferramentas com
   aviso de criação em categoria oculta, e remoção das gambiarras (`AREA_PLAN_TOOLS`, `planKind`, fachadas antigas).
   O esquema 24 ainda não foi publicado: a migração 23 → 24 pode ser estendida nessas fases em vez de criar a 25.
6. **Fechamento:** `npm run test` completo, `npm run test:visual`, buscas 8.1 e 8.2 do plano, relatório em
   `docs/vistas/RELATORIO.md`, atualizar `docs/07-STATUS-V1.md`. Só então abrir pull request para `main`.

## Avisos práticos
- Os subagentes trabalham em `git worktree`. Worktree dentro da pasta do repositório faz o `npm run lint` da raiz
  acusar erros falsos: remova os worktrees concluídos (`git worktree remove <pasta>`) antes de rodar o lint na raiz.
- Cada worktree precisa do seu próprio `npm ci` (não use symlink de `node_modules`).
- `npm run test:rapido` leva cerca de 6 minutos; um teste de desempenho (`sectionSnapIndex.test.ts`) pode falhar
  com a máquina carregada e passa isolado.
- Nunca regrave o ouro para "fazer passar". As únicas regravações previstas estão em `FASE-2A.md` e na Fase 3 do
  plano, sempre depois de auditoria.
