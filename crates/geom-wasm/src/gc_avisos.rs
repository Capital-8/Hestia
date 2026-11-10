//! Medidas geométricas para os avisos de norma do guarda-corpo (decisão 0055, Fase 4a): consulta `guarda_avisos` (ADR §6.2 e §8.1).
//!
//! O Rust só mede; o TS decide texto e severidade. Cada aviso é `[guarda_num, codigo, trecho, indice]` com `[medido, limite, x, y, z]`.
//! Desdobramento 2D (§8.1): `s` é o comprimento horizontal e `h` a altura sobre o hospedeiro. Balaústres e postes são faixas verticais em `s`,
//! trilhos são faixas horizontais em `h`. A maior esfera que passa por uma célula livre é `min(largura, altura)`.

use crate::gc_planta::na_grade;

/// Códigos de aviso (coluna `codigo`).
pub const AV_VAO_GRANDE: u32 = 1;
pub const AV_VAO_INFERIOR: u32 = 2;
pub const AV_CORRIMAO_ALTURA: u32 = 3;
pub const AV_CORRIMAO_EXTENSAO: u32 = 4;
pub const AV_ALTURA_BAIXA: u32 = 5;
/// Avisos de geometria degenerada (ADR §23): vêm do caminho e da distribuição, o app só traduz o texto.
pub const AV_HOSPEDEIRO_DESCONTINUO: u32 = 6;
pub const AV_DESLOCAMENTO_EXCEDE: u32 = 7;
pub const AV_TRECHO_CURTO: u32 = 8;
pub const AV_CAMINHO_REPETIDO: u32 = 9;
pub const AV_CAMINHO_NULO: u32 = 10;
pub const AV_SEM_BORDA: u32 = 11;
pub const AV_PERFIL_AUTO_INTERSECTA: u32 = 12;
pub const AV_PADRAO_NAO_CABE: u32 = 13;
pub const AV_PADRAO_COMPRIMIDO: u32 = 14;
pub const AV_VAO_SEM_ESPACO: u32 = 15;
pub const AV_SOBRA_CURTA: u32 = 16;

