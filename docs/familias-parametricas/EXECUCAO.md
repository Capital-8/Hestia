# Execução por subagentes (Haiku primeiro, Sonnet quando preciso)

Quem orquestra é a sessão principal (este agente). Ela cria o prompt, integra, roda o portão, atualiza `ESTADO.md`, faz **commit e push a cada ficha integrada**. Os executores só escrevem código dentro do worktree deles.

## Regra de modelo
| Modelo | Quando | Esforço |
|---|---|---|
| **Haiku** (padrão, 39 fichas) | Ficha com arquivos nomeados, casos numéricos, padrão vizinho para imitar: validação, resolução, operações puras, malhas simples, render com gancho já existente, UI de formulário, famílias da biblioteca, E2E | médio |
| **Sonnet** (12 fichas: A4, A6, B1, B3, B4, C3, C5, C6, D4, F4, H3, F-CSG) | Geometria 3D densa (arco tangente, varredura, interseção malha × plano, silhueta), estado compartilhado (esquema, comandos, colaboração), ferramenta interativa, norma com cálculo | médio |
Escalada: Haiku devolvido **2 vezes** na mesma ficha → Sonnet; Sonnet devolvido 1 vez → eu divido a ficha em duas menores (registre em `ESTADO.md`). Haiku que passa de primeira em 3 fichas seguidas do mesmo tipo mantém; Sonnet só entra onde a tabela diz ou por escalada. Teste cego sempre Haiku.

## Como lançar uma ficha
Ferramenta `Agent` com `subagent_type: "general-purpose"`, `model: "haiku"` (ou `"sonnet"`), `isolation: "worktree"`, `run_in_background: true`. Prompt (substitua `<ID>` e `<MODELO>`; é curto de propósito, o conteúdo está na ficha):

```
Você é o executor da ficha <ID> do projeto Hestia (criador de famílias paramétricas, ADR 0061).
Leia, nesta ordem e só estes: docs/familias-parametricas/REGRAS.md, docs/familias-parametricas/fichas/<ID>.md,
as seções do docs/familias-parametricas/CONTRATO.md que a ficha cita. Depois execute a ficha.
PRIMEIRO: o worktree pode nascer numa base antiga; rode `git merge --ff-only claude/lucid-euler-ddb7j6` (branch local) e confirme que docs/familias-parametricas/fichas/<ID>.md existe.
Passo obrigatório: cp -a /home/user/Hestia/node_modules ./node_modules (veja REGRAS.md §3).
Trabalhe só neste worktree; commite o que fizer (a branch do worktree é a sua entrega); não faça push.
Termine com o relatório de REGRAS.md §7. Mensagens de commit terminam com:
Co-Authored-By: Claude <MODELO> <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L8s76xWiiqt8RPnBATunB6
```
- **Paralelismo:** até 4 executores por vez, só de fichas da mesma onda **sem arquivo em comum** (a lista de permitidos mostra). Ficha cego roda ao lado da sua implementação mas **a partir de um commit sem a implementação** (lance o cego primeiro, ou antes de integrar a implementação), para o executor não enxergar o código.
- **Economia:** não peça análise geral do repositório ao executor; a ficha já aponta os arquivos. Não lance fichas "para ver o que dá". Releia o relatório, não o diff inteiro, antes de rodar o portão.

## Integração (a cada ficha que volta)
1. O resultado do `Agent` traz o worktree e a branch. No worktree da ficha: `node docs/familias-parametricas/portao.mjs <ID>` (escopo de arquivos, tsc, eslint sem avisos, testes da ficha, fronteiras). Linhas de "Arquivos permitidos" sem caminho (ex.: "testes correspondentes") entram com `--extra`.
2. Aprovado: na branch de integração `claude/lucid-euler-ddb7j6`, `git merge --no-ff <branch-da-ficha> -m "merge(familias): <ID> …"` (com as linhas de atribuição). Conflito em ponto de junção: resolva mantendo as duas linhas aditivas.
3. Já mesclado, rode no checkout principal: `npx tsc -p tsconfig.json --noEmit`, `npx vitest run packages/model/src/familia packages/engine/src/componentes` (e o pacote tocado), `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`. Verde ⇒ atualize `ESTADO.md` (estado, commit, calibração) e **`git push -u origin claude/lucid-euler-ddb7j6`** (até 4 tentativas com espera 2 s, 4 s, 8 s, 16 s).
4. Reprovado: devolva ao MESMO executor com `SendMessage` (a saída do portão, só as linhas que falharam) — conta como devolução. Duas devoluções ⇒ escalada.
5. Testes cegos: depois de A3/A4/A5/A6/C4 mescladas, rode os `*.cego.test.ts` contra elas. Falha = implementação e teste divergem do contrato: **o contrato decide**; corrija o lado errado e registre a decisão no `ESTADO.md` e no `CONTRATO.md`. Ambiguidade (`it.skip`): decida, registre no CONTRATO e ative o teste.
6. Fim de cada onda: suíte ampliada (`npx vitest run packages apps/web/src/ui/familia apps/web/src/editor/biblioteca`), `npm run lint`, nota de onda no `ESTADO.md`, push. Fichas de interface (B7, C2, D3, D4, G1 a G3, H1) ainda exigem o **roteiro no navegador** (servidor `vite --port 5199`), conferência das capturas por olho e zero erro de console antes de mesclar.

## Segurança do trabalho (fim de sessão)
- Nada fica só no worktree: o orquestrador faz push da branch de integração depois de CADA ficha integrada e antes de lançar a próxima leva.
- Worktrees de fichas em curso guardam trabalho só localmente; ao encerrar a sessão (ou se o contêiner for reciclado), as fichas "em curso" voltam a `pendente` no `ESTADO.md` (o trabalho parcial se perde e a ficha reinicia; fichas são pequenas de propósito). Se um executor terminou e o portão ainda não rodou, integre antes de encerrar.
- Nunca faça push em outra branch. Nunca abra PR sem o dono pedir.

## Retomada em sessão nova
1. `git fetch origin claude/lucid-euler-ddb7j6 && git checkout claude/lucid-euler-ddb7j6`; `npm ci --ignore-scripts` (os links `@hestia/*` ficam relativos).
2. Leia `docs/decisoes/0061-…md`, `docs/familias-parametricas/ESTADO.md`, `CONTRATO.md`, `REGRAS.md` (esta ordem).
3. Rode `npx tsc -p tsconfig.json --noEmit` e `npx vitest run packages/model/src/familia` para confirmar o verde de partida.
4. Pegue a menor onda com fichas `pendente` cujas dependências estão `integrada` e lance até 4 (regra de paralelismo acima).

## Pontos delicados já conhecidos
- `npm ci` leva ~1,5 min; `tsc` do projeto inteiro ~1 min; por isso o `cp -a` do `node_modules` e rodar vitest só nos arquivos tocados.
- `regras-gerais.md` diz "não incremente `SCHEMA_VERSION`": a ficha B1 é a exceção (aprovada pelo dono no plano). A ficha A9 sobe `FAMILIA_VERSAO`.
- Teste de snapshot da biblioteca (A7) deve ser gerado ANTES de editar `resolver.ts`.
- O kernel Rust é opcional (H3). Nada aqui exige `cargo`.
