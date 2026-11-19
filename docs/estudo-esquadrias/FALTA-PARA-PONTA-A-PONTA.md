# O que ainda falta (atualizado em 2026-11-19)

Esta lista substitui a versão anterior, que continha itens já feitos. [V] = verificado; [I] = inferência. Estado geral em `PLANO-ESTADO.md`.

## 1. Limitações conhecidas
- **Parede inclinada:** o vão fica retangular e sai o aviso `forma-vao-ignorada-na-parede` (o prisma do Rust é vertical; doc 33 §3.2) [V].
- **Parede curva com perfil de topo/base:** retangular com aviso `parede-curva-com-perfil` [V]. Parede curva sem perfil usa cortador radial em leque; elevação e DXF de parede curva projetam o contorno pela tangente central (erro de 0,7% em 1,2 m a R=5 m; 4% em 3 m a R=3 m) [V, doc 33].
- **Retorno de acabamento:** sem teste em T nem com vizinha de altura diferente; sem retorno sob topo inclinado [I]. Verga e soleira no retorno retangular não foram dadas (mudaria `2t(W-2t)` por vão; decisão do dono).
- **Folha de correr:** recortada na posição fechada; aberta pode passar do arco por poucos centímetros (decisão do coordenador, docs 37 §5 e 38) [V].
- **Almofada e grade** têm relevo de 6 e 3 mm no mesmo material: de frente parecem lisas, com e sem forma (desenho atual dos estilos) [V, doc 38].
- **Dobradiça e maçaneta** são deslocadas para caber no contorno e deixam de coincidir com a posição do catálogo; na ferradura as ferragens não acompanham o pescoço [V].
- **Corte e elevação** mostram o vão com o perfil e o preenchimento, sem as peças do modelo; corte oblíquo sai retangular [V, doc 29].
- **IFC:** nunca aberto em visualizador nem validado com `ifcopenshell` (não instalado); orientação do perfil e nomes de atributos não conferidos contra o esquema oficial [I]. O import só reconhece perfil com y para cima e base em y mínimo; sem teste com IFC de terceiros [I]. Rebaixo do batente e maçaneta em vão retangular continuam caixa.
- **Normas:** nenhum texto de norma foi lido; os avisos (0,80 x 2,10 m, soleira 5 mm, vidro seguro, transpasse de verga 20 cm) vêm de resumos e fontes secundárias (docs 16, 31). Valor de transpasse com conflito de fonte (20 cm x 30 cm).
- **Dimensões dos 8 tipos de catálogo com forma** são ilustrativas (sem fonte) [V, doc 34].
- **Interface:** alças na planta e na elevação não existem (só diálogo); arraste de vértices do polígono testado só por funções puras, não por eventos do navegador; traduções em es, de, fr, it, pl sem revisão de falante nativo; quadro executivo só em pt/en (outros caem para en).
- **Desempenho:** tempo do furo no navegador e custo do `warp` em parede curva não medidos.
- **Tamanho do wasm:** 4,1 MB (a `main` sozinha tem 3,0 MB); teto subido para 5 MB por decisão do coordenador, a confirmar com o dono. Alternativas: carga sob demanda do furo, `wasm-opt -Oz`.
- **Artifact:** exportar IFC/DXF não funciona (o visualizador não permite download); testado no Chromium localmente e no artifact do claude.ai só por observação do usuário.

## 2. O que fazer a seguir (ordem sugerida)
1. Validar o IFC gerado em visualizador e com `ifcopenshell`/IDS; corrigir o que aparecer.
2. Alças de edição de forma na planta e na elevação.
3. Parede inclinada com vão de contorno (exige prisma inclinado ou furo na malha da camada).
4. Peças no corte e na elevação.
5. Medir desempenho no navegador; decidir sobre carga sob demanda do furo.
6. Dimensões de catálogo e valores de norma com fonte primária (liberar cbic.org.br, buildingSMART, help.autodesk.com, help.graphisoft.com; ou fornecer as normas).
7. Revisão das traduções; quadro executivo em 7 idiomas.
8. Objetos compostos: janela de canto, bay/bow, portões, cobogó (decisão de modelo própria).
