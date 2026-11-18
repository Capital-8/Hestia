# Regras para o executor (DeepSeek v4.1 flash) — editor de famílias

Valem junto com `docs/handoff/regras-gerais.md`. Se uma regra daqui conflitar com aquela, vale esta.

1. Você executa UMA ficha, no worktree em que foi lançado. Nunca escreva fora dele. Nada de `git push`, `git checkout`/`switch` de outras branches, `git reset --hard`, `git stash`, `git rebase`.
2. **Só edite os arquivos listados em "Arquivos permitidos" da ficha.** Arquivos de teste (`*.test.ts`), `tipos.ts`, `expressao.ts`, `exemplos.ts`, `index.ts` e qualquer outro NÃO listado são do orquestrador: não os altere, nem para "consertar" um teste. Se achar que um teste está errado ou ambíguo, PARE, não edite e descreva o problema no relatório.
3. Sem dependência nova, sem `console.log`, sem arquivo de depuração, sem `any`, sem `// @ts-ignore`, sem `eslint-disable`. Textos e comentários em português. Máximo de 420 linhas por arquivo (o eslint reprova): se crescer, divida em arquivos novos com o prefixo permitido pela ficha.
4. Rode e deixe verde antes de terminar: `npx tsc -p tsconfig.json --noEmit`, `npx eslint <seus arquivos>`, `npx vitest run <arquivo de teste da ficha>` e `node scripts/check-boundaries.mjs`. Se algum falhar, corrija o código (nunca o teste).
5. Commits pequenos em português (`feat(familia): …`), sem `--no-verify`. Termine com tudo commitado.
6. Não mexa em `crates/`, `*.wasm`, `resolve.ts`, `wallZ.ts`, camadas do motor, esquema `cena-v*.json` nem em `@hestia/geom`.
7. Relatório final em português, curto: arquivos criados ou alterados, resultado dos 4 comandos (cole a última linha de cada), decisões que você tomou onde a ficha deixou margem, e o que NÃO conseguiu fazer. Não diga que algo passou se você não rodou.
8. Nunca invente que um teste passa. O orquestrador roda os mesmos comandos depois de você.
9. Ambiente: Windows com Git Bash. Use barras `/` nos caminhos. Rode os testes com `npx vitest run <arquivo>`; não use `timeout` curto.
10. Estilo: siga o dos arquivos vizinhos (`expressao.ts` e `history.ts` são bons modelos): funções pequenas, nomes em português, tipos explícitos nos retornos exportados, `noUncheckedIndexedAccess` ligado (use `!` só quando o índice é garantido).
