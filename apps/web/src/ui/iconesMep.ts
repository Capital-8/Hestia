/**
 * Ícones de referência das ferramentas de instalações (MEP): mepTubo, mepJoelho, mepVerificarRede, mepEsgoto.
 * Mesma linguagem de Icon.tsx: geometria 32×32, sólidos cinza sombreados com luz de cima-esquerda (topo/claro `s1`,
 * face esquerda `s2`, face direita/sombra `s3`), azul (`bl`) para o resultado de verificação, laranja (`ac`/`fa`)
 * só para a AÇÃO (eixo, ponto de clique, seta, marca de conferência). Emblemas de sistema (esgoto etc.) levam a cor
 * própria do sistema em `fill` inline, como `materialSphere`, com o mesmo contorno cinza de 1px das classes `ic-s*`.
 * Regras completas em docs/familias-parametricas/icones/GUIA.md. Marcação estática (nunca vem de dados do usuário).
 * Ainda NÃO registrados em Icon.tsx (ficha A4).
 */
const p = (c: string, d: string, x = ''): string => `<path class="ic-${c}" d="${d}"${x ? ` ${x}` : ''}/>`;
/** Sólido de cor própria (emblema de sistema): mesmo contorno cinza e 1px de `.ic-s1`, preenchimento inline. */
const pc = (fill: string, d: string, extra = ''): string => `<path fill="${fill}" stroke="#5b6369" stroke-width="1" d="${d}"${extra ? ` ${extra}` : ''}/>`;

