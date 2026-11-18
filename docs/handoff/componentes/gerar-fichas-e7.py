# Gera as fichas E7 (biblioteca base) a partir da tabela de famílias. Uso: python docs/handoff/componentes/gerar-fichas-e7.py
import pathlib

GRUPOS = {
    'cozinha': ('Cozinha', 'cozinha.ts', 'COZINHA', [
        ('fam_base_gavetas', 'Base com gavetas', 'Carcaça (laterais, base, travessas, fundo, rodapé, tampo) e 3 gavetas empilhadas, cada uma um aninhado de `fam_gaveta` (valores L, A, P por fórmula; alturas por parâmetros que somam o vão). Tipos 60, 80 e 100 de largura.'),
        ('fam_base_pia', 'Base de pia', 'Como o armário baixo (2 portas, sem prateleira) com o tampo recortado para a cuba: uma usinagem `recorte` na face do tampo, centrada, com parâmetros `cubaL` e `cubaP`. Tipos 80, 100 e 120.'),
        ('fam_base_cooktop', 'Base de cooktop', 'Gavetão alto (aninhado `fam_gaveta` tipo alta) e vão livre; tampo com recorte de 560 × 490 centrado (parâmetros). Tipos 60 e 80.'),
        ('fam_aereo', 'Armário aéreo', 'Aéreo com 1 ou 2 portas e N prateleiras; parâmetro `zFixacao` (altura do fundo do móvel em relação ao piso, padrão 1400), A padrão 700 e P 320; sem rodapé nem tampo. Tipos 40, 60 e 80.'),
        ('fam_aereo_basculante', 'Aéreo basculante', 'Porta única basculante (altura menor, A padrão 400, P 320), 2 dobradiças de ferragem `dobradica` por porta, `zFixacao`. Tipos 60, 80 e 100.'),
        ('fam_torre_forno', 'Torre de forno', 'Torre alta (A padrão 2100, L 600): vão do forno de altura `hForno` (padrão 600) com divisórias, gaveta ou porta embaixo e porta em cima; nicho do forno sem porta. Tipos 60 e 70.'),
        ('fam_paneleiro', 'Paneleiro', 'Torre baixa de 4 gavetas altas (aninhados `fam_gaveta` tipo alta) com carcaça completa; A padrão 900, L 400. Tipos 40 e 50.'),
        ('fam_canto_l', 'Canto em L', 'Duas alas formadas por aninhados de `fam_armario_baixo` (tipo com `tampo: "sem"` passado em `valores`), uma girada 90° (rotação `90`), mais UM tampo em L (peça com contorno poligonal) por cima. Parâmetros `ala1` e `ala2` (comprimentos das alas).'),
    ]),
    'dormitorio': ('Dormitório e closet', 'dormitorio.ts', 'DORMITORIO', [
        ('fam_guarda_roupa_modulo', 'Guarda-roupa (módulo)', 'Módulo alto (A padrão 2400, L 450 a 1200, P 600): laterais, base, topo, fundo, divisória central opcional (booleano), 2 prateleiras e 2 portas de abrir (`nPortas` 1 ou 2); barra de cabides como peça `bloco` fina.'),
        ('fam_guarda_roupa_conjunto', 'Guarda-roupa (conjunto)', 'Aninha `fam_guarda_roupa_modulo` N vezes lado a lado (`repetir: nModulos`, 1 a 6, largura `larguraModulo` por módulo, origem em X `(i - 1) * larguraModulo`). L é derivado de `nModulos * larguraModulo`.'),
        ('fam_comoda', 'Cômoda', 'Carcaça baixa (A padrão 900, L 1000, P 480) com 4 gavetas aninhadas (`fam_gaveta`) e tampo; rodapé de 80.'),
        ('fam_criado_mudo', 'Criado-mudo', 'Pequeno (L 500, A 500, P 400): 1 gaveta aninhada e 1 nicho aberto, 4 pés (peças `bloco` de 40 × 40) ou rodapé; tampo.'),
        ('fam_cama_bau', 'Cama com baú', 'Estrado de painéis (laterais, cabeceira, pé, tampa do baú em `painel`) e base; tipos solteiro (880 × 1880), casal (1380 × 1880) e queen (1580 × 1980) como L × P; altura A de 400.'),
        ('fam_painel_tv', 'Painel de TV', 'Painel traseiro e 3 nichos com prateleiras e divisórias, largura `larguraTV` (padrão 1800), altura 1200; tipos 1800 e 2400.'),
    ]),
    'salaAreas': ('Sala, escritório e áreas molhadas', 'salaAreas.ts', 'SALA_AREAS', [
        ('fam_rack', 'Rack', 'Rack baixo (L 1800, A 500, P 400): 3 nichos abertos com divisórias, 2 portas nos nichos laterais, tampo, 4 pés (blocos) ou rodapé.'),
        ('fam_estante', 'Estante', 'Estante aberta (L 800, A 1800, P 300): laterais, base, topo, fundo e `nPrat` prateleiras (1 a 8) distribuídas igualmente.'),
        ('fam_mesa_gaveteiro', 'Mesa com gaveteiro', 'Tampo de 25 mm, painel lateral do lado oposto e um gaveteiro de 3 gavetas (aninhados `fam_gaveta`) no outro lado; L 1400, A 740, P 650.'),
        ('fam_gabinete_banheiro', 'Gabinete de banheiro', 'Gabinete suspenso (`zFixacao` padrão 450), 2 portas, tampo com recorte da cuba (usinagem `recorte` centrada, parâmetros `cubaL` e `cubaP`), L 800, A 500, P 450. Tipos 60, 80 e 100.'),
        ('fam_armario_lavanderia', 'Armário de lavanderia', 'Armário alto (A 1800, L 800, P 400): 2 portas, 3 prateleiras reguláveis, rodapé; tipos 60 e 80.'),
        ('fam_escrivaninha', 'Escrivaninha', 'Tampo de 25 mm sobre 2 painéis laterais e uma prateleira de apoio; L 1200, A 740, P 600; tipos 1000, 1200 e 1500.'),
    ]),
    'geral': ('Famílias básicas', 'geral.ts', 'GERAL', [
        ('fam_modulo_branco', 'Módulo em branco', 'Caixa de chapa mínima: 2 laterais, base, topo e fundo; L 600, A 600, P 400; chapa selecionável. Ponto de partida do usuário.'),
        ('fam_bloco_livre', 'Bloco livre', 'UM bloco (papel `bloco`, eixo z, material livre) de L × P × A: mobília maciça simples; L 500, A 450, P 500.'),
        ('fam_mesa', 'Mesa', 'Tampo e 4 pés (blocos, `espPe` padrão 60) com recuo `recuoPe`; tipos jantar (1600 × 900 × 740) e escritório (1200 × 600 × 740).'),
        ('fam_banco', 'Banco', 'Assento e 4 pernas; L 400, A 450, P 350; tipos baixo (450) e alto (650).'),
        ('fam_prateleira', 'Prateleira suspensa', 'Uma prateleira de chapa (papel `prateleira`) a `zFixacao` (padrão 1200) do piso; L 800, P 250, espessura 25 (chapa mdf25); tipos 600, 800 e 1000.'),
        ('fam_painel_ripado', 'Painel ripado', 'Ripas verticais repetidas (`repetir`) com largura `larguraRipa` e vão `vaoRipa`, `n` calculado a partir de L; moldura opcional (booleano); A 2400.'),
    ]),
}

