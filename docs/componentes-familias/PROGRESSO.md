# Componentes e editor de famílias — progresso e o que falta

Situação em 2026-11-24. Decisões de arquitetura: `docs/decisoes/0049-componentes-e-editor-de-familias.md` (base) e `docs/decisoes/0061-criador-de-familias-parametricas.md` (criador paramétrico: corpos, ligações, símbolos, detalhes e redes MEP).

Estado detalhado, fichas e decisões tomadas na execução: `docs/familias-parametricas/ESTADO.md`. Contrato de semântica: `docs/familias-parametricas/CONTRATO.md`. Manual de uso: `docs/familias-parametricas/MANUAL.md`.

Branch de integração: `claude/lucid-euler-ddb7j6`.

## O que já funciona

**Modelo e motor (base 0049)**
- Família paramétrica de peças prismáticas: parâmetros com fórmulas, planos de referência, peças, aninhados, ferragens, tipos, usinagens.
- Resolução em metros, arredondada a 1 µm, com malha, pegada, caixa, lista de peças, plano de corte, custo, CSV e DXF.
- Conjuntos e filas, dobradiças por altura da porta, encaixe puro (parede, vizinho, colisão, preencher vão, posicionar fila).

**Modelo e motor (ADR 0061)**
- Corpos: extrusão, revolução, varredura (com curvas no caminho) e transição. Perfis: círculo, anel, retângulo, retângulo oco, polígono e perfis I, U, L e T. Validação com diagnósticos.
- Ligações tipadas (domínio, seção, bitola, direção, fluxo), compatibilidade e encaixe.
- Símbolos 2D por vista, com visibilidade por corpo. Detalhes com vistas nomeadas e cotas dirigidas por parâmetro. Verificações e tabelas por tipo.
- Projeto: inclinação 3D e conexões entre instâncias, sistemas MEP, esquema 34.
- Diagnóstico de rede (ligação aberta, conexão inválida, afastada, incompatível, declividade fora da faixa, rede sem saída).
- Conexões automáticas (curva, tê, redução) para o domínio de esgoto.
- Quantitativos por categoria (tubo por DN, conexão, reservatório, perfil em kg, eletroduto).
- Arquivo de família versão 2, que lê também a versão 1.
- Exportação IFC por categoria, com portas de ligação. Famílias de marcenaria antigas continuam `IFCFURNITURE`.

**Projeto**
- Colocar, selecionar, mover, copiar, colar, excluir, girar e espelhar componentes. Arrastar com encaixe. Paleta Biblioteca.
- Ferramenta *Tubo* para desenhar trechos entre pontos (Inserir > Tubulação > Tubo).
- *Verificar rede* (Inserir > Tubulação) abre a lista de avisos com o botão *Ir para*.
- Painel MEP da instância: inclinação, conexões, sistema, verificações e tabelas.
- Planta, 3D, corte e elevação mostram os corpos. Símbolos aparecem na planta e no corte.
- Orçamento: aba *Instalações e estrutura* (tubos em m, conexões, reservatórios em L, perfis em kg, eletrodutos).
- Detalhe da família inserido numa prancha (*Inserir no projeto*).

**Editor de famílias**
- Aba *Criar* com painéis *Corpos*, *Ligações*, *Símbolo 2D* e *Detalhes*. Abas *Inserir*, *Modificar*, *Vista* e *Gerenciar* com painéis.
- Galeria *+ Novo módulo…* com modelos-base (tubo reto, conexão em curva, caixa com tampa, luminária, perfil metálico I, equipamento genérico, móvel) e filtro por disciplina.
- Biblioteca de referência em `BIBLIOTECA_MEP`: esgoto, água fria, caixas de inspeção, gordura e sifonadas, fossa séptica, filtro anaeróbio, sumidouro, elétrica, luminárias, perfis metálicos, HVAC e os exemplos de disciplina migrados.
- Roteiros de navegador que passaram: tubo, caixa e perfil (`tests/e2e/familias-tubo.mjs`, `familias-caixa.mjs`, `familias-perfil.mjs`), além dos roteiros de ligações, símbolos, corpos e abas. As capturas ficam em `docs/familias-parametricas/evidencias/`.

## O que falta ou tem limitação

Lista completa e com medições em `docs/familias-parametricas/ESTADO.md` e no fim do `MANUAL.md`. Resumo:

- **Valores de norma e de catálogo** marcados `CONFERIR`: espessuras, raios, declividade de esgoto, parâmetros de fossa (NBR 7229 e 13969), taxa de infiltração, séries de perfis. Nenhuma família afirma atender à norma.
- **Vazios:** não há subtração real. Tê e junção não furam o tubo principal. Caixa vazada não é selecionada pelo centro. Subtração real (F-CSG) é opcional e está pendente.
- **Conexões automáticas** só para o tubo de esgoto da biblioteca. Tê não foi desenhado no roteiro de navegador.
- **Inclinação 3D:** peças na planta continuam 2D e não acompanham a inclinação. Os corpos acompanham.
- **Seleção:** corpos e ligações não são selecionáveis no corte. Sem clique em ligação no 3D. A seleção entre 3D e lista do editor só funciona pela lista.
- **Editor:** mover, girar e alinhar com mouse, captura de pontos, usinagem, DXF, plano de referência, materiais, unidades, arame, isolar, planos e enquadrar estão desabilitados, com o motivo.
- **Sem roteiro de navegador:** luminária, conexão em curva, caixa como modelo, prancha e *Verificar rede* isolada.
- **IFC legado:** as famílias de exemplo migradas agora exportam classes específicas (vaso e lavatório como `IFCSANITARYTERMINAL`, por exemplo). Ordem dos atributos de `IfcDistributionPort` e sentido SINK/SOURCE estão a conferir. Não houve validação em leitor IFC externo. O botão de exportação na interface não foi conferido.
- **Famílias que não existem:** eletroduto flexível e quadro de distribuição.
- **Textos:** categorias novas só em português. Traduções em espanhol, alemão, francês, italiano e polonês sem revisão de falante nativo.
- **Opcional:** espelho em Rust das malhas (H3), pendente.

Os problemas de interface de 2026-11-06 que não pertencem à ADR 0061 (texturas no 3D, proposta P0 de móvel por caixa e divisões) não foram tratados nesta revisão e não foram reverificados.

## Como continuar

1. Conferir os valores `CONFERIR` com o responsável técnico, antes de usar as famílias de norma.
2. Decidir a inversão da classe IFC legada, se o dono quiser a tabela do CONTRATO §6 para louças e equipamentos.
3. Abrir as fichas de limitação listadas no `ESTADO.md`: seleção no corte e no 3D, inclinação das peças na planta (B3c), roteiro da prancha.
4. Servidor de teste: `cd apps/web && npx vite --port 5199 --host 127.0.0.1`.
