# Spike S3 · Ajuste de elipse e spline a arcos tangentes

Arquivos: `packages/geom/src/curveFit.ts` (`fitArcs(curva, tol=0,005, maxArcos=64, {espessura?})` → `{arcos, avisos, desvio}`) e `curveFit.test.ts` (9 testes, todos verdes). Nao exportado em `index.ts` (nenhum arquivo existente alterado).

Metodo: biarcos G1 (tangente da curva nas pontas), junção escolhida entre 17 posições, ponto de bisseção entre 11 frações, refinando sempre o pior segmento. Elipse: ajusta 1 quadrante e espelha (simetria exata, total múltiplo de 8). Spline: Catmull-Rom centrípeta convertida em Béziers; `fechada` opcional.

- (a) passou: desvio medido 4,94 mm (limite 5), margem fina.
- (b) passou: tangência por construção, pontas idênticas.
- (c) passou. (d) passou: elipse com 16 arcos, simétrica. (e) passou: comprimento 19,3800 (ref 19,3769, dif 0,003); área dentro de 0,1.
- (f) passou: JSON idêntico; ordem invertida dá a cadeia invertida (1e-9).
- (g) passou: maxArcos=8 devolve 8 arcos + aviso `max-arcos`. (h) passou: aviso `raio-pequeno`.
- Círculo spline 8 pontos: passa só com r=0,5 m (16 arcos, raio = r ± 5 mm). Com r=1 e 2 m a própria Catmull-Rom se afasta do círculo (~8,5 mm por metro de raio) e os arcos seguem a spline (raios 1,64/2,54 para r=2; 32 arcos). O critério "raio = r ± tol" só vale para splines com raio pequeno ou muitos pontos; é limite da spline, não do ajuste.
- Biarco com junção fixa no meio (q=0,5) e bisseção a 0,5 dava 32 arcos na elipse; a busca de q e do ponto de corte levou a 16. Custo: ~1 s por ajuste de spline; o ajuste é de edição, não de quadro.
- `ellipseShape` do esboço: nao usado; serve só de conferência (gera elipse como arcos de esboço, sem tolerância controlada).
- Plano B nao foi necessário. Recomendação: aprovar; avisar o dono que spline de poucos pontos pode gerar muitos arcos (até 64) e usar tol configurável.
