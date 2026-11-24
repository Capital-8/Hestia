# Plano: criador de famílias paramétricas (ADR 0061)

Data: 2026-11-24. Contrato: `CONTRATO.md`. Execução: `EXECUCAO.md`. Estado: `ESTADO.md`. Fichas: `fichas/`.

## 1. Ponto de partida (mapeamento resumido)
O editor atual cria **móveis de chapa**: peças prismáticas, fórmulas, tipos, usinagens, lista de peças, plano de corte, orçamento, DXF e IFC de mobiliário; já tem `disciplina` por família, projeção de planta por nível de detalhe e corte de componentes. Falta, em ordem de impacto: **(1) geometria curva** (revolução, varredura, transição), **(2) conectores MEP** (ponto, direção, domínio, seção, bitola), **(3) rotação/inclinação livre**, **(4) símbolo 2D e visibilidade por vista**, **(5) categorias e IFC por disciplina**, **(6) interface** (4 abas do editor são placeholders; sem mover peça com mouse), **(7) detalhamento dentro da família**, **(8) redes** (rotear tubo, conexões automáticas, diagnóstico).

## 2. Meta: o que é "pronto"
Cinco cenários de aceitação, todos com roteiro de navegador (H1):
1. **Tubo de esgoto.** Criar do zero no editor um tubo (modelo-base Tubo): DN por tipo (40/50/75/100/150), comprimento por parâmetro, duas ligações. Inserir no projeto, desenhar três trechos com a ferramenta Tubo; as curvas e tês aparecem sozinhas; a rede não tem avisos; planta, 3D, corte e IFC (`IFCPIPESEGMENT`, `IFCPIPEFITTING`, portas e conexões) corretos; quantitativo por DN.
2. **Caixa de inspeção / gordura / fossa.** Parâmetros de dimensão e cotas de entrada e saída; ligações; símbolo de planta; corte longitudinal com cotas dirigidas por parâmetro; verificação de volume útil; tabela de dimensões por tipo.
3. **Luminária.** Corpo curvo (revolução) + difusor, símbolo 2D no forro, ligação elétrica, potência e fluxo como propriedades.
4. **Perfil metálico.** I/U/L/T/tubular, comprimento e massa nos quantitativos, `IFCMEMBER`, chapa de base com furos.
5. **Compatibilidade.** As 28 famílias de marcenaria e os projetos antigos abrem e resolvem **idênticos** (snapshot da biblioteca em A7); arquivo de família v1 abre; projeto 33 migra para 34.

## 3. Arquitetura (resumo; detalhes no CONTRATO)
- **Modelo (`packages/model`)**: tipos aditivos (já no código) + validação + operações de edição puras + comandos de projeto (conexões, sistemas, inclinação).
- **Motor (`packages/engine`)**: resolução de perfil, caminho e corpos em números (metros); malhas (TypeScript é a referência, Rust opcional); projeção de planta, corte e elevação; ligações, encaixe e conexões automáticas; verificações, tabelas, detalhamento, quantitativos, diagnóstico de rede.
- **Render e I/O**: 3D, planta, corte com corpos e símbolos; IFC por categoria com portas.
- **Interface**: editor (corpos, ligações, símbolos, detalhes, abas), galeria por disciplina com modelos-base, ferramenta Tubo, painel de rede.
- Sem solver de restrições, sem dependência nova, sem `eval`.

## 4. Ondas (dependências e paralelismo)
| Onda | Fichas | Tema | Observação |
|---|---|---|---|
| 1 | A1, A2, A3, A4, A9, E1 + cegos A3, A4 | Fundação: fórmulas, validação, perfis, caminho, arquivo v2, categorias | Todas independentes. A4 é Sonnet. |
| 2 | A5, A6, B1, C1 + cegos A5, A6 | Malhas, instância 3D (esquema 34), ligações | A6 e B1 Sonnet. |
| 3 | A7, B2, B3, B4, B6, D1, D5 | Integração em `resolverFamilia`, render 3D, planta, corte, operações de edição, símbolos, verificações | B3 e B4 Sonnet. A7 antes das demais que usam `CorpoResolvido`. |
| 4 | B5, B7, C2, C3, C4 + cego C4, D2 | Pick, interface dos corpos e ligações, conexões no projeto, símbolos desenhados | C3 Sonnet. |
| 5 | C5, C6, C7, D3, D4, E2, E3 | Ferramenta Tubo, conexões automáticas, diagnóstico, editor de símbolos, detalhamento, IFC, quantitativos | C5, C6, D4 Sonnet. |
| 6 | F1–F8, G1, G3, D6 | Biblioteca de referência e galeria | F4 Sonnet. |
| 7 | G2, H1, H2 | Abas do editor, E2E, manual | |
| 8 | H3, F-CSG | Opcionais: espelho Rust, vazio real | Só se a QA pedir. |

Caminho crítico: A3/A4 → A5/A6 → A7 → B2/B3/B4 → C3/C5 → C6 → F1 → H1. Demais fichas rodam em paralelo (até 4 por vez).

## 5. Riscos e mitigação
| Risco | Mitigação |
|---|---|
| Geometria 3D errada (varredura, arco, silhueta, corte) | Números analíticos no CONTRATO (N1–N5), **teste cego** por Haiku, propriedades (estanqueidade, normais, volume por tetraedros) |
| Regressão nas famílias de marcenaria | Snapshot da biblioteca inteira antes de mexer no resolvedor (A7); campos todos opcionais |
| Mudança de esquema e colaboração | B1 isolada (Sonnet), migração só avança a versão; testes de `collabHistory`; `check-parity` |
| Desempenho com muitas conexões | Cache de malha por (família, tipo, valores); limite de triângulos por corpo; níveis de detalhe |
| Escopo sem fim | Cinco cenários de aceitação definem "pronto"; vazio real e Rust ficam opcionais (onda 8) |
| Norma técnica inventada | Fichas de biblioteca proíbem inventar valor de norma: parâmetro editável + comentário `CONFERIR:`; o responsável técnico confirma |
| Haiku errar tarefa densa | Fichas pequenas com números, portão do orquestrador, escalada para Sonnet em duas devoluções |
| Sessão terminar no meio | Push depois de cada ficha integrada; `ESTADO.md` como retomada; ficha em curso reinicia (EXECUCAO.md) |

## 6. Fora de escopo (por ora)
Roteamento automático inteligente (cálculo hidráulico, dimensionamento, perda de carga), simulação, família de sistema de parede/piso novas, importar `.rfa`, CSG geral, texturas, UV (já era pendência da 0049), CNC de metálica, interferência (clash) entre disciplinas.