MODELO = """# Ficha E7-{g} — famílias da biblioteca base: {titulo}

Base: branch `feat/familias-interface` (tudo da E1 à E6 integrado).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
A biblioteca base reúne famílias AUTORAIS (nenhum ativo de terceiros) para criar a maioria dos móveis. Cada família é um objeto `Familia` (veja `packages/model/src/familia/tipos.ts`) escrito à mão, com parâmetros, fórmulas, peças, ferragens, tipos e, quando couber, módulos aninhados. Modelos a seguir: `packages/model/src/familia/exemplos.ts` (`FAMILIA_ARMARIO`, bem comentado) e `packages/model/src/familia/biblioteca/gaveta.ts` (`FAMILIA_GAVETA`, módulo reutilizável que as bases aninham). Leia também `packages/model/src/familia/biblioteca/index.ts` (registro e `IDS_OBRIGATORIOS`), a convenção de peças em `packages/engine/src/componentes/pecas.ts` (eixos, tamanho, espessura, usinagens com `recorte`) e o julgamento em `packages/engine/src/componentes/biblioteca.test.ts` (aceite).

Convenções OBRIGATÓRIAS (o teste confere): medidas em mm; parâmetros `L`, `A`, `P` de instância; id de família `fam_*`; `descricao` com mais de 10 caracteres; pelo menos 2 tipos e `tipoPadrao`; chapas só do catálogo padrão (`packages/model/src/familia/catalogo.ts`: ids mdf6, mdf15, mdf18, mdf25, mdp15, mdp18, com a MESMA espessura em `esp`); fitas só de `fita_pvc` (ou outras do catálogo); ferragens só com id do catálogo (dobradica, corredica, puxador, pino, cavilha, pe, minifix); nenhuma peça abaixo do piso (z ≥ 0), nenhuma peça atravessando outra (volume de interseção ≤ 1e-9 m3), nenhum erro de resolução, em TODOS os tipos e nos valores mínimo e máximo de CADA parâmetro flexionável (por isso escolha `min` e `max` realistas, em que a construção ainda funciona, e use `clamp`/`max` nas fórmulas quando preciso). A família tem de abrir e salvar sem perda. `fam_gaveta` e `fam_armario_baixo` podem ser aninhados (use `aninhados` com `familiaId`, `valores` por fórmula, `origem` e `rotacao`).

## Faça
Escreva as famílias abaixo em `packages/model/src/familia/biblioteca/{arquivo}`, exportando a lista `{lista}` (substitui o `[]` atual). Divida em arquivos de apoio com prefixo `{prefixo}` (um por família ou por pequeno grupo) para nenhum arquivo passar de 420 linhas. Cada família com os ids `fam_*` listados:

{tabela}

Dicas: comece copiando a estrutura de `exemplos.ts` e ajustando; rode `npx vitest run packages/engine/src/componentes/biblioteca.test.ts -t "família fam_"` com frequência e corrija as mensagens (dizem qual peça atravessa qual e em qual valor); as fórmulas de posição devem usar parâmetros derivados (como `zBase`, `hCorpo`) para ficar legíveis; escolha `papel` coerente (`lateral`, `base`, `topo`, `travessa`, `prateleira`, `divisoria`, `fundo`, `porta`, `frente_gaveta`, `tampo`, `rodape`, `painel`, `bloco`).

## Arquivos permitidos
`packages/model/src/familia/biblioteca/{arquivo}` e novos `packages/model/src/familia/biblioteca/{prefixo}*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `index.ts` e os arquivos dos outros grupos, `biblioteca.test.ts`, `gaveta.ts`, `exemplos.ts`, `tipos.ts`, `catalogo.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/biblioteca.test.ts -t "família "` verde para todas as suas famílias (o teste do registro só passa com os 4 grupos integrados), `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Se uma regra do teste for impossível para uma família (por exemplo uma ferragem que não existe no catálogo), PARE e relate qual; não altere testes nem o catálogo.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras, listando por família o que implementou.
"""

pasta = pathlib.Path(__file__).parent / 'fichas'
for g, (titulo, arquivo, lista, fams) in GRUPOS.items():
    tabela = '| id | nome | construção |\n|---|---|---|\n' + '\n'.join(f'| `{i}` | {n} | {d} |' for i, n, d in fams)
    txt = MODELO.format(g=g, titulo=titulo, arquivo=arquivo, lista=lista, prefixo=arquivo.replace('.ts', ''), tabela=tabela)
    (pasta / f'E7-{g}.md').write_text(txt, encoding='utf-8')
print('fichas E7 geradas')