#[derive(Clone, Debug, PartialEq)]
pub struct Aviso {
    pub guarda: u32,
    pub codigo: u32,
    pub trecho: u32,
    pub indice: u32,
    pub medido: f64,
    pub limite: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Desenho 2D de um vão de guarda-corpo: obstáculos verticais (`s0, s1`) e horizontais (`h0, h1`), no retângulo `[0, comprimento] x [0, altura]`.
#[derive(Clone, Debug, Default)]
pub struct VaoGC {
    pub comprimento: f64,
    pub altura: f64,
    pub verticais: Vec<(f64, f64)>,
    pub horizontais: Vec<(f64, f64)>,
}

/// Une intervalos ocupados e devolve os livres dentro de `[a, b]`.
fn livres(ocupados: &[(f64, f64)], a: f64, b: f64) -> Vec<(f64, f64)> {
    let mut o: Vec<(f64, f64)> = ocupados.iter().copied().filter(|&(x, y)| y > a && x < b).collect();
    o.sort_by(|p, q| p.0.total_cmp(&q.0));
    let mut out = Vec::new();
    let mut cur = a;
    for (x, y) in o {
        if x > cur {
            out.push((cur, x.min(b)));
        }
        cur = cur.max(y);
    }
    if cur < b {
        out.push((cur, b));
    }
    out
}

/// Maior esfera (diâmetro, m) que passa por alguma célula livre de `v` na faixa de alturas `[h_min, h_max]`; devolve também o centro `(s, h)`.
pub fn maior_esfera(v: &VaoGC, h_min: f64, h_max: f64) -> Option<(f64, f64, f64)> {
    let hs = livres(&v.horizontais, h_min.max(0.0), h_max.min(v.altura));
    let ss = livres(&v.verticais, 0.0, v.comprimento);
    let mut melhor: Option<(f64, f64, f64)> = None;
    for &(s0, s1) in &ss {
        for &(h0, h1) in &hs {
            let d = (s1 - s0).min(h1 - h0);
            if d > 0.0 && melhor.is_none_or(|m| d > m.0) {
                melhor = Some((d, (s0 + s1) / 2.0, (h0 + h1) / 2.0));
            }
        }
    }
    melhor
}

/// `gc-vao-grande`: a maior esfera entre `folga_inferior` e `altura_min` passa por uma abertura maior que `esfera_max`?
pub fn aviso_vao_grande(guarda: u32, trecho: u32, v: &VaoGC, folga_inferior: f64, altura_min: f64, esfera_max: f64) -> Option<Aviso> {
    let (d, s, h) = maior_esfera(v, folga_inferior, altura_min)?;
    (d > esfera_max + 1e-9).then(|| Aviso { guarda, codigo: AV_VAO_GRANDE, trecho, indice: 0, medido: na_grade(d), limite: esfera_max, x: s, y: 0.0, z: h })
}

/// `gc-vao-inferior`: folga entre a base do preenchimento e o hospedeiro maior que o máximo.
pub fn aviso_vao_inferior(guarda: u32, trecho: u32, folga: f64, maximo: f64) -> Option<Aviso> {
    (folga > maximo + 1e-9).then(|| Aviso { guarda, codigo: AV_VAO_INFERIOR, trecho, indice: 0, medido: na_grade(folga), limite: maximo, x: 0.0, y: 0.0, z: 0.0 })
}

/// `gc-corrimao-altura`: topo do corrimão (medido da linha das quinas) fora de `[min, max]`.
pub fn aviso_corrimao_altura(guarda: u32, trecho: u32, indice: u32, altura: f64, min: f64, max: f64) -> Option<Aviso> {
    let limite = if altura < min { min } else if altura > max { max } else { return None };
    (((altura - limite).abs()) > 1e-9).then(|| Aviso { guarda, codigo: AV_CORRIMAO_ALTURA, trecho, indice, medido: na_grade(altura), limite, x: 0.0, y: 0.0, z: 0.0 })
}

/// `gc-corrimao-extensao`: extensão (m) menor que a mínima. `indice` 0 = início, 1 = fim.
pub fn aviso_corrimao_extensao(guarda: u32, trecho: u32, indice: u32, extensao: f64, minima: f64) -> Option<Aviso> {
    (extensao < minima - 1e-9).then(|| Aviso { guarda, codigo: AV_CORRIMAO_EXTENSAO, trecho, indice, medido: na_grade(extensao), limite: minima, x: 0.0, y: 0.0, z: 0.0 })
}

/// `gc-altura-baixa`: altura real do guarda-corpo menor que a mínima.
pub fn aviso_altura(guarda: u32, trecho: u32, altura: f64, minima: f64) -> Option<Aviso> {
    (altura < minima - 1e-9).then(|| Aviso { guarda, codigo: AV_ALTURA_BAIXA, trecho, indice: 0, medido: na_grade(altura), limite: minima, x: 0.0, y: 0.0, z: 0.0 })
}

/// Traduz a saída `avisos`/`valores` de `guarda_caminhos` (códigos 1 a 6) para os códigos de `guarda_avisos` (6 a 11).
pub fn de_caminho(av: &[u32], val: &[f64]) -> Vec<Aviso> {
    av.chunks_exact(4)
        .zip(val.chunks_exact(5))
        .filter_map(|(a, v)| {
            let codigo = match a[1] {
                1 => AV_HOSPEDEIRO_DESCONTINUO,
                2 => AV_DESLOCAMENTO_EXCEDE,
                3 => AV_TRECHO_CURTO,
                4 => AV_CAMINHO_REPETIDO,
                5 => AV_CAMINHO_NULO,
                6 => AV_SEM_BORDA,
                _ => return None,
            };
            Some(Aviso { guarda: a[0], codigo, trecho: a[2], indice: a[3], medido: v[0], limite: v[1], x: v[2], y: v[3], z: v[4] })
        })
        .collect()
}

/// Traduz o aviso da distribuição (códigos 1 a 4) para o código de `guarda_avisos` (13 a 16). `s` vira `x`, `valor` vira `medido`.
pub fn de_distribuicao(guarda: u32, trecho: u32, codigo: u8, s: f64, valor: f64) -> Option<Aviso> {
    let codigo = match codigo {
        1 => AV_PADRAO_NAO_CABE,
        2 => AV_PADRAO_COMPRIMIDO,
        3 => AV_VAO_SEM_ESPACO,
        4 => AV_SOBRA_CURTA,
        _ => return None,
    };
    Some(Aviso { guarda, codigo, trecho, indice: 0, medido: na_grade(valor), limite: 0.0, x: s, y: 0.0, z: 0.0 })
}

/// `gc-trecho-curto`: trecho emitido pelo caminho que ainda assim vira ponto em planta (menos de dois nós ou comprimento horizontal nulo).
pub fn aviso_trecho_curto(guarda: u32, trecho: u32, comprimento: f64, minimo: f64, x: f64, y: f64, z: f64) -> Option<Aviso> {
    (comprimento <= minimo).then(|| Aviso { guarda, codigo: AV_TRECHO_CURTO, trecho, indice: 0, medido: na_grade(comprimento), limite: minimo, x, y, z })
}

/// `gc-perfil-auto-intersecta`: num vértice com giro `θ`, o perfil de meia largura `m` recua `m * tan(θ/2)` pelo lado de dentro; se isso passa do
/// menor segmento vizinho, o contorno da varredura dobra sobre si. Mede em planta. `fechado` inclui o vértice de fechamento. Devolve o pior vértice.
pub fn aviso_perfil_auto_intersecta(guarda: u32, trecho: u32, nos: &[[f64; 3]], meia_largura: f64, fechado: bool) -> Option<Aviso> {
    let n = nos.len();
    if n < 3 || meia_largura <= 0.0 {
        return None;
    }
    let seg = |i: usize, j: usize| ((nos[j][0] - nos[i][0]).hypot(nos[j][1] - nos[i][1]), [nos[j][0] - nos[i][0], nos[j][1] - nos[i][1]]);
    let vertices: Vec<usize> = if fechado { (0..n).collect() } else { (1..n - 1).collect() };
    let mut pior: Option<Aviso> = None;
    for i in vertices {
        let (a, b, c) = ((i + n - 1) % n, i, (i + 1) % n);
        let ((l1, d1), (l2, d2)) = (seg(a, b), seg(b, c));
        if l1 < 1e-9 || l2 < 1e-9 {
            continue;
        }
        let cos = ((d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2)).clamp(-1.0, 1.0);
        let giro = cos.acos();
        // Giro quase reto ou reversão total: tan(θ/2) explode; limita para o valor continuar finito.
        let recuo = meia_largura * (giro / 2.0).tan().min(1e6);
        let menor = l1.min(l2);
        if recuo > menor + 1e-9 && pior.as_ref().is_none_or(|p| recuo - menor > p.medido - p.limite) {
            pior = Some(Aviso { guarda, codigo: AV_PERFIL_AUTO_INTERSECTA, trecho, indice: i as u32, medido: na_grade(recuo), limite: na_grade(menor), x: nos[b][0], y: nos[b][1], z: nos[b][2] });
        }
    }
    pior
}

/// Saída plana: `avisos` `[guarda_num, codigo, trecho, indice]` e `valores` `[medido, limite, x, y, z]`, ordenados por (guarda, trecho, codigo, indice).
pub fn achatar_avisos(av: &[Aviso]) -> (Vec<u32>, Vec<f64>) {
    let mut v: Vec<&Aviso> = av.iter().collect();
    v.sort_by_key(|a| (a.guarda, a.trecho, a.codigo, a.indice));
    let mut a = Vec::new();
    let mut m = Vec::new();
    for x in v {
        a.extend_from_slice(&[x.guarda, x.codigo, x.trecho, x.indice]);
        m.extend_from_slice(&[x.medido, x.limite, na_grade(x.x), na_grade(x.y), na_grade(x.z)]);
    }
    (a, m)
}

#[cfg(test)]
mod testes {
    use super::*;

