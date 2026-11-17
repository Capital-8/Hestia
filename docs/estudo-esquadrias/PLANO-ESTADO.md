# Plano de implementação de esquadrias: estado

Base: `00-sintese.md`. Atualizado a cada entrega. Branch: `claude/lucid-bell-hwk4ln`. Retomar: ler esta tabela e seguir a primeira linha não concluída.

Regras: agentes não fazem commit (a coordenação faz); arquivos disjuntos por agente; gate = `npx tsc -p tsconfig.json --noEmit`, `npm run lint` e vitest da área; `max-lines` 420.

| Onda | Item | Modelo | Estado |
|---|---|---|---|
| 0 | 0a/0b IFC export: mapeamentos B1-B8 e psets B9-B11 | Haiku | em andamento |
| 0 | 0c IFC import: aviso de arco, desempenho e operação da janela | Haiku | em andamento |
| 0 | 0d A-1, A-2, A-6 (offset, roughOversize, sobreposição por altura) | Sonnet | concluído |
| 0 | 0e docs desatualizados | Haiku | pendente |
| 0 | 0f validações por norma (avisos) | Haiku | pendente |
| 1 | 1a spike: furo da parede por contorno (meia-lua), só TS | Sonnet | em andamento |
| 1 | 1b modelo `OpeningShape`, `outline()`, migração | Sonnet | pendente (após 1a) |
| 2 | peças, planta/corte/elevação, 3D, DXF, composição | Haiku/Sonnet | pendente |
| 3 | IFC com perfil, Rust (furo e retorno), esquema | Haiku/Sonnet | pendente |
| 4 | UI, alças, catálogo, quadro, interoperabilidade | Haiku/Sonnet | pendente |
| 5 | objetos compostos (opcional) | - | a decidir |
