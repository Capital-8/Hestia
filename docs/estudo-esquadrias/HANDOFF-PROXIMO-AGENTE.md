# Handoff para o próximo agente (orçamento curto)

Data: 2026-11-17. Contém o prompt pronto para colar numa sessão nova. Orçamento: **15 minutos e no máximo 4% do limite semanal**. Não é necessário concluir.

## O prompt (copie tudo abaixo desta linha até o fim do bloco)

````text
Você continua um estudo de esquadrias (portas, janelas e aberturas) do projeto Hestia, um BIM de arquitetura.
Repositório: engdennylsonsantos-cloud/Hestia. Branch de trabalho: claude/lucid-bell-hwk4ln (todo o estudo está lá).

ORÇAMENTO: no máximo 15 minutos e 4% do limite semanal. NÃO precisa concluir. Priorize o que está marcado "essencial". Se passar de 12 minutos, pare, atualize o estado e dê push.

REGRAS
- Comece com: git fetch origin claude/lucid-bell-hwk4ln && git checkout claude/lucid-bell-hwk4ln && npm ci --ignore-scripts --no-audit --no-fund
- Use subagentes: Haiku para tarefas volumosas e padronizadas, Sonnet só para o que exige decisão de geometria. Não use Opus. No máximo 2 subagentes ao mesmo tempo.
- NÃO rode a suíte inteira de testes. Rode só os testes da sua área (vitest com caminho) e, antes de commitar, `npx tsc -p tsconfig.json --noEmit` e `npx eslint` nos arquivos que você mudou (max-lines 420 por arquivo).
- Subagentes NÃO fazem commit. Você faz commit e push depois de cada entrega (git add dos arquivos específicos, nunca git add -A em pasta de código), push em claude/lucid-bell-hwk4ln. Não faça force-push, não mexa em main, não crie PR.
- Termine cada commit com as duas linhas: "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" e a linha "Claude-Session:" da sua própria sessão, se houver.
- Não altere código existente do produto no spike; só arquivos novos (packages/engine/src/spike/ e docs/estudo-esquadrias/).
- Escreva em português, sem jargão desnecessário. Diga sempre o que foi verificado e o que é inferência.

LEIA, NESTA ORDEM (só o necessário, não leia os 11 documentos inteiros)
1. docs/estudo-esquadrias/PLANO-ESTADO.md (estado das tarefas)
2. docs/estudo-esquadrias/00-sintese.md (conclusão geral e roteiro)
3. docs/estudo-esquadrias/09-spike-furo-por-contorno.md (veredito: furo por faixas horizontais, viável com ressalvas; secções 0, 1 e 2)
4. docs/estudo-esquadrias/10-plano-booleana.md (três caminhos A, B e C, e a decisão pedida)
5. docs/estudo-esquadrias/11-rust-booleana-bibliotecas-e-medicao.md (medição da booleana 3D; código em docs/estudo-esquadrias/bench-booleana/)

CONTEXTO EM 6 LINHAS
- O Hestia só faz vão retangular. A parede é pilha de camadas; cada camada é lista de "bandas" (polígono em planta + z0/z1, topo inclinado opcional "slope") em packages/engine/src/types.ts:32. O furo é um retângulo por faixa de altura (packages/engine/src/resolve.ts ~279 e ~340-349, openingCut.ts ~39).
- Queremos janelas/portas em arco (meia-lua, abatido, ogival, círculo etc.) e contorno livre.
- Três caminhos: A) booleana 3D real (biblioteca manifold-rust, Apache-2.0, já medida: de 3 a 45 ms por parede de 5 camadas com 1 a 4 aberturas; Rust não é mais rápido que o manifold-3d em JS); B) híbrido; C) colunas verticais inclinadas dentro do motor atual de bandas, sem booleana.
- O caminho C NÃO foi avaliado ainda. É a lacuna que falta para decidir A x C.
- Decisão final é do dono do projeto, que só decide depois de ver números.

PLANO (essencial primeiro)

