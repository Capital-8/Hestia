# Fase 2 — famílias nos menus certos, materiais e roteamento de tubulação

Registrado em 2026-11-24, depois da entrega da fase 1 (ADR 0061; `ESTADO.md`).

**Situação: TUDO abaixo foi aprovado pelo dono em 2026-11-24 para execução FUTURA ("vamos seguir, porém não agora"). Nada está implementado nem foi iniciado. Não comece antes de o dono pedir.** O ponto de partida para quem retomar (inclusive em máquina local) é `RETOMADA-LOCAL.md`. Os blocos J já tinham sido aprovados item a item; K, L, M, N, O, P e Q foram aprovados em bloco depois dos comentários e podem ser refinados ao escrever cada ficha.

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

## 2. Materiais configuráveis [APROVADO]

Medido no código: todo **corpo** usa o material fixo `comp_corpo` (cor de carvalho `#c9a176`) no 3D do projeto; o `material` do corpo só vale no editor e só como cor `#rrggbb`. As peças usam o mapa de `acabamentos.ts` (ids `mat_metal`, `mat_ceramica` etc. viram acabamentos de móvel; o resto cai no padrão madeira). Por isso tubos, caixas e perfis saem "de madeira".

- **K1** corpo passa a resolver o material como a peça: id de material do projeto, ou parâmetro `material`, ou `mat_*` do mapa; sem material = cinza neutro (não madeira).
- **K2** catálogo de materiais de instalações/estrutura (PVC branco, PVC marrom, cobre, aço galvanizado, aço, concreto, vidro, alumínio, cerâmica) com cor, brilho e hachura de corte.
- **K3** editor de famílias: seletor de material por corpo e por peça (lista de materiais do projeto + parâmetro `material`), com amostra; "Materiais" na aba Gerenciar deixa de ser desabilitado.
- **K4** materiais por tipo (PVC esgoto marrom, água fria azul) vindos da família; teste de que nenhuma família MEP resolve para madeira.

## 3. Roteamento de tubulação como no Revit [APROVADO]

Hoje: conexão automática só para esgoto (`CONEXOES_POR_DOMINIO`): 180° liga direto, 90° curva 90°, 45° (desvio) curva 45°, redução quando o DN muda, tê a 90° e junção a 45°; tolerância de 2,5°; ângulo sem regra gera aviso. Casamento por DN (0,5 mm) e domínio já é validado pelo encaixe. Lacunas: só esgoto; sem "tipo de tubulação"; sem encurtar o tubo pelo encaixe da conexão; sem lista de bitolas permitidas.

- **L1** **Tipo de tubulação** (equivalente às preferências de roteamento do Revit): por sistema/material declara a família do tubo, as conexões preferidas por ângulo (90°, 45°, 22,5° se existir), tê, junção, redução, luva, tampão, as bitolas permitidas (DN) e os ângulos permitidos. A ferramenta Tubo escolhe o tipo, não a família solta.
- **L2** Regras por tipo no lugar do mapa fixo: água fria (joelho 90°/45°, tê, redução, luva, união), eletroduto, ar.
- **L3** Casamento por bitola garantido: joelho DN 25 só entra em tubo DN 25; mudança de DN insere redução; bitola fora da lista é recusada com motivo.
- **L4** Ângulo permitido: só os ângulos que o tipo oferece; outro ângulo é recusado ou arredondado ao permitido, com aviso (nada de curva inventada); o 3D e a planta mostram o ângulo.
- **L5** Encurtar os tubos pelo braço/encaixe da conexão e posicionar a conexão no vértice, para o tubo não atravessar a peça.
- **L6** Roteiro de navegador: tubo de água fria DN 25 com curva 90°, 45°, tê e redução.

## 4. Inclinação do tubo na interface [APROVADO]

Medido: o modelo guarda a inclinação a partir da VERTICAL (`inclinacao[0]`: 0 = em pé, π/2 = deitado) porque o eixo local do tubo é o Z da família. Está consistente, mas é ruim para o usuário: o painel mostra 90° para um tubo horizontal.
- **M1** painel MEP mostra **declividade (%)** e **ângulo em relação à horizontal** (0° = horizontal), convertendo de/para o campo interno (que não muda); editar a declividade inclina o trecho mantendo a extremidade.
- **M2** a ferramenta Tubo aceita declividade (ex.: 1 %) ao desenhar em planta (cota do ponto final), e o Verificar rede usa a mesma conversão.

## 5. Desempenho do pan, zoom e seleção [APROVADO] (fazer primeiro)

Relato do dono: depois dos tubos e conexões o app fica lento no pan, no zoom e em qualquer interação. NÃO MEDIDO ainda; hipóteses a confirmar:
- a silhueta dos corpos na planta (união de triângulos com `union`, `projetarCorposPlanta`) é recalculada a cada desenho, por instância;
- o pick de componente na planta (`pegadaParaClique` em `packages/tools/src/pick.ts`) recalcula a silhueta de CADA componente a cada movimento do mouse;
- a malha dos corpos (`malhaDosCorpos`) é gerada em vários lugares (3D, planta, corte, caixa, pegada, IFC) sem cache comum; curvas e círculos têm muitos triângulos;
- peças iguais viram malhas separadas (sem instanciamento);
- pan e zoom não deveriam recalcular geometria.

