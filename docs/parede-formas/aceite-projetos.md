# Aceite com os projetos do dono (J5, gerado por `projetosDoDono.test.ts`)

Projeto principal "Projeto sem título", 10 nós de junção entre duas paredes. Medido nos sólidos reais (`wallLayerSolid`), sem as aberturas, tampas de cada parede contra a seção da vizinha em z = 0,01, 0,497·H e H−0,01 (o meio não pode ser H/2: é cota de nível da malha e a aresta no plano some da seção). Valores em milímetros, "fresta / sobreposição".

Nós viáveis: 7; inviáveis (aviso): 3; pior valor nos viáveis, camadas de 5 mm ou mais: 0.019 mm (limite 1 mm). As colunas z incluem a tinta de 2 mm (ver "Defeitos" no ESTADO.md, J5).

| Nó | Tipos | Tilts (°) | z baixo (fresta/sobrep., mm) | z meio | z topo | Avisos | Status |
|---|---|---|---|---|---|---|---|
| 784e0.b-1d2a0.a | reta × reta | 15/15 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | - | exata |
| 37a7b.b-179a6.a | arco R5.62 × arco R4.10 | -10/-10 | 0.138 / 0.000 | 10.687 / 0.000 | 21.359 / 0.000 | arcoInclinadoSemJuncao | inviável |
| 179a6.b-39484.a | arco R4.10 × reta | -10/15 | 6.188 / 2.985 | 506.965 / 0.000 | 966.236 / 0.000 | arcoInclinadoSemJuncao, inclinacaoInviavelNaJuncao | inviável |
| 9df3f.a-59b9a.b | reta × reta | 15/15 | 2.071 / 0.000 | 2.071 / 0.000 | 0.000 / 0.000 | - | exata |
| 9df3f.b-d37c6.a | reta × reta | 15/15 | 3.006 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | - | exata |
| d37c6.b-7e167.a | reta × reta | 15/15 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | - | exata |
| 7e167.b-59b9a.a | reta × reta | 15/15 | 2.821 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | - | exata |
| 39484.b-703b7.a | reta × reta | 15/15 | 6.848 / 1.840 | 408.814 / 0.000 | 815.620 / 0.000 | arcoInclinadoSemJuncao, inclinacaoInviavelNaJuncao | inviável |
| 026fc.b-08867.a | arco R9.30 × arco R2.05 | 15/15 | 0.000 / 0.019 | 0.000 / 0.012 | 0.000 / 0.012 | - | exata |
| 08867.b-f7080.a | arco R2.05 × arco R3.35 | 15/15 | 0.000 / 0.016 | 0.000 / 0.011 | 0.000 / 0.015 | - | exata |
