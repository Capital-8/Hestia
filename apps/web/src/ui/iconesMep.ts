/**
 * Ícones das ferramentas de instalações (MEP): peças, bibliotecas e emblemas de sistema (esgoto, água fria, elétrico, HVAC, estrutura).
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
/** Disco r=13 centrado em 16,16 dos emblemas de sistema (a cor e o glifo entram por `pc`). */
const DISCO = 'M16 3A13 13 0 1 0 16 29A13 13 0 1 0 16 3Z';

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
  // Junção: tubo reto com ramal a 45° para cima e à direita. O ramal tem 5 de largura e a bolsa 7, na ponta diagonal; a base
  // do ramal fica dentro do tubo reto, que é desenhado por cima (o ângulo de 45° é o eixo do ramal).
  mepJuncao:
    p('s1', 'M10.23 17.77L18.36 9.64L16.6 7.87L8.46 16Z') +
    p('s3', 'M10.23 17.77L18.36 9.64L20.13 11.4L12 19.54Z') +
    p('s2', 'M15.89 7.16L20.84 12.11L23.67 9.28L18.72 4.33Z') +
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
  // Tampão: tubo curto com bolsa à direita e, na ponta esquerda, uma tampa larga e escura (s3, 18 de altura) que fecha o tubo. Sem eixo.
  mepTampao:
    p('s1', 'M8 13H22V16H8Z') +
    p('s3', 'M8 16H22V19H8Z') +
    p('s2', 'M22 10H28V22H22Z') +
    p('s3', 'M3 7H8V25H3Z'),
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
  // Emblemas de sistema: disco de cor própria com glifo branco (sem laranja). Esgoto: sifão em U com seta para baixo saindo.
  mepEsgoto:
    pc('#8a5a2b', DISCO) +
    pc('#ffffff', 'M10 6H14V14A2 2 0 0 0 18 14V6H22V14A6 6 0 0 1 10 14Z') +
    pc('#ffffff', 'M15 20H17V23.5H20L16 27.5L12 23.5H15Z'),
  // Água fria: gota d'água branca.
  mepAguaFria:
    pc('#2a7fd4', DISCO) +
    pc('#ffffff', 'M16 7C16 7 10 13.5 10 19.5A6 6 0 0 0 22 19.5C22 13.5 16 7 16 7Z'),
  // Elétrico: raio branco.
  mepEletrico:
    pc('#d4a017', DISCO) +
    pc('#ffffff', 'M18.5 5.5L8.5 17.5H14.5L12.5 26.5L23.5 13.5H17.5L19.5 5.5Z'),
  // HVAC: ventilador de três pás com cubo (pás a 0°, 120° e 240°).
  mepHvac:
    pc('#2fa36b', DISCO) +
    pc('#ffffff', 'M16 16C13.2 12.8 13.2 7 16 4.5C18.8 7 18.8 12.8 16 16Z') +
    pc('#ffffff', 'M16 16C20.17 15.18 25.19 18.08 25.96 21.75C22.39 22.93 17.37 16.83 16 16Z') +
    pc('#ffffff', 'M16 16C11.83 15.18 6.81 18.08 6.04 21.75C9.61 22.93 14.63 16.83 16 16Z') +
    '<circle fill="#ffffff" stroke="#5b6369" stroke-width="1" cx="16" cy="16" r="2"/>',
  // Estrutura: perfil em I branco (viga), no disco cinza-grafite.
  mepEstrutura:
    pc('#6b7280', DISCO) +
    pc('#ffffff', 'M8 8H24V11H18.5V21H24V24H8V21H13.5V11H8Z'),
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
