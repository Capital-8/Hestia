# 0061 · Criador de famílias paramétricas (corpos, ligações, representações e redes MEP)

Data: 2026-11-24. Estado: **implementada, com as lacunas listadas no ESTADO** (`docs/familias-parametricas/ESTADO.md`). Estende a ADR 0049 (componentes e editor de famílias) e usa a disciplina da 0060.
Contrato completo: `docs/familias-parametricas/CONTRATO.md`. Plano: `docs/familias-parametricas/PLANO.md`. Execução: `docs/familias-parametricas/EXECUCAO.md`.

## Contexto

O editor de famílias atual é um criador de **móveis de chapa**: peças prismáticas (contorno 2D × espessura), fórmulas, tipos, usinagens, lista de peças, plano de corte. O próprio código admite o limite ("o editor só faz peças prismáticas: nada aqui tem curva de verdade", `disciplinasExemplo.ts`). Para criar tubo, conexão, luminária, caixa de inspeção, fossa, perfil metálico e equipamentos é preciso quatro coisas que hoje não existem: geometria curva paramétrica, pontos de conexão tipados, representações por vista (símbolo 2D) e detalhamento dentro da família. O mapeamento está na conversa de 2026-11-24 e resumido em `PLANO.md` §1.

## Decisões

**D1. Evolução aditiva, sem quebrar o que existe.** Todos os campos novos são opcionais. `Peca`, `Conector`, fórmulas, tipos, catálogo e as 28+ famílias de marcenaria ficam exatamente como estão. `FAMILIA_VERSAO` sobe de 1 para 2 só na ficha `A9`; o leitor aceita 1 e 2; programa antigo recusa a 2 ("mais novo que este programa"), como já faz. `SCHEMA_VERSION` do projeto sobe de 33 para 34 só na ficha `B1` (campos aditivos, migração só avança a versão).

**D2. `Corpo` é o sólido paramétrico, ao lado da `Peca`.** Quatro formas: **extrusão**, **revolução**, **varredura** (perfil ao longo de caminho 3D com raios de curva) e **transição** (mesclagem entre dois perfis). Seções: círculo, anel, retângulo (com raio), retângulo oco, polígono, perfis laminados I, U, L e T. Quadro com origem e rotação 3D por corpo. Tudo dirigido por parâmetros e fórmulas. Não há solver de restrições (mantém a decisão D2 da 0049): a parametrização é por fórmulas sobre o grafo de dependência, como hoje.

**D3. `Ligacao` é um ponto de conexão tipado, distinto do `Conector`.** O `Conector` continua sendo "face da caixa que encosta em outra" (marcenaria). A `Ligacao` é ponto + direção + domínio (água fria, esgoto, eletroduto, ar, estrutural…) + seção (redonda ou retangular) + diâmetro ou largura×altura + fluxo + propriedades. Duas ligações só se unem se os domínios são compatíveis, as direções são opostas e as seções casam. A bitola pode propagar para um parâmetro de instância (`propagaParametro`).

**D4. Representação por vista.** Além da projeção automática (já existe para peças), a família ganha `Simbolo2D` (linha, círculo, arco, polilinha, texto) por vista e plano, com `substituiGeometria` para que o símbolo mande sobre a projeção. Cada `Corpo` pode limitar as vistas em que aparece.

**D5. Detalhamento dentro da família.** `DetalheFamilia` (vista nomeada: planta, corte ou elevação, escala, plano de corte), `CotaFamilia` (entre planos de referência, pontos ou ligações; opcionalmente dirigindo um parâmetro), `TabelaFamilia` (dimensões por tipo) e `Verificacao` (regra por fórmula que gera aviso, ex.: volume útil insuficiente). Sai na prancha quando a família é inserida.

**D6. Instância 3D e redes no projeto.** `Component` ganha `inclinacao` (caimento e peças inclinadas) e `ligacoes` (conexões simétricas com outras instâncias). `Project.sistemasMep` agrupa as redes. Ferramenta de **tubo por trecho** (instancia a família de tubo com comprimento e inclinação entre dois pontos) e **conexões automáticas** por regra (curva, tê, redução) vêm depois do núcleo.

**D7. Categorias e IFC por disciplina.** `CategoriaFamilia` ganha tubulação, conexão, terminal hidráulico, reservatório, eletroduto, dispositivo elétrico, luminária, duto, terminal de ar, perfil e chapa estrutural. A classe IFC sai da categoria (tabela em `CONTRATO.md` §6) ou do campo `Familia.ifc`.

**D8. Fronteira numérica para o Rust.** Como na 0049 §5, a família resolvida é só números em metros e radianos (`CorpoResolvido`, `LigacaoResolvida` em `packages/engine/src/componentes/corposTipos.ts`). **TypeScript é a referência de correção**; o espelho Rust das malhas é a última onda e opcional para a primeira entrega.

**D9. Subtração real (vazio de verdade) fica fora do núcleo.** `vazio` em corpo mostra fantasma e emite aviso na v1. Subtração booleana real é a ficha opcional `F-CSG`, só se a caixa com furos de entrada e saída (caixa de inspeção, fossa) exigir. Alternativa preferida antes disso: modelar a caixa por peças e corpos aditivos com o furo no contorno da peça de parede (já suportado).

**D10. Sem dependência nova.** Nenhuma biblioteca entra em `package.json` nem em `Cargo.toml`. Geometria própria (quadros de Frenet com transporte paralelo, triangulação por `@hestia/geom`).

**D11. Execução por subagentes, Haiku primeiro.** Fichas pequenas, com arquivos permitidos, casos numéricos e portão do orquestrador. Sonnet só onde o raciocínio geométrico ou de estado é denso (arco tangente em 3D, varredura, modelo de rede, ferramenta de tubo). Teste cego nas funções de geometria.

## Consequências

- O contrato de tipos já está no código (somente tipos, ADR 0061, commit de 2026-11-24); a lógica nasce nas fichas.
- A galeria do editor passa a ter categorias de várias disciplinas; já ajustada a contagem em `FamiliaNovo.tsx`.
- O custo mora em geometria curva e em rede; ambos têm famílias de referência de aceitação (tubo com curva 90°, caixa de inspeção, luminária, perfil I) que definem "pronto".
