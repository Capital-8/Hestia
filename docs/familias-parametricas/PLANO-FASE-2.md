# Fase 2 — famílias nos menus certos, materiais e roteamento de tubulação

Registrado em 2026-11-24, depois da entrega da fase 1 (ADR 0061; `ESTADO.md`). Decisões do dono desta data estão marcadas **[APROVADO]**; o resto é proposta aguardando aprovação. Nada aqui está implementado.

## 1. Cada família no menu a que pertence **[APROVADO]**

Problema: os botões da faixa foram ligados à mão. O painel "Tubulação" ficou na aba Inserir enquanto a aba Sistemas segue placeholder ("em breve"); móveis, elétrica, HVAC, caixas e perfis só se alcançam pela Biblioteca ou pela galeria do editor.

Solução: **uma tabela única categoria → destino na faixa**, no modelo (ao lado de `categorias.ts`). A categoria que a pessoa escolhe no editor decide sozinha onde a família aparece.

| Categoria | Aba | Painel |
|---|---|---|
| marcenaria, mobiliário, louças, equipamento, genérico | Arquitetura | Componentes (Biblioteca) |
| tubulação, conexão de tubo, terminal hidráulico, reservatório | Sistemas | Hidráulica e tubulação |
| eletroduto, dispositivo elétrico, luminária | Sistemas | Elétrico |
| duto, terminal de ar | Sistemas | HVAC |
| perfil e chapa estrutural | Estrutura (e Aço) | Perfis, Chapas, Conexões |

Fichas (ordem):
- **J1** tabela de destinos + teste de contrato (toda categoria tem destino; todo painel da faixa aponta para categoria existente).
- **J2** componente de faixa "painel de famílias": botão grande + **galeria suspensa** por painel (**[APROVADO]**: galeria, não um botão por tipo), listando biblioteca, projeto e Meus modelos da categoria (modelo: `DrawGalleryPanel`).
- **J3** abas Sistemas, Aço, Estrutura e Arquitetura usando o J2; Tubo e "Verificar rede" vão para Sistemas > Hidráulica e tubulação; o painel "Tubulação" de Inserir some ou vira atalho.
- **J4** quantitativos, IFC e a galeria do editor passam a ler a mesma tabela (uma só lista de categorias).
- **J5 (estrutura, caminho barato primeiro [APROVADO])**: perfis e chapas aparecem em Estrutura/Aço como componentes. **J5b (depois, caminho correto)**: o perfil vira o tipo da Viga e do Pilar nativos (muda modelo e esquema; ficha própria).

## 2. Materiais configuráveis (proposta)

Medido no código: todo **corpo** usa o material fixo `comp_corpo` (cor de carvalho `#c9a176`) no 3D do projeto; o `material` do corpo só vale no editor e só como cor `#rrggbb`. As peças usam o mapa de `acabamentos.ts` (ids `mat_metal`, `mat_ceramica` etc. viram acabamentos de móvel; o resto cai no padrão madeira). Por isso tubos, caixas e perfis saem "de madeira".

- **K1** corpo passa a resolver o material como a peça: id de material do projeto, ou parâmetro `material`, ou `mat_*` do mapa; sem material = cinza neutro (não madeira).
- **K2** catálogo de materiais de instalações/estrutura (PVC branco, PVC marrom, cobre, aço galvanizado, aço, concreto, vidro, alumínio, cerâmica) com cor, brilho e hachura de corte.
- **K3** editor de famílias: seletor de material por corpo e por peça (lista de materiais do projeto + parâmetro `material`), com amostra; "Materiais" na aba Gerenciar deixa de ser desabilitado.
- **K4** materiais por tipo (PVC esgoto marrom, água fria azul) vindos da família; teste de que nenhuma família MEP resolve para madeira.

## 3. Roteamento de tubulação como no Revit (proposta)

Hoje: conexão automática só para esgoto (`CONEXOES_POR_DOMINIO`): 180° liga direto, 90° curva 90°, 45° (desvio) curva 45°, redução quando o DN muda, tê a 90° e junção a 45°; tolerância de 2,5°; ângulo sem regra gera aviso. Casamento por DN (0,5 mm) e domínio já é validado pelo encaixe. Lacunas: só esgoto; sem "tipo de tubulação"; sem encurtar o tubo pelo encaixe da conexão; sem lista de bitolas permitidas.

- **L1** **Tipo de tubulação** (equivalente às preferências de roteamento do Revit): por sistema/material declara a família do tubo, as conexões preferidas por ângulo (90°, 45°, 22,5° se existir), tê, junção, redução, luva, tampão, as bitolas permitidas (DN) e os ângulos permitidos. A ferramenta Tubo escolhe o tipo, não a família solta.
- **L2** Regras por tipo no lugar do mapa fixo: água fria (joelho 90°/45°, tê, redução, luva, união), eletroduto, ar.
- **L3** Casamento por bitola garantido: joelho DN 25 só entra em tubo DN 25; mudança de DN insere redução; bitola fora da lista é recusada com motivo.
- **L4** Ângulo permitido: só os ângulos que o tipo oferece; outro ângulo é recusado ou arredondado ao permitido, com aviso (nada de curva inventada); o 3D e a planta mostram o ângulo.
- **L5** Encurtar os tubos pelo braço/encaixe da conexão e posicionar a conexão no vértice, para o tubo não atravessar a peça.
- **L6** Roteiro de navegador: tubo de água fria DN 25 com curva 90°, 45°, tê e redução.

## 4. Inclinação do tubo na interface (proposta)

Medido: o modelo guarda a inclinação a partir da VERTICAL (`inclinacao[0]`: 0 = em pé, π/2 = deitado) porque o eixo local do tubo é o Z da família. Está consistente, mas é ruim para o usuário: o painel mostra 90° para um tubo horizontal.
- **M1** painel MEP mostra **declividade (%)** e **ângulo em relação à horizontal** (0° = horizontal), convertendo de/para o campo interno (que não muda); editar a declividade inclina o trecho mantendo a extremidade.
- **M2** a ferramenta Tubo aceita declividade (ex.: 1 %) ao desenhar em planta (cota do ponto final), e o Verificar rede usa a mesma conversão.

## Ordem sugerida
J1 → J2 → J3 → J4 → J5; K1 → K2 → K3 → K4; M1 → M2; L1 → L2 → L3 → L4 → L5 → L6; J5b por último.