export const ICONES_MEP: Record<string, string> = {
  // Tubo: corpo cilíndrico (duas linhas paralelas, metade clara e metade sombreada), bolsa na ponta e o eixo laranja com ponto de clique e seta.
  mepTubo:
    p('s1', 'M3 10H21V16H3Z') +
    p('s3', 'M3 16H21V22H3Z') +
    p('s2', 'M21 7H27V25H21Z') +
    p('ac', 'M3 29H21') +
    '<circle class="ic-fa" cx="4.5" cy="29" r="2"/>' +
    p('fa', 'M20 26.8L27 29L20 31.2Z'),
  // Joelho: tubo dobrado a 90° (braço horizontal entra, braço vertical sai), bolsas nas duas pontas, eixo laranja com o ponto no vértice.
  mepJoelho:
    p('s1', 'M7 15H15V7H25V26H7Z') +
    p('s3', 'M7 21H21V7H25V26H7Z') +
    p('s2', 'M3 13H7V28H3Z') +
    p('s2', 'M13 3H27V7H13Z') +
    p('ac ic-ds', 'M8 18H18V8') +
    '<circle class="ic-fa" cx="18" cy="18" r="2"/>',
  // Te: tubo reto com ramal a 90° para cima (bolsa na ponta do ramal e na ponta direita; ponta esquerda lisa).
  mepTe:
    p('s1', 'M3 14H23V18H3Z') +
    p('s3', 'M3 18H23V22H3Z') +
    p('s1', 'M12 8H16V14H12Z') +
    p('s3', 'M16 8H20V14H16Z') +
    p('s2', 'M10 3H22V8H10Z') +
    p('s2', 'M23 11H28V25H23Z'),
  // Junção: tubo reto com ramal a 45° para cima e à direita; a bolsa do ramal fica na ponta diagonal.
  mepJuncao:
    p('s1', 'M10 20L15.66 14.34L12.83 11.51L7.17 17.17Z') +
    p('s3', 'M10 20L15.66 14.34L18.49 17.17L12.83 22.83Z') +
    p('s2', 'M11.42 10.1L19.9 18.58L22.02 16.46L13.54 7.98Z') +
    p('s1', 'M3 16H24V20H3Z') +
    p('s3', 'M3 20H24V24H3Z') +
    p('s2', 'M24 13H29V27H24Z'),
  // Redução: bolsa grande à esquerda, cone curto e tubo mais estreito saindo para a direita.
  mepReducao:
    p('s1', 'M9 9L15 13V16H9Z') +
    p('s3', 'M9 16H15V19L9 23Z') +
    p('s1', 'M15 13H29V16H15Z') +
    p('s3', 'M15 16H29V19H15Z') +
    p('s2', 'M3 6H9V26H3Z'),
  // Luva: manguito curto (corpo e duas bolsas) atravessado pelo tubo, que entra pelos dois lados.
  mepLuva:
    p('s1', 'M3 13H12V16H3ZM20 13H29V16H20Z') +
    p('s3', 'M3 16H12V19H3ZM20 16H29V19H20Z') +
    p('s1', 'M12 11H20V16H12Z') +
    p('s3', 'M12 16H20V21H12Z') +
    p('s2', 'M8 8H12V24H8Z') +
    p('s2', 'M20 8H24V24H20Z'),
  // Tampão: tubo com bolsa à direita e a ponta esquerda fechada por um fundo (placa com aba).
  mepTampao:
    p('s1', 'M9 13H22V16H9Z') +
    p('s3', 'M9 16H22V19H9Z') +
    p('s2', 'M22 10H28V22H22Z') +
    p('s2', 'M4 10H9V22H4Z') +
    p('s1', 'M2 11H4V21H2Z'),
  // Prumada: tubo horizontal que sobe em L (joelho) para um tubo vertical; seta laranja para cima (subir).
  mepPrumada:
    p('s1', 'M3 19H20V22H3Z') +
    p('s3', 'M3 22H20V25H3Z') +
    p('s1', 'M20 8H23V25H20Z') +
    p('s3', 'M23 8H26V25H23Z') +
    p('s2', 'M18 4H28V8H18Z') +
    p('ac', 'M12 17V10') +
    p('fa', 'M8.5 11L12 6L15.5 11Z'),
  // Verificar rede: rede (tronco e ramais com nós) e o selo azul com a marca de conferência laranja.
  mepVerificarRede:
    p('ln2', 'M5 8H27M11 8V20M21 8V12') +
    '<circle class="ic-s2" cx="5" cy="8" r="2.5"/>' +
    '<circle class="ic-s2" cx="27" cy="8" r="2.5"/>' +
    '<circle class="ic-s2" cx="11" cy="20" r="2.5"/>' +
    '<circle class="ic-s2" cx="21" cy="13" r="2.5"/>' +
    '<circle class="ic-bl" cx="22" cy="23" r="7"/>' +
    p('ac', 'M18.5 23L21 25.5L26 20'),
  // Esgoto: emblema de sistema, disco marrom com um tubo que desce (queda) em branco.
  mepEsgoto:
    pc('#8a5a2b', 'M16 3A13 13 0 1 0 16 29A13 13 0 1 0 16 3Z') +
    pc('#ffffff', 'M5.5 10H21V26H14V17H5.5Z'),
  // Tubos e conexões (Biblioteca): duas peças soltas numa vitrine, um joelho atrás (alto à direita) e um tubo reto na frente, com selo azul de biblioteca.
  mepTubosConexoes:
    p('s1', 'M16 6H19V14H16Z') +
    p('s3', 'M19 6H22V14H19Z') +
    p('s2', 'M14 2H24V6H14Z') +
    p('s1', 'M16 8H28V11H16Z') +
    p('s3', 'M16 11H28V14H16Z') +
    p('s1', 'M2 18H16V22H2Z') +
    p('s3', 'M2 22H16V26H2Z') +
    p('s2', 'M16 15H22V29H16Z') +
    p('bl', 'M23 22H30V30H23Z') +
    p('ln', 'M25 25H28M25 27.5H28'),
  // Catálogo de tubos (tabelas do fabricante): planilha com cabeçalho e coluna de bitolas, e o anel (perfil do tubo) ao lado.
  mepCatalogoTubos:
    p('s1', 'M3 6H17V26H3Z') +
    p('s2', 'M3 6H17V11H3Z') +
    p('ln', 'M8 11V26M3 16H17M3 21H17M4.5 13.5H6.5M4.5 18.5H6.5M4.5 23.5H6.5') +
    p('s2', 'M29.5 19A5.5 5.5 0 1 1 18.5 19A5.5 5.5 0 1 1 29.5 19ZM26.5 19A2.5 2.5 0 1 0 21.5 19A2.5 2.5 0 1 0 26.5 19Z'),
  // Eletrodutos e dispositivos (Biblioteca elétrica): eletroduto reto entrando numa caixa de passagem, com o raio azul (selo, não ação) na face.
  mepEletrodutos:
    p('s1', 'M3 13H20V17H3Z') +
    p('s3', 'M3 17H20V21H3Z') +
    p('s1', 'M20 8L23 5H30L27 8Z') +
    p('s2', 'M20 8H27V26H20Z') +
    p('s3', 'M27 8L30 5V23L27 26Z') +
    p('bl', 'M25.5 10L21.5 18H24.5L22 24L26.5 16H23.5Z'),
  // Dutos e difusores (Biblioteca de HVAC): duto retangular que vai para a direita e termina num difusor quadrado com grelha.
  mepDutos:
    p('s2', 'M3 13H17V19H3Z') +
    p('s1', 'M3 13L6 10H20L17 13Z') +
    p('bl', 'M17 10H29V22H17Z') +
    p('ln', 'M20 13H26M20 16H26M20 19H26'),
  // Perfis e chapas / parafuso e chapa (Biblioteca de estrutura): perfil em I de pé sobre uma chapa de base, com um parafuso na chapa.
  mepPerfisChapas:
    p('s1', 'M3 24L6 21H30L27 24Z') +
    p('s2', 'M3 24H27V27H3Z') +
    p('s3', 'M27 24L30 21V24L27 27Z') +
    p('s1', 'M7 5L9 3H21L19 5Z') +
    p('s3', 'M19 5L21 3V6L19 8Z') +
    p('s3', 'M19 19L21 17V20L19 22Z') +
    p('s2', 'M7 5H19V8H14.5V19H19V22H7V19H11.5V8H7Z') +
    p('s2', 'M23 15.5H28V22H23Z') +
    '<circle class="ic-s1" cx="25.5" cy="15.5" r="2.5"/>',
};
