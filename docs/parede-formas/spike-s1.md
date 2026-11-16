# Spike S1 · junção de duas paredes inclinadas (branch `pf/spike-s1`)

Arquivos: `packages/engine/src/wallTiltJoin.spike.ts` e `wallTiltJoin.spike.test.ts` (20 testes verdes; os 2 de arco são `it.fails` de propósito). Método: quadros deslocados por d(z) e espessura t/cosθ, nó = cruzamento dos eixos no nível, `joinPair`/`buttAgainst` existentes reaplicados; topologia só da base (`joinStatus`).

| Critério | reta×reta | arco |
|---|---|---|
| (a) cantos da tabela a 1e-6, colineares (15/15, 15/30, 0/30) | PASSOU | n/a |
| (b) vértices da face de junção a <1e-9 dos 2 planos | PASSOU | n/a |
| (c) malha fechada, 2 triângulos por aresta, normais para fora | PASSOU (fuzz: 86 pares viáveis) | PASSOU nos viáveis |
| (d) volume Simpson, erro <1e-9 (reta) / <1e-3 (arco) | PASSOU (erro máx 1,7e-15) | FALHOU (máx 6,7%; 260 de 342 paredes viáveis >1e-3) |
| (e) tilt 0/0 = `computeEnds` | PASSOU | n/a |
| Sem NaN, sem triângulo <1e-12 | PASSOU | PASSOU |
| Tempo por par (N=4) | 0,4 a 0,7 ms (<2 ms) | idem |
| Volumes §4.2 de arco isolado (5,2708 / 4,4865) | n/a | PASSOU a 1e-3 (N=16) |

Fuzz (500 pares, semente 20260514; 117 reta×reta, 383 com arco). Pares inviáveis (modelo de dois níveis não se aplica):
- reta×reta: 31 de 117 (26%) têm o cruzamento dos eixos deslocados fora da parede (tilt até 45°, H até 6, L a partir de 2 m). Nos 86 restantes, exatidão total. A Fase 2 precisa validar tilt×altura×comprimento (ex.: deslocamento do nó < comprimento da parede) e avisar.
- arco: 212 de 383 inviáveis (154 eixos sem cruzamento, 39 nó fora, 19 cone invertido R+k·d<0). Nos 171 viáveis, 44 trocam o tipo de corte no meio da altura (limite de esquadria/nó de `planeSpecs`).
- N mínimo para <1 mm na face de junção com arco: NÃO EXISTE até N=32 (desvio máx nos 127 pares contínuos: 0,43 m em N=1 até 0,041 m em N=32; cai só ~1/N, ou seja, o caminho do canto não é suave em z). Logo N=4..16 não garante.

Veredito: reta×reta APROVADO COM RESTRIÇÃO (validar o limite geométrico acima). Arco REPROVADO: aplicar PLANO B (`wallTiltJoinPlanoB`: corte de topo simples sem junção, aviso `arcoInclinadoSemJuncao`; malha fechada e volume>0 em 311 de 383 pares, os 72 restantes são cone invertido) e abrir ficha de dívida para junção exata com arco inclinado (exige curva de canto contínua, não o `planeSpecs` por nível).
