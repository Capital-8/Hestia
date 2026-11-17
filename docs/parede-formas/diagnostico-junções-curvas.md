# Diagnóstico: junções de paredes curvas inclinadas e portas (somente leitura)

Projeto: `~/Documents/Projetos/Projeto sem título/projeto.hestia.json` (esquema 27, migrado por `migrateProject`; 13 paredes, 5 arcos). Scripts em `scratchpad/diag-juncoes/` (diag.mts, cross.mts, porta.mts); nenhum código alterado. Não há paredes que se cruzam em X; todos os nós são pares ponta-com-ponta. Medido com `wallLayerSolid` real, seção por plano z, tampas de cada parede contra a seção da vizinha (fresta = tampa fora da vizinha; sobrep. = penetração), em metros.

## Tabela de junções (z = 0,01 / 1,4 / 2,79)
| Nó | Tipos, tilt | Ângulo eixos | Status | Fresta (base/meio/topo) | Sobrep. máx |
|---|---|---|---|---|---|
| 784e0.b–1d2a0.a | reta 15 / reta 15 | 141,9° | exata | 0 / 0 / 0 (*) | 0 |
| 9df3f.a–59b9a.b, 9df3f.b–d37c6.a, d37c6.b–7e167.a, 7e167.b–59b9a.a, 39484.b–703b7.a | reta×reta 15/15 | 43 a 149° | exata | ≤ 0,003 | 0 |
| 37a7b.b–179a6.a | ARCO×ARCO −10/−10 (R 5,62 e 4,10) | 114,9° | plano B, aviso arcoInclinadoSemJuncao | 0 / 0,011 / 0,021 | 0 |
| 026fc.b–08867.a | ARCO×ARCO 15/15 (R 9,30 e 2,05) | 145,7° | plano B, aviso | 0 / 0,05 / 0,10 | 0,07 |
| 08867.b–f7080.a | ARCO×ARCO 15/15 (R 2,05 e 3,35) | 11,9° | plano B, aviso | 0 / 0,08 / 0,16 | 0 |
| 179a6.b–39484.a | ARCO(−10)×RETA(15) (R 4,10) | 152,5° | plano B (a reta tem junção só do outro lado), aviso | 0 / 0,56 / 1,12 | 0 |
(*) o 0,52/0,64 lido em z baixo vem das bordas do vão da porta (d_a5fe8c0a3 em 1d2a0, offset 1,10 m), não da junção; é artefato da medição.

## Causa por classe
1. Reta×reta: `levelSet` cruza os eixos deslocados em z=0 e z=H e interpola (exato, sem falha medida).
2. Arco (qualquer lado): `analyzeLevelTiltRaw` (wallTiltJoinLevel.ts, linhas ~250-255) descarta a relação e só avisa. Cada parede então usa o corte vertical da base levado por `tiltMap` (wallTiltSolid.ts): em arco o ponto sobe radialmente, raio R + k·z·tanθ + (ρ−R)/cosθ, pela direção do CENTRO DO PRÓPRIO ARCO. As tampas giram uma em relação à outra: no eixo, abertura(z) = z·|tanθa·ka·na − tanθb·kb·nb| (na, nb = normais do eixo no nó). Mesmo tilt: 2·z·tanθ·sin(δ/2), com δ o giro entre tangentes; δ=0 (arcos tangentes e mesmo tilt) dá 0. Em z=2,79: 15° e δ≈12° dá 0,156 (medido 0,156); −10° e δ≈2,5° dá 0,021. O sinal do giro decide fresta (lado convexo) ou sobreposição (lado côncavo): 026fc×08867 tem as duas.
3. Arco×reta com tilts diferentes: a ponta do arco gira com seu centro, a da reta fica no plano da reta: z·(tan15+tan10)=1,24 no topo (medido 1,12 na linha de eixo). É a "abertura em uma delas" do relato.
4. Cruzamento em X nunca é junção (nem na parede vertical); não ocorre neste projeto.

