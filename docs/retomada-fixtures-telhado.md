# Retomada: fixtures de telhado sem projeto real

- Os testes que liam `projeto.hestia.json` da raiz (projeto real e privado do dono, fora do repositório) agora usam um projeto fictício em L, construído em código.
- Fixture: contorno (5,0), (9,0), (9,5), (0,5), (0,-1.5), (5,-1.5); inclinações [null,30,30,30,null,30]; balanço 0,5 m; beiral em 2,8 m. Canto reentrante em (5,0).
- Valores à mão (literais nos expects): degrau = 0,30 x 4 m = 1,2 m; área = 20 + 32,5 = 52,5 m²; cortina em y = 2,5 de x = 0,5 a 2,5: topo de 2,95 a 3,55 m (variação 0,60 m).
- Trocados: `projetoHestia.test.ts` (projeto montado com addRoof/addWall, ids fictícios `t_ficticio`/`w_ficticia`), `roofResolve.test.ts`, `roofCheck.test.ts` e `roofFiletes3d.test.ts` (estes três traziam as coordenadas reais inline; agora usam o L fictício).
- `projetosDoDono.test.ts` já pula sem a pasta externa (lê `HESTIA_PROJETOS`, não a raiz); não foi alterado.
- Diagnóstico: não existe `roofs.test.ts`; os testes de arco (`roofArcs`, `roofCurvedSkeleton`, `roofMansardArc`) e as 24 pastas `roof*`/`sectionRoof*` do engine passam (238 testes) nesta base. A falha vista antes não reproduz aqui; sem regressão do motor identificada.
- Pendência: conferir a falha original no ambiente do executor anterior (pode ter sido ruído da guarda de memória ou o próprio arquivo ausente).