Fichas:
- **N1** medir: projeto de teste com ~200 trechos e conexões (script reprodutível em `scripts/`), usando a sobreposição de desempenho e os benchmarks já existentes (`apps/web/src/debug/perf`, `scripts/bench-*`); registrar tempos de quadro em pan, zoom, seleção por clique e movimento do mouse, e os 5 maiores custos por perfil de CPU. Resultado vai para `docs/familias-parametricas/desempenho/`.
- **N2** cache único por (família, tipo, valores): malha, silhueta, caixa e pegada, invalidado só quando a família muda; todos os consumidores (3D, planta, corte, pick, IFC, quantitativos) usam o mesmo.
- **N3** pan e zoom sem recálculo de geometria (só matriz de vista); pick com índice espacial (caixa por instância) e sem recalcular silhueta no mouse move.
- **N4** nível de detalhe por zoom (menos segmentos em curvas e círculos longe) e instanciamento de peças iguais no 3D.
- **N5** teste de orçamento de tempo (falha se o projeto de ~200 trechos passar de um limite definido no N1) para a lentidão não voltar.

## 6. Conexão automática que encaixa pelas ligações [APROVADO]

Relato do dono: na tubulação de esgoto a conexão ficou certa numa ponta e fora na outra. Causa provável (NÃO reproduzida): `posicionarConexao` coloca a conexão com a ORIGEM no ponto de encontro, mas as ligações dela ficam afastadas da origem (braços); os tubos não são encurtados; a posição não é resolvida pelas ligações.
- **O1** reproduzir com teste (curva 90°, 45°, tê, junção, redução) e medir o afastamento entre as ligações de cada par.
- **O2** posicionar a conexão pelas LIGAÇÕES: achar posição e rotação em que uma ligação encosta na ponta de um tubo e a outra na ponta do outro (transformação rígida); depois levar a ponta de cada tubo até a ligação da conexão (encurtar/alongar).
- **O3** teste de regressão: depois de qualquer conexão automática TODO par de ligações conectado tem distância < 0,5 mm e direções opostas; o `diagnosticarRede` continua acusando afastamento > 5 mm.
- **O4** roteiro de navegador de esgoto com curvas, tê e redução conferindo os pares.

## 7. Medidas reais e encaixe por dentro (bolsa) [APROVADO]

- **P1** contrato: `Ligacao` ganha `encaixe?: { tipo: 'bolsa' | 'ponta'; profundidade: Expr }`; `ligacoesCompativeis` passa a exigir bolsa × ponta (ou ponta × ponta/bolsa × bolsa quando a família declarar luva dupla), e o diâmetro interno da bolsa igual ao externo da ponta (tolerância de 0,5 mm).
- **P2** geometria: o tubo (ponta) ENTRA na bolsa da conexão até a profundidade do catálogo; a conexão tem bolsa oca (diâmetro interno = De do tubo); o comprimento de corte e o quantitativo do tubo consideram a parte que entra.
- **P3** catálogo como DADO editável (por fabricante ou série), não dentro do código: tubo (De, espessura, comprimentos comerciais) e conexões (braços, profundidade da bolsa, raios) por bitola. Os valores vêm de catálogo/norma e são conferidos por quem responde tecnicamente; NÃO escrever valor de fabricante de memória. Esgoto: o De do PVC de esgoto NÃO é igual ao DN (hoje a F1 usa De = DN: corrigir); água fria soldável por De.
- **P4** reescrever as famílias de esgoto e água fria com o catálogo e a bolsa; conferir com o teste de aceitação do motor (`bibliotecaMep.motor.test.ts`).
- **P5** os mesmos princípios para eletroduto e duto (encaixe por luva) onde houver.

## 8. Planta pela representação paramétrica [APROVADO]

A planta passa a mostrar a vista de cima da geometria real (nível grosso: contorno simples ou eixo; médio e fino: contorno real). O símbolo 2D fica só para o que tem convenção de desenho (tomada, interruptor, registro, ralo), como opção da família.
- **Q1** silhueta com furos e paredes: tubo e conexão em duas linhas (paredes) e curvas com o contorno certo, em vez de disco cheio (usa o cache do N2).
- **Q2** peças inclinadas acompanham os corpos na planta (hoje peças continuam 2D com `inclinacao`).
- **Q3** `substituiGeometria` também no corte e na elevação.

## Ordem sugerida
1. **N1–N5** (desempenho; medir antes de mexer; atrapalha todo teste do dono).
2. **O1–O4** (conexão encaixa pelas ligações).
3. **P1–P5** (medidas reais e bolsa) com **Q1–Q3** (planta) em seguida, pois usam a mesma geometria.
4. **J1–J5** (menus por categoria) e **K1–K4** (materiais) podem andar em paralelo com 2 e 3.
5. **M1–M2** (declividade na interface) e **L1–L6** (tipo de tubulação) depois de O e P, porque dependem das conexões e das medidas.
6. **J5b** (perfil como tipo da Viga e do Pilar nativos) por último.
