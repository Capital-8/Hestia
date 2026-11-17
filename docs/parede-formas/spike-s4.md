# Spike S4: abertura em parede inclinada (reta, θ=15°, t=0,2)

Arquivos: `packages/engine/src/openingTilt.spike.ts` e `.test.ts` (6 testes verdes). O corte atual do vão é TS (`openingCut.ts`, retângulo 2D extrudado; Rust só espelha em `aberturas_geom`).

| Critério | Resultado |
|---|---|
| Janela inclinada: topo 1,9659; deslocamento 0,3974; volume 0,2400 (1e-4) | passou |
| Porta vertical: profundidade 0,7697; volume 0,3913; plano 0,2813 (1e-4) | passou |
| Volume conferido na malha (laje − corte, divergência), não só na fórmula | passou |
| Parede menos corte = malha fechada (2 modos, janela e porta) | passou |
| θ=0: os dois modos idênticos e iguais ao `openingRect` (folga 0,02) | passou |
| Recuo ≥ 0 nas 4 bordas | passou no inclinado; FALHOU no vertical |

Falha do recuo: no modo vertical o plano do caixilho (vertical, em `(s+h/2)·tanθ`) sai da face da parede em cima e embaixo quando `h/2·tanθ > t/(2cosθ)`: porta −0,1778, janela −0,0304. Nas laterais é ≥ 0. Recuo medido do plano do caixilho às faces do corte ao longo do eixo de corte.

Limitação do spike: a laje tem base reta no plano da face (não cortada em z=0); o furo de porta com s=0 não abre pela base.

Arco: modo inclinado viável com plano tangente no centro do vão. As faces se afastam do prisma reto por `drift = R − √(R² − (w/2)²) ≈ w²/(8R)` (igual a `cutHalfOf`), então o prisma ganha esse valor de folga. Limite proposto (não testado no spike): drift ≤ t/4 = 0,05, ou seja `w² ≤ 0,4·R` (janela 1,2: R ≥ 3,6 m; porta 0,9: R ≥ 2,0 m). Acima disso, só modo vertical com aviso.

Recomendação: aprovar o modo inclinado para parede reta (e arco dentro do limite); no modo vertical exigir caixilho ancorado na face (não no plano central) ou aviso quando `h·tanθ > t/cosθ`, e F2.8 deve decidir isso antes de implementar.