PASSO 1 (essencial, Sonnet, ~8 min): SPIKE DO CAMINHO C. Arquivos novos em packages/engine/src/spike/ (ex.: columns.ts e columns.test.ts) e o relatório docs/estudo-esquadrias/12-spike-colunas-inclinadas.md.
  Objetivo: provar se dá para furar a parede por contorno (meia-lua largura 0,9 m, altura 1,4 m, base reta; e arco abatido 1,2 x 1,5 com flecha 0,2) decompondo a ELEVAÇÃO da parede em colunas verticais entre os pontos do contorno, onde o topo do furo (e a base da faixa acima dele) segue a corda do arco, em vez de faixas horizontais. Cada coluna acima do arco é uma banda com BASE inclinada; abaixo, com topo inclinado ou reto.
  Use outline() de packages/engine/src/spike/outline.ts (já existe, cordas com erro máximo 1 mm).
  Verifique e relate: (a) volume removido contra área do contorno x espessura, com 24 cordas; (b) número de peças por camada contra as faixas horizontais (24 a 48 faixas); (c) se LayerBand (types.ts:32), fuseBands (bandFuse.ts) e o retorno do acabamento (wrap.ts ~109-135) aceitam base inclinada, ou o que precisa mudar (só LEIA o motor; liste arquivo:linha); (d) se a junção de paredes e o quantitativo continuam corretos; (e) veredito claro: C viável / viável com ressalvas / inviável, e comparação com A (use os números do documento 11).
  Rode apenas: npx vitest run packages/engine/src/spike, npx tsc -p tsconfig.json --noEmit, npx eslint packages/engine/src/spike.
  Commit e push ao terminar.

PASSO 2 (opcional, Haiku, em paralelo ao passo 1): DOCUMENTAÇÃO DESATUALIZADA (tarefa 0e do PLANO-ESTADO). Corrigir, só em docs/: docs/aberturas/F-PROGRESSO.md ("130 tipos" é hoje 154: 94 portas e 60 janelas); docs/PENDENCIAS-2026-10-28-cotas-padroes-esquadrias.md (a pendência "IFC: cada vão sai como caixa única" já não vale: o export grava um sólido por peça dentro de um só IFCDOOR/IFCWINDOW, e faltam IfcMember/IfcPlate por peça e *LiningProperties); cabeçalho do ADR docs/decisoes/0056* (diz "fase 0", mas esquadria em célula de cortina está no código; a referência keepOpeningFrame §14.3 não existe em nenhum .ts). Confira cada afirmação no código antes de alterar. Commit e push.

PASSO 3 (essencial, você, ~2 min): atualizar docs/estudo-esquadrias/PLANO-ESTADO.md com o que foi feito e o próximo passo; commit e push. Termine com um resumo curto ao usuário: o que foi feito, o veredito A x C e o que falta.

SE SOBRAR TEMPO (não obrigatório): validações por norma como AVISOS (tarefa 0f): vão livre mínimo 0,80 x 2,10 m em portas (NBR 9050), vidro de segurança em porta (NBR 7199:2025, só resumo verificado, diga isso na mensagem), com testes. Só como aviso, nunca bloqueio.

NÃO FAÇA (fora do orçamento): implementar o modelo OpeningShape, mexer em Rust, interface, IFC, catálogo, rodar a suíte completa, regravar goldens visuais.

ENTREGA ESPERADA: commits na branch claude/lucid-bell-hwk4ln com (1) relatório 12 com o veredito, (2) PLANO-ESTADO atualizado, (3) opcionalmente docs corrigidos.
````

## Notas para quem ler isto (humano)

- O que já está pronto e no GitHub: as oito frentes do estudo (`01` a `08`), a síntese (`00`), o plano de implementação em ondas e seu estado (`PLANO-ESTADO.md`), o spike do furo por faixas (`09`), o plano por booleana (`10`), a medição de bibliotecas Rust (`11`) e o código dessa medição (`bench-booleana/`).
- Onda 0 concluída: correções de IFC (exportação e importação) e três defeitos de esquadrias. Falta 0e (docs) e 0f (validações por norma).
- A decisão do dono: aprovar o spike comparativo A x C. O prompt acima já executa a parte C; a parte A está medida no documento 11.
- Os números de dias nos documentos são estimativas em dias de desenvolvedor humano. Um agente costuma levar minutos.
