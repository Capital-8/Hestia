# Guarda-corpo Fase 3a: nota de retomada (pausa do dono)

Estado: nada implementado em codigo; so leitura. Worktree `wt/gc-f3a`, branch `feat/gc-f3a` (de `origin/feat/gc-f2`).

Plano decidido (registrar na ADR 0055 §15 ao implementar):
- Novo `crates/geom-wasm/src/gc_caminho.rs` no lugar de `guarda_caminhos_gancho` (secoes_gc.rs; chamado em consultas.rs, CONSULTA_GUARDA_CAMINHOS). Manter `cena.gc.validar_referencias()?` no inicio; filtrar guardas por nivel (NIVEL_TODOS aceito).
- Saidas: `trechos` u32 [guarda, trecho, origem, n_nos, flags]; flags: bit0 curvo, bit1 fechado, bit2 soldado ao trecho anterior, bit3 lado direito. `nos` f64 xyz. Avisos: codigo 1 = gc-hospedeiro-descontinuo, 2 = gc-deslocamento-excede-largura; valores [medido, limite, x, y, z].
- Um trecho por componente (lance, patamar, caracol); continuidade por distancia em planta <= tol_juncao.
- Lance: concatenar curvas da borda (arcos por arco_amostra, tol_corda do tipo), s dos espelhos pelo ponto da borda mais proximo dos extremos do espelho; z linear entre primeiro e ultimo espelho (z1); cadeia cortada entre esses dois s; inverter cadeia se s_primeiro > s_ultimo.
- Patamar: anel sem as arestas de entrada (ultimo espelho do lance anterior / borda final da rampa) e saida (primeiro espelho seguinte); aresta ausente = a mais distante da conhecida; esquerda/direita pelo produto vetorial a partir da normal de entrada; z constante.
- Rampa: lado esquerdo/direito pelas bordas A-B e C-D, z0 a z1 linear.
- Manual: z = cota_base + dz; lado_desloc 0 esq, 1 dir, 2 centro; fechado liga o ultimo ao primeiro.
- Deslocamento: degrau = para dentro (+desloc), lateral = para fora; esquadria com limite 2,5x (chanfro acima); recusa se segmento inverter de sentido ou 2*desloc > largura (aviso 2). `inverter` inverte a ordem dos nos.
- Falta: gc_caminho.rs + testes cargo (reta, L, U, patamar de giro, caracol, rampa, manual, lado desligado, descontinuidade, deslocamento excessivo), `packages/engine/src/guardaCorpoRef/caminho.ts` + teste de paridade com `fixtureGuardaCorpo.ts`, ajustar `tests/kernel-gc2.wasm.test.ts` (hoje espera saidas vazias), `node scripts/build-wasm.mjs` e `--check`, ADR §15 (novo registro da 3a).
