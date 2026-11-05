import type { ReactElement } from 'react';

/**
 * Ícones de ferramenta no estilo da faixa do Revit: sólidos cinza sombreados em 3D (luz de cima-esquerda),
 * azul para superfícies (piso, forro, ambiente) e laranja para a ação (setas, esboço).
 * Geometria em 32×32; as cores vêm das classes `ic-*` em styles.css e dos degradês de `IconDefs`.
 */
const p = (c: string, d: string, x = ''): string => `<path class="ic-${c}" d="${d}"${x ? ` ${x}` : ''}/>`;

const R: Record<string, string> = {
  roomsep: p('s1', 'M3 3H29V29H3Z') + p('bl', 'M7 11H25V25H7Z') + p('ln', 'M1 18H31'),
  // Seleção e edição
  select: p('s1', 'M8 3V24L13 19L16.5 27L19.8 25.6L16.5 18.2L23 18Z'),
  move: p('s1', 'M11 11H21V21H11Z') + p('ln', 'M16 7V11M16 21V25M7 16H11M21 16H25') + p('fa', 'M16 2L12 7H20ZM16 30L12 25H20ZM2 16L7 12V20ZM30 16L25 12V20Z'),
  copy: p('s3', 'M3 3H19V19H3Z') + p('s1', 'M12 12H28V28H12Z') + p('ac', 'M20 15V25M15 20H25'),
  rotate: p('s1', 'M12 12H20V20H12Z', 'transform="rotate(20 16 16)"') + p('ac', 'M27 16A11 11 0 1 1 21.5 6.5') + p('ac', 'M17 7L21.5 6.5L19.5 2.5'),
  mirror: p('ln ic-ds', 'M16 2V30') + p('s1', 'M13 8L4 24H13Z') + p('s3', 'M19 8L28 24H19Z'),
  array: ['3 5', '12.5 5', '22 5', '3 14', '12.5 14', '22 14'].map((o) => { const [x, y] = o.split(' ').map(Number) as [number, number]; return p('s1', `M${x} ${y}H${x + 7}V${y + 7}H${x}Z`); }).join('') + p('ac', 'M3 26H29M3 24V28M29 24V28'),
  parallel: p('s2', 'M3 4H29V10H3Z') + p('s2', 'M3 22H29V28H3Z') + p('fa', 'M16 11L13 15H19ZM16 21L13 17H19Z'),
  offset: p('ln', 'M4 28V5H28') + p('ac', 'M10 28V11H28M5 20H9'),
  trim: p('ln2', 'M3 20H20V4') + p('ac ic-ds', 'M20 20H29M20 20V29'),
  align: p('ac', 'M6 3V29') + p('s2', 'M9 5H27V11H9Z') + p('s2', 'M9 13H21V19H9Z') + p('s2', 'M9 21H25V27H9Z'),
  joins: p('s2', 'M3 12H11V4H21V12H29V20H21V28H11V20H3Z') + p('ac', 'M11 12H21V20H11Z'),
  split: p('s2', 'M3 11H13V21H3Z') + p('s2', 'M19 11H29V21H19Z') + p('ac ic-ds', 'M16 4V28'),
  measure: `<g transform="rotate(-35 16 16)">${p('s1', 'M1 11H31V21H1Z')}${p('ln', 'M6 11V16M11 11V14M16 11V16M21 11V14M26 11V16')}</g>`,
  rehost: p('s3', 'M3 5H9V27H3Z') + p('s3', 'M23 5H29V27H23Z') + p('ac', 'M12 11H20M20 21H12') + p('fa', 'M21 11L17 8V14ZM11 21L15 18V24Z'),
  attachroof: p('s1', 'M3 15L16 5L29 15Z') + p('s2', 'M6 15H26V28H6Z') + p('ac', 'M16 25V19') + p('fa', 'M16 16L12.5 20.5H19.5Z'),
  detachroof: p('s1', 'M3 10L16 2L29 10Z') + p('s2', 'M6 19H26V29H6Z') + p('ac', 'M16 12V16') + p('fa', 'M16 18L12.5 13.5H19.5Z'),
  sametype: p('bl', 'M4 4H14V14H4Z') + p('bl', 'M18 4H28V14H18Z') + p('bl', 'M4 18H14V28H4Z') + p('bl', 'M18 18H28V28H18Z'),
  samename: p('s1', 'M3 7H29V25H3Z') + '<text class="ic-tx" x="16" y="20" text-anchor="middle">Aa</text>',

  // Editar perímetro (Revit: contorno em L com lápis): L azul com traço laranja e vértices, lápis cinza com ponta laranja.
  editperimeter: p('bl', 'M3 4H17V13H24V24H3Z') + p('ac', 'M3 4H17V13H24V24H3Z') + p('fa', 'M1.8 2.8H4.2V5.2H1.8ZM15.8 2.8H18.2V5.2H15.8ZM15.8 11.8H18.2V14.2H15.8Z') + p('s1', 'M16.6 22.6L24.6 14.6L27.4 17.4L19.4 25.4Z') + p('s3', 'M24.6 14.6L26.2 13L29 15.8L27.4 17.4Z') + p('s3', 'M16.6 22.6L19.4 25.4L13.5 28.5Z') + p('fa', 'M15.2 25.3L16.7 26.8L13.5 28.5Z'),

  // Elementos de arquitetura
  wall: p('s1', 'M4 12L12 7H28L20 12Z') + p('s2', 'M4 12H20V25H4Z') + p('s3', 'M20 12L28 7V20L20 25Z'),
  door: p('s3', 'M8 4H24V28H8Z') + p('s2', 'M8 4L19 6.5V30L8 28Z') + '<circle class="ic-fa" cx="16" cy="18" r="1.3"/>',
  window: p('s2', 'M5 3H27V26H5Z') + p('gl', 'M8 6H15V13H8Z') + p('gl', 'M17 6H24V13H17Z') + p('gl', 'M8 15H15V22H8Z') + p('gl', 'M17 15H24V22H17Z') + p('s3', 'M3 26H29V29H3Z'),
  floor: p('bl', 'M3 14L16 7L29 14L16 21Z') + p('s2', 'M3 14L16 21V25L3 18Z') + p('s3', 'M16 21L29 14V18L16 25Z'),
  slab: p('s1', 'M3 11L16 4L29 11L16 18Z') + p('s2', 'M3 11L16 18V28L3 21Z') + p('s3', 'M16 18L29 11V21L16 28Z'),
  ceiling: p('ln', 'M5 4H27M9 4V13.8M16 4V10M23 4V13.8') + p('bl', 'M3 17L16 10L29 17L16 24Z') + p('ln', 'M9.5 13.5L22.5 20.5M22.5 13.5L9.5 20.5'),
  roof: p('s1', 'M13 10L21 5L31 21L23 26Z') + p('s2', 'M3 26L13 10L23 26Z'),
  slope: p('s3', 'M21 26V12L27 8V22Z') + p('s1', 'M3 26L21 12L27 8L9 22Z') + p('s2', 'M3 26H21V12Z'),
  roofarrow: p('s1', 'M3 24L9 10H29L23 24Z') + p('ac', 'M12 21L19 13M19 13H14.8M19 13V17.2'),
  roofextrusion: p('s3', 'M21 16L28 12V22L21 26Z') + p('s1', 'M3 16Q12 4 21 16L28 12Q19 0 10 12Z') + p('s2', 'M3 26V16Q12 4 21 16V26Z') + p('ac', 'M3 16Q12 4 21 16'),
  stair: p('s2', 'M3 27V20H11V14H19V8H29V27Z'),
  stairrun: p('s1', 'M6 3H26V29H6Z') + p('ln', 'M6 9H26M6 14H26M6 19H26M6 24H26') + p('ac', 'M16 27V9') + p('fa', 'M12 11L16 5L20 11Z'),
  room: p('s1', 'M3 3H29V29H3Z') + p('bl', 'M7 11H25V25H7Z') + p('ln', 'M7 11L25 25M25 11L7 25'),
  dimension: p('ln', 'M5 6V24M27 6V24M5 18H27') + p('ac', 'M3 20L7 16M25 20L29 16') + '<text class="ic-tx" x="16" y="15" text-anchor="middle">12</text>',
  angularDimension: p('ac', 'M5 26H28M5 26L25 7') + p('ac ic-ds', 'M22 26A17 17 0 0 0 18 14') + '<text class="ic-tx" x="22" y="18" text-anchor="middle">30°</text>',
  text: p('ln2', 'M6 27L16 5L26 27M10 20H22'),
  detailLine: p('ln2', 'M4 24L11 9L18 21L27 7') + p('ac', 'M3 27H29'),
  filledRegion: p('bl', 'M5 5H27V27H5Z') + p('ln', 'M5 5L27 27M27 5L5 27'),

  // Documentação e vista
  tag: p('s2', 'M3 6H17L28 17L17 28L3 17Z') + '<circle class="ic-ac" cx="10" cy="13" r="1.5"/>',
  cotasAuto: p('ln', 'M4 4V18M14 4V18M28 4V18M4 14H28') + p('ac', 'M2 16L6 12M12 16L16 12M26 16L30 12') + p('s2', 'M4 21H28V29H4Z') + p('fa', 'M21 3L22 6L25 7L22 8L21 11L20 8L17 7L20 6Z'),
  // Corte: a MARCA DE PLANTA de um lado só — triângulo completo (base 2·r·√2, vértice a r·√2) com a bolha inscrita,
  // preenchido SÓ na parte do triângulo que fica fora da bolha, como as bandeiras de `sectionMarkGeometry`. A base do
  // triângulo aparece apenas de fora da bolha (dentro dela seria a divisória, que fazia o círculo parecer cortado).
  // Bolha grande: centro (16, 19), r = 9 — ocupa o quadro como os outros ícones. Pontos dos gomos gerados pelo
  // próprio resolvedor, normalizados por r.
  section:
    '<path fill="var(--ic-ink)" d="M28.73 19L22.36 12.64L22.96 13.29L23.48 14L23.94 14.76L24.32 15.56L24.61 16.39L24.83 17.24L24.96 18.12L25 19ZM3.27 19L9.64 12.64L9.04 13.29L8.52 14L8.06 14.76L7.68 15.56L7.39 16.39L7.17 17.24L7.04 18.12L7 19ZM16 6.27L9.64 12.64L11 11.52L12.56 10.68L14.24 10.17L16 10L17.76 10.17L19.44 10.68L21 11.52L22.36 12.64Z"/>' +
    p('ln2', 'M3.27 19L16 6.27L28.73 19') +
    p('ln2', 'M3.27 19H7M25 19H28.73') +
    p('ln2', 'M7 19A9 9 0 1 1 25 19A9 9 0 1 1 7 19Z'),
  plan: p('s1', 'M4 4H28V28H4Z') + p('ln2', 'M16 4V16H28M4 21H12') + p('ac', 'M12 21A6 6 0 0 1 18 27'),
  fit: p('ln2', 'M4 11V4H11M21 4H28V11M28 21V28H21M11 28H4V21') + p('s1', 'M11 11H21V21H11Z'),
  grid: p('ln', 'M10 9V29M22 9V29M9 15H29M9 23H29') + '<circle class="ic-s1" cx="10" cy="6" r="3"/><circle class="ic-s1" cx="22" cy="6" r="3"/><circle class="ic-s1" cx="6" cy="15" r="3"/><circle class="ic-s1" cx="6" cy="23" r="3"/>',
  cube: p('s1', 'M16 3L28 10L16 17L4 10Z') + p('s2', 'M4 10L16 17V30L4 23Z') + p('s3', 'M16 17L28 10V23L16 30Z'),
  sun: '<circle class="ic-fa" cx="16" cy="16" r="6"/>' + p('ac', 'M16 3V7M16 25V29M3 16H7M25 16H29M7 7L9.5 9.5M22.5 22.5L25 25M7 25L9.5 22.5M22.5 9.5L25 7'),
  layers: p('s3', 'M3 21L16 15L29 21L16 27Z') + p('s2', 'M3 15L16 9L29 15L16 21Z') + p('bl', 'M3 9L16 3L29 9L16 15Z'),
  schedule: p('s1', 'M4 5H28V27H4Z') + p('s3', 'M4 5H28V11H4Z') + p('ln', 'M4 17H28M4 22H28M13 11V27'),
  type: p('s1', 'M4 5H28V12H4Z') + p('s3', 'M4 14H28V19H4Z') + p('s2', 'M4 21H28V28H4Z'),

  // Faixa completa (padrão Revit): botões de ferramentas que ainda não existem usam `soon` (quadro tracejado).
  soon: p('s1', 'M5 5H27V27H5Z') + p('ln ic-ds', 'M10 10H22V22H10Z'),
  props: p('s1', 'M5 4H27V28H5Z') + p('ln', 'M9 10H23M9 15H23M9 20H18') + p('ac', 'M9 25H14'),
  paste: p('s2', 'M7 6H25V28H7Z') + p('s3', 'M12 3H20V8H12Z') + p('ln', 'M11 14H21M11 18H21M11 22H17'),
  cut: p('s2', 'M4 12H28V22H4Z') + p('ac ic-ds', 'M2 17H30'),
  // Recortar (área de transferência): pasta com tesoura, para não se confundir com Cortar geometria.
  cutscissors: p('s2', 'M3 8H12L15 11H29V27H3Z') + p('s3', 'M3 8H12L15 11H3Z') + p('ac', 'M21 14L28 21M21 22L28 15') + '<circle class="ic-fa" cx="19" cy="13.5" r="2.2"/><circle class="ic-fa" cx="19" cy="22.5" r="2.2"/><circle class="ic-ac" cx="24" cy="18" r="1.2"/>',
  hide: p('s1', 'M2 16C8 6 24 6 30 16C24 26 8 26 2 16Z') + p('ac', 'M5 27L27 5'),
  eye: p('s1', 'M2 16C8 6 24 6 30 16C24 26 8 26 2 16Z') + p('bl', 'M16 11A5 5 0 1 0 16 21A5 5 0 1 0 16 11Z'),
  component: p('s2', 'M6 10H24V28H6Z') + p('s3', 'M6 10L11 5H29L24 10Z') + p('s3', 'M24 10L29 5V23L24 28Z'),
  column: p('s2', 'M11 3H21V29H11Z') + p('s3', 'M8 26H24V29H8Z') + p('s3', 'M8 3H24V6H8Z'),
  beam: p('s2', 'M3 11H29V19H3Z') + p('s3', 'M3 19H29V23H3Z'),
  ramp: p('s1', 'M3 26L29 12V26Z') + p('ac', 'M8 22L22 16'),
  railing: p('ln2', 'M4 9H28') + p('s2', 'M6 9V26M12 9V26M18 9V26M24 9V26') + p('ln', 'M4 26H28'),
  level: p('ln ic-ds', 'M2 21H30') + p('s3', 'M5 9L11 15H-1Z') + p('ac', 'M8 21V8'),
  curtain: p('gl', 'M4 4H28V28H4Z') + p('ln', 'M12 4V28M20 4V28M4 12H28M4 20H28'),
  opening: p('s2', 'M4 4H28V28H4Z') + p('bl', 'M11 11H21V21H11Z'),
  sheet: p('s1', 'M6 3H26V29H6Z') + p('bl', 'M9 7H23V19H9Z') + p('ln', 'M9 23H23M9 26H18'),
  link: p('s1', 'M3 10H17V22H3Z') + p('s3', 'M15 10H29V22H15Z'),
  detail: p('ln2', 'M5 6H27M5 12H27M5 18H21M5 24H15'),
  tl: '<text class="ic-tx" x="16" y="21" text-anchor="middle" style="font-size:15px">TL</text>',
  scale: '<text class="ic-tx" x="16" y="21" text-anchor="middle" style="font-size:12px">1:n</text>',
  style: p('s1', 'M16 3L28 10L16 17L4 10Z') + p('s2', 'M4 10L16 17V30L4 23Z') + p('s3', 'M16 17L28 10V23L16 30Z'),
  crop: p('ln2', 'M9 3V23H29M3 9H23V29'),
  isolate: p('s1', 'M3 10H17V22H3Z') + p('ac', 'M22 8L28 14L22 20'),
  funnel: p('s3', 'M3 5H29L19 17V28L13 24V17Z'),
  nav: p('ln2', 'M16 4A12 12 0 1 0 16 28A12 12 0 1 0 16 4ZM16 8V24M8 16H24'),
  zoom: p('ln2', 'M13 5A8 8 0 1 0 13 21A8 8 0 1 0 13 5ZM19 19L28 28M9 13H17M13 9V17'),
  search: p('ln2', 'M13 5A8 8 0 1 0 13 21A8 8 0 1 0 13 5ZM19 19L28 28'),
  user: p('s3', 'M16 4A5 5 0 1 0 16 14A5 5 0 1 0 16 4Z') + p('s2', 'M5 28C5 19 27 19 27 28Z'),
  // Barra de acesso rápido (sólidos coloridos pequenos, como no Revit).
  qopen: p('s2', 'M3 8H13L16 11H29V26H3Z') + p('ac', 'M3 26L7 15H31L27 26'),
  qsave: p('s2', 'M5 4H24L28 8V28H5Z') + p('bl', 'M9 4H21V12H9Z') + p('s1', 'M9 17H24V28H9Z'),
  qundo: p('ac', 'M12 10L5 16L12 22M5 16H20A6 6 0 0 1 20 28H14'),
  qredo: p('ac', 'M20 10L27 16L20 22M27 16H12A6 6 0 0 0 12 28H18'),
  qhelp: p('bl', 'M16 3A13 13 0 1 0 16 29A13 13 0 1 0 16 3Z') + '<text class="ic-tx" x="16" y="22" text-anchor="middle" style="font-size:17px;fill:#fff">?</text>',
  qclose: p('ac', 'M7 7L25 25M25 7L7 25'),
};

