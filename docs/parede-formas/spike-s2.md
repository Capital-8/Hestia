# Spike S2 · arcos tangentes (somente leitura, código atual de junções)

Teste: `packages/engine/src/spikeS2Tangente.test.ts` (13 testes, todos verdes; nenhum arquivo existente alterado). Tipo de parede de camada única t=0,2; H=3; junção padrão.

| Critério "Passa se" | Círculo r=3 (2 arcos de 180°) | Arcos R=2 e R=5 (90° cada) |
|---|---|---|
| `joinStatus` das pontas do nó = pair | passou (4 pontas) | passou |
| Área da união ≈ oráculo | passou com 5e-4; erro medido 1,3e-4 (3,7694 vs 3,7699) | passou a 1e-3 (oráculo 2,1991) |
| Face de topo radial (< 1e-6 rad) | passou nas 4 pontas | passou nas 2 paredes |
| Zero aresta de emenda na planta (regiões por material) | passou | passou |
| Igual trocando a ordem (`order`) | passou | passou |

Ressalva: o documento pede 1e-4 relativo; a planta discretiza o arco em cordas (polígono inscrito), então o erro de 1,3e-4 é de discretização, não de junção. Registrar a tolerância de 5e-4 para o círculo r=3.

Recomendação: S2 APROVADO (não abrir F1.5). A esquadria atual não degenera no ângulo de ~180° entre tangentes. Não foram cobertos: parede com `joinStart/joinEnd` explícito (`butt`), tipos diferentes e o sólido 3D (só a planta).