## Solução proposta (junção exata cone×plano e cone×cone)
Em cada cota z o eixo do arco é um círculo de mesmo centro (raio R+k·z·tanθ) e as faces são círculos de raio R_f(z)=R+k·z·tanθ+(ρ−R)/cosθ. O canto em z é interseção círculo×círculo (ou círculo×reta): fórmula fechada. A curva do canto não é reta em z; amostrar N níveis (adaptativo: bisseção até desvio da corda < 0,5 mm; esperado 4 a 8 para H ≤ 3) e unir por faixas regradas.
Referências à mão (testes): (a) arcos concêntricos tangentes, mesmo R=5 e tilt: canto = (R_f(z)·cosφ, R_f(z)·sinφ), fresta 0 e volume = soma; (b) círculos de centros (0,0) e (6,0), R=5, tilt 15° afastando: canto do eixo em x=3, y=√((5+z·tan15°)²−9); z=2,8: y=4,906 (z=0: 4,000); (c) arco×reta: eixo reta y=0 e círculo centro (0,−3) R=5, canto x=±4 em z=0; (d) fresta atual do plano B = fórmula 2·z·tanθ·sin(δ/2) (regressão: 0,156 a 15°, δ=12°, z=2,79).

## Fichas (paralelizáveis, Sonnet)
| Ficha | Arquivos permitidos | Horas | Depende |
|---|---|---|---|
| J0 paliativo: ponta do arco tratada como tangente no nó e junção reta×reta exata só nas pontas (reduz a fresta a O(z·curvatura)); mantém aviso de aproximação | wallTiltJoinLevel.ts, wallTiltJoin.ts (levelSet com tangente), testes | 6 | nenhuma |
| J1 núcleo: `levelSet`/`levelFrame` com arco (círculo×círculo/reta, cone invertido, nó fora da parede), N níveis adaptativos | wallTiltJoin.ts, wallTiltJoin.test.ts (tira o it.fails D1) | 8 | nenhuma |
| J2 análise: `WallTiltJoin` com `zs[]` e anéis por nível; tira o corte `arcoInclinadoSemJuncao` | wallTiltJoinLevel.ts, junctionLevel.ts, wallTiltJoinLevel.test.ts | 5 | J1 |
| J3 sólido: `joinedMap`/`extrudeLayerTilted` interpolando por faixa e faces de arco | render/model3d/wallTiltSolid.ts, wallTiltJuncaoExata.test.ts | 6 | J2 |
| J4 consumidores: planta, corte, IFC, quantitativos | wallTiltPlan.ts, wallTiltSection.ts, plan/view.ts, ifcMalha.ts | 4 | J2 |
| J5 testes de referência (a)-(d), fuzz arco×arco, medição de fresta < 1 mm em z=0/meio/topo; paridade/guarda E5 (TS) | só testes | 3 | J3 |
Total: cerca de 26 h (J0 é opcional se J1 a J5 vierem). Riscos: arcos curtos com cone invertido (R+k·z·tanθ ≤ 0), cruzamento duplo círculo×círculo (escolher a raiz mais próxima do nó da base), camadas com quebras (`alinhar`), custo (<2 ms/par hoje; manter) e Rust sem tilt (E5 mantém TS).

## Portas
- No projeto, porta e janela não têm `plano` no arquivo. Efetivo: janela 'inclinado', porta 'vertical' (`openingPlaneOf`, decisão E1). Medido: porta em 1d2a0 (reta 15°) com padrão: tiltPlane ausente; com 'inclinado': tiltPlane 'inclinado' (0,8×2,1, peitoril 0).
- Resposta: as portas ficam verticais por PADRÃO (decisão E1) e é possível mudar para inclinado pelo campo "Plano da abertura" (Propriedades da porta; aparece sempre que a parede hospedeira tem inclinação; opções Padrão do tipo / Vertical / Inclinado). Inclinado: esquadria no plano da face (rotação −θ, `referencialInclinado3d.ts`), ocupa h·cosθ na vertical; vertical: caixilho em prumo ancorado na face, recuo ≥ 0.
- Parede em arco: o inclinado só vale com w² ≤ 0,4·R (`inclinedFitsArc`); porta 0,8 m exige R ≥ 1,6 m (todos os arcos do projeto passam); fora disso volta a vertical com aviso `aberturaPlanoVerticalNoArco`. Nenhum vão deste projeto está em arco. Defeito de lógica não encontrado; a falta é só visibilidade (o padrão vertical da porta não é anunciado fora da lista do campo).