    /// Balaústres de 12 mm com vão livre `vao` entre eles, trilho de base a `base` e de topo em `altura`.
    fn guarda(vao: f64, n: usize) -> VaoGC {
        let passo = vao + 0.012;
        let verticais = (0..n).map(|k| (k as f64 * passo, k as f64 * passo + 0.012)).collect();
        VaoGC { comprimento: (n - 1) as f64 * passo + 0.012, altura: 1.1, verticais, horizontais: vec![(0.0, 0.05), (1.05, 1.1)] }
    }

    #[test]
    fn vao_de_120_contra_limite_de_110_avisa() {
        let a = aviso_vao_grande(1, 0, &guarda(0.12, 6), 0.05, 1.05, 0.11).expect("aviso");
        assert!((a.medido - 0.12).abs() < 1e-9);
        assert_eq!(a.limite, 0.11);
        assert_eq!(a.codigo, AV_VAO_GRANDE);
    }

    #[test]
    fn vao_de_100_nao_avisa() {
        assert!(aviso_vao_grande(1, 0, &guarda(0.10, 6), 0.05, 1.05, 0.11).is_none());
    }

    #[test]
    fn trilho_intermediario_reduz_a_esfera_vertical() {
        // Vão largo (30 cm), mas trilho a cada 8 cm de altura: a esfera é limitada pela altura.
        let mut v = guarda(0.30, 4);
        v.horizontais = (0..14).map(|k| (0.05 + k as f64 * 0.09, 0.05 + k as f64 * 0.09 + 0.012)).collect();
        let (d, _, _) = maior_esfera(&v, 0.05, 1.05).expect("célula");
        assert!(d < 0.09);
    }

    #[test]
    fn corrimao_a_95_contra_faixa_80_92() {
        let a = aviso_corrimao_altura(2, 1, 0, 0.95, 0.80, 0.92).expect("aviso");
        assert_eq!((a.medido, a.limite), (0.95, 0.92));
        assert!(aviso_corrimao_altura(2, 1, 0, 0.90, 0.80, 0.92).is_none());
        assert!(aviso_corrimao_altura(2, 1, 0, 0.70, 0.80, 0.92).is_some());
    }

    #[test]
    fn extensao_curta_e_altura_baixa() {
        assert!(aviso_corrimao_extensao(1, 0, 1, 0.20, 0.30).is_some());
        assert!(aviso_corrimao_extensao(1, 0, 1, 0.30, 0.30).is_none());
        assert!(aviso_altura(1, 0, 0.90, 1.10).is_some());
        assert!(aviso_vao_inferior(1, 0, 0.15, 0.11).is_some());
        assert!(aviso_vao_inferior(1, 0, 0.05, 0.11).is_none());
    }

    #[test]
    fn saida_plana_ordenada() {
        let av = vec![aviso_altura(2, 0, 0.9, 1.1).unwrap(), aviso_altura(1, 0, 0.9, 1.1).unwrap()];
        let (a, m) = achatar_avisos(&av);
        assert_eq!(a, vec![1, AV_ALTURA_BAIXA, 0, 0, 2, AV_ALTURA_BAIXA, 0, 0]);
        assert_eq!(m.len(), 10);
    }
}