/** Glifos simples de interface (arquivo, setas, editar…), no traço contínuo de antes. */
const P: Record<string, string> = {
  elevation: 'M3 20h18M5 20V6h14v14M8 20v-6h8v6M8 10h2m4 0h2',
  levels: 'M3 6h18M3 12h18M3 18h18M6 4v4m12-4v4m-9 2v4m6-4v4m-9 4v4m12-4v4',
  moon: 'M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10z',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5m5 5H10a6 6 0 0 0 0 12h3',
  save: 'M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7',
  open: 'M3 7h6l2 2h10v10H3zM3 7V5h6l2 2',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4M4 20l1-4',
  chevron: 'M9 6l6 6-6 6',
  up: 'M6 14l6-6 6 6M12 8v12',
  down: 'M6 10l6 6 6-6M12 16V4',
  close: 'M6 6l12 12M18 6 6 18',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01',
};

/** Degradês compartilhados pelos ícones sombreados: renderizar uma vez na raiz da aplicação. */
export function IconDefs(): ReactElement {
  const g = (id: string, a: string, b: string): ReactElement => (
    <linearGradient id={`ic-${id}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor={a} />
      <stop offset="1" stopColor={b} />
    </linearGradient>
  );
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {g('g1', '#ffffff', '#e3e6e9')}
        {g('g2', '#e9ecee', '#bfc5ca')}
        {g('g3', '#b9bfc5', '#8a9198')}
        {g('gb', '#d6ebfc', '#4f9fe0')}
        {g('gg', '#e3ebf2', '#a6b9ca')}
      </defs>
    </svg>
  );
}

export function Icon({ name, size = 20 }: { name: string; size?: number }): ReactElement {
  const shaded = R[name];
  if (shaded !== undefined) {
    // Marcação estática deste arquivo (nunca vem de dados do usuário).
    return <svg className="ic" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" dangerouslySetInnerHTML={{ __html: shaded }} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? ''} />
    </svg>
  );
}
