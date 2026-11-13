//! Terreno (PLANO do terreno A.4 regra 4): a malha de triângulos em planta com cota por vértice, a localização de um ponto e a consulta 163 (`terreno_cotas`).
//!
//! A localização usa uma grade uniforme sobre a caixa da malha (lista de triângulos por célula, em ordem crescente de índice), independente da biblioteca de
//! triangulação: serve igual para T0, E e, na ficha R3, P. Um ponto conta como dentro de um triângulo até `TOL_DENTRO` além da aresta, para que pontos sobre
//! a borda da malha não caiam fora por arredondamento.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::ID_AUSENTE;
use crate::terreno_tipos::existente;

/// Folga (m) da pertinência de um ponto a um triângulo.
pub const TOL_DENTRO: f64 = 1e-9;

/// Máximo de células por eixo da grade.
const GRADE_MAX: usize = 2048;

/// Grade de localização (CSR: `inicio[c]..inicio[c + 1]` são os triângulos da célula `c`).
#[derive(Default)]
struct Grade {
    min: [f64; 2],
    max: [f64; 2],
    inv: [f64; 2],
    n: [usize; 2],
    inicio: Vec<u32>,
    itens: Vec<u32>,
}

impl Grade {
    fn celula(&self, eixo: usize, x: f64) -> usize {
        let k = ((x - self.min[eixo]) * self.inv[eixo]).floor();
        if k >= 0.0 {
            (k as usize).min(self.n[eixo] - 1)
        } else {
            0
        }
    }

    /// Faixa de células (inclusive) da caixa de um triângulo, com a folga.
    fn faixa(&self, v: &[[f64; 3]], t: [u32; 3]) -> [usize; 4] {
        let p = t.map(|i| v[i as usize]);
        let (mut a, mut b) = ([f64::INFINITY; 2], [f64::NEG_INFINITY; 2]);
        for q in p {
            for e in 0..2 {
                a[e] = a[e].min(q[e]);
                b[e] = b[e].max(q[e]);
            }
        }
        [self.celula(0, a[0] - TOL_DENTRO), self.celula(1, a[1] - TOL_DENTRO), self.celula(0, b[0] + TOL_DENTRO), self.celula(1, b[1] + TOL_DENTRO)]
    }

    fn nova(v: &[[f64; 3]], t: &[[u32; 3]]) -> Grade {
        if t.is_empty() {
            return Grade::default();
        }
        let (mut min, mut max) = ([f64::INFINITY; 2], [f64::NEG_INFINITY; 2]);
        for tri in t {
            for &i in tri {
                for e in 0..2 {
                    min[e] = min[e].min(v[i as usize][e]);
                    max[e] = max[e].max(v[i as usize][e]);
                }
            }
        }
        let (w, h) = ((max[0] - min[0]).max(1e-12), (max[1] - min[1]).max(1e-12));
        let alvo = t.len() as f64;
        let lado = |r: f64| (r.sqrt().round() as usize).clamp(1, GRADE_MAX);
        let mut g = Grade { min, max, inv: [0.0; 2], n: [lado(alvo * w / h), lado(alvo * h / w)], inicio: Vec::new(), itens: Vec::new() };
        // Triângulos muito compridos cobrem muitas células: a grade é afrouxada até a soma das listas caber em um múltiplo fixo do número de triângulos.
        loop {
            g.inv = [g.n[0] as f64 / w, g.n[1] as f64 / h];
            let total: usize = t.iter().map(|&tri| g.faixa(v, tri)).map(|f| (f[2] - f[0] + 1) * (f[3] - f[1] + 1)).sum();
            if total <= 8 * t.len() + 1024 || (g.n[0] == 1 && g.n[1] == 1) {
                break;
            }
            g.n = [g.n[0].div_ceil(2), g.n[1].div_ceil(2)];
        }
        let n_cel = g.n[0] * g.n[1];
        let mut conta = vec![0u32; n_cel + 1];
        for &tri in t {
            let f = g.faixa(v, tri);
            for cy in f[1]..=f[3] {
                for cx in f[0]..=f[2] {
                    conta[cy * g.n[0] + cx + 1] += 1;
                }
            }
        }
        for c in 0..n_cel {
            conta[c + 1] += conta[c];
        }
        let mut pos = conta.clone();
        let mut itens = vec![0u32; conta[n_cel] as usize];
        for (k, &tri) in t.iter().enumerate() {
            let f = g.faixa(v, tri);
            for cy in f[1]..=f[3] {
                for cx in f[0]..=f[2] {
                    let c = cy * g.n[0] + cx;
                    itens[pos[c] as usize] = k as u32;
                    pos[c] += 1;
                }
            }
        }
        g.inicio = conta;
        g.itens = itens;
        g
    }
}

/// Malha de triângulos em planta com cota por vértice (TIN).
#[derive(Default)]
pub struct Malha {
    /// `[x, y, z]` de cada vértice.
    pub v: Vec<[f64; 3]>,
    /// `id_num` do vértice de fonte de cada vértice (`ID_AUSENTE` = ponto criado pelo kernel, como os da borda).
    pub ids: Vec<u32>,
    /// Triângulos, anti-horários em planta (normal para cima).
    pub t: Vec<[u32; 3]>,
    /// Arestas obrigatórias aceitas (índices de vértice).
    pub restricoes: Vec<[u32; 2]>,
    grade: Grade,
}

/// Posição de um ponto na malha: o triângulo e os pesos baricêntricos (somam 1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Local {
    pub triangulo: usize,
    pub pesos: [f64; 3],
}

impl Malha {
    pub fn nova(v: Vec<[f64; 3]>, ids: Vec<u32>, t: Vec<[u32; 3]>, restricoes: Vec<[u32; 2]>) -> Malha {
        let grade = Grade::nova(&v, &t);
        Malha { v, ids, t, restricoes, grade }
    }

    fn cantos(&self, k: usize) -> [[f64; 3]; 3] {
        self.t[k].map(|i| self.v[i as usize])
    }

    /// Localiza `(x, y)` (regra 4). `None` = fora da malha. Entre os triângulos que contêm o ponto vale o de menor índice; o que o contém exatamente tem
    /// preferência sobre o que só o contém dentro da folga.
    pub fn localizar(&self, x: f64, y: f64) -> Option<Local> {
        let g = &self.grade;
        if self.t.is_empty() || !(x >= g.min[0] - TOL_DENTRO && x <= g.max[0] + TOL_DENTRO && y >= g.min[1] - TOL_DENTRO && y <= g.max[1] + TOL_DENTRO) {
            return None;
        }
        let c = g.celula(1, y) * g.n[0] + g.celula(0, x);
        let mut reserva: Option<Local> = None;
        for &k in &g.itens[g.inicio[c] as usize..g.inicio[c + 1] as usize] {
            let p = self.cantos(k as usize);
            // d[i] = dobro da área assinada do ponto com a aresta oposta ao canto i.
            let mut d = [0.0f64; 3];
            let mut exato = true;
            let mut tolerado = true;
            for i in 0..3 {
                let (a, b) = (p[(i + 1) % 3], p[(i + 2) % 3]);
                let (ex, ey) = (b[0] - a[0], b[1] - a[1]);
                d[i] = ex * (y - a[1]) - ey * (x - a[0]);
                exato &= d[i] >= 0.0;
                tolerado &= d[i] >= -TOL_DENTRO * crate::geo2d::hipot(ex, ey);
            }
            if !tolerado {
                continue;
            }
            let d = d.map(|w| w.max(0.0));
            let soma = d[0] + d[1] + d[2];
            if soma <= 0.0 || soma.is_nan() {
                continue;
            }
            let local = Local { triangulo: k as usize, pesos: d.map(|w| w / soma) };
            if exato {
                return Some(local);
            }
            reserva = reserva.or(Some(local));
        }
        reserva
    }

    /// Cota em um local já achado (interpolação linear).
    pub fn cota_em(&self, l: &Local) -> f64 {
        let p = self.cantos(l.triangulo);
        l.pesos[0] * p[0][2] + l.pesos[1] * p[1][2] + l.pesos[2] * p[2][2]
    }

    /// Cota em `(x, y)`; `None` = fora.
    pub fn cota(&self, x: f64, y: f64) -> Option<f64> {
        self.localizar(x, y).map(|l| self.cota_em(&l))
    }

    /// Dobro da área em planta do triângulo (positivo: anti-horário).
    pub fn area2(&self, k: usize) -> f64 {
        let p = self.cantos(k);
        (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0])
    }

    /// Normal (não unitária, com z = `area2`) do triângulo.
    fn normal(&self, k: usize) -> [f64; 3] {
        let p = self.cantos(k);
        let (a, b) = ([p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]);
        [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    }

    /// Declividade do triângulo: módulo do gradiente da cota (0,1 = 10 %). Triângulo sem área em planta dá 0.
    pub fn declividade(&self, k: usize) -> f64 {
        let n = self.normal(k);
        let d = crate::geo2d::hipot(n[0], n[1]) / n[2].abs();
        if n[2] != 0.0 && d.is_finite() {
            d
        } else {
            0.0
        }
    }

    /// Área em planta da malha.
    pub fn area_planta(&self) -> f64 {
        (0..self.t.len()).map(|k| self.area2(k) / 2.0).sum()
    }

    /// Área de superfície (soma das áreas 3D dos triângulos).
    pub fn area_superficie(&self) -> f64 {
        (0..self.t.len()).map(|k| self.normal(k)).map(|n| (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt() / 2.0).sum()
    }

    /// Menor e maior cota dos vértices. `None` na malha vazia.
    pub fn z_min_max(&self) -> Option<(f64, f64)> {
        let mut it = self.v.iter().map(|p| p[2]);
        let z0 = it.next()?;
        Some(it.fold((z0, z0), |(a, b), z| (a.min(z), b.max(z))))
    }

    /// Arestas de borda (as que pertencem a um triângulo só), orientadas como no triângulo (interior à esquerda), na ordem dos triângulos.
    pub fn arestas_de_borda(&self) -> Vec<[u32; 2]> {
        let mut usos: std::collections::HashMap<(u32, u32), u32> = std::collections::HashMap::with_capacity(self.t.len() * 3 / 2 + 1);
        for t in &self.t {
            for i in 0..3 {
                let (a, b) = (t[i], t[(i + 1) % 3]);
                *usos.entry((a.min(b), a.max(b))).or_insert(0) += 1;
            }
        }
        let mut out = Vec::new();
        for t in &self.t {
            for i in 0..3 {
                let (a, b) = (t[i], t[(i + 1) % 3]);
                if usos.get(&(a.min(b), a.max(b))) == Some(&1) {
                    out.push([a, b]);
                }
            }
        }
        out
    }
}

/// Consulta 163 (`terreno_cotas`): para cada sonda (por `id_num`), o terreno de menor `id_num` que a contém, a cota e a declividade ali. Fora de todo terreno:
/// `terreno_num = ID_AUSENTE` e valores 0. Até a ficha R3 a superfície proposta devolve o mesmo que a existente.
pub fn consulta_terreno_cotas(cena: &Cena, _superficie: u32) -> Result<Vec<Saida>, u32> {
    let mut malhas = Vec::with_capacity(cena.terreno.terrenos.len());
    if !cena.terreno.sondas.is_empty() {
        for &t in cena.terreno.terrenos.keys() {
            malhas.push((t, existente(cena, t)?));
        }
    }
    let mut linhas = Vec::with_capacity(cena.terreno.sondas.len() * 2);
    let mut valores = Vec::with_capacity(cena.terreno.sondas.len() * 2);
    for (&sonda, p) in &cena.terreno.sondas {
        let achado = malhas.iter().find_map(|(t, e)| e.e.localizar(p.x, p.y).map(|l| (*t, e.e.cota_em(&l), e.e.declividade(l.triangulo))));
        let (terreno, z, decl) = achado.unwrap_or((ID_AUSENTE, 0.0, 0.0));
        linhas.extend_from_slice(&[sonda, terreno]);
        valores.extend_from_slice(&[z, decl]);
    }
    Ok(vec![Saida::U32(linhas), Saida::F64(valores)])
}

#[cfg(test)]
mod testes {
    use super::*;

    /// Quadrado 0..2 em dois triângulos, com z = x.
    fn quadrado() -> Malha {
        let v = vec![[0.0, 0.0, 0.0], [2.0, 0.0, 2.0], [2.0, 2.0, 2.0], [0.0, 2.0, 0.0]];
        Malha::nova(v, vec![0, 1, 2, 3], vec![[0, 1, 2], [0, 2, 3]], Vec::new())
    }

    #[test]
    fn localiza_dentro_na_aresta_no_vertice_e_fora() {
        let m = quadrado();
        assert_eq!(m.cota(0.5, 1.5), Some(0.5));
        assert_eq!(m.cota(1.0, 1.0), Some(1.0), "na diagonal");
        assert_eq!(m.localizar(1.0, 1.0).map(|l| l.triangulo), Some(0), "na aresta comum vale o de menor índice");
        assert_eq!(m.cota(2.0, 2.0), Some(2.0), "no vértice");
        assert_eq!(m.cota(2.0, 1.0), Some(2.0), "na borda");
        assert_eq!(m.cota(2.0 + 1e-10, 1.0), Some(2.0), "dentro da folga");
        assert_eq!(m.cota(2.001, 1.0), None);
        assert_eq!(m.cota(-1.0, -1.0), None);
        assert_eq!(Malha::default().cota(0.0, 0.0), None);
        let l = m.localizar(0.5, 0.25).expect("dentro");
        assert!((l.pesos.iter().sum::<f64>() - 1.0).abs() < 1e-15);
    }

    #[test]
    fn areas_declividade_e_extremos() {
        let m = quadrado();
        assert_eq!(m.area_planta(), 4.0);
        assert!((m.area_superficie() - 4.0 * 2f64.sqrt()).abs() < 1e-12);
        assert!((m.declividade(0) - 1.0).abs() < 1e-12);
        assert_eq!(m.z_min_max(), Some((0.0, 2.0)));
        assert_eq!(Malha::default().z_min_max(), None);
        let degenerada = Malha::nova(vec![[0.0, 0.0, 0.0], [1.0, 0.0, 1.0], [2.0, 0.0, 5.0]], vec![0, 1, 2], vec![[0, 1, 2]], Vec::new());
        assert_eq!(degenerada.declividade(0), 0.0, "sem área em planta não há declividade (nem NaN)");
        assert_eq!(degenerada.cota(1.0, 0.0), None);
    }

    #[test]
    fn arestas_de_borda_do_quadrado() {
        assert_eq!(quadrado().arestas_de_borda(), vec![[0, 1], [1, 2], [2, 3], [3, 0]]);
    }

    #[test]
    fn grade_acha_o_mesmo_que_a_busca_exaustiva() {
        // Faixa de 200 triângulos finos e um triângulo enorme por cima: a grade tem de continuar certa quando é afrouxada.
        let mut v = Vec::new();
        let mut t = Vec::new();
        for k in 0..=100u32 {
            v.push([f64::from(k), 0.0, f64::from(k)]);
            v.push([f64::from(k), 1.0, f64::from(k)]);
        }
        for k in 0..100u32 {
            t.push([2 * k, 2 * k + 2, 2 * k + 3]);
            t.push([2 * k, 2 * k + 3, 2 * k + 1]);
        }
        v.extend_from_slice(&[[0.0, 1.0, 0.0], [100.0, 1.0, 100.0], [50.0, 400.0, 50.0]]);
        t.push([202, 203, 204]);
        let ids = vec![ID_AUSENTE; v.len()];
        let m = Malha::nova(v, ids, t, Vec::new());
        let mut r = crate::teste_util::Xorshift::novo(3);
        for _ in 0..2000 {
            let (x, y) = (r.intervalo(-5.0, 105.0), r.intervalo(-5.0, 405.0));
            let exaustiva = (0..m.t.len()).any(|k| {
                let p = m.cantos(k);
                (0..3).all(|i| {
                    let (a, b) = (p[(i + 1) % 3], p[(i + 2) % 3]);
                    (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0.0
                })
            });
            let z = m.cota(x, y);
            assert_eq!(z.is_some(), exaustiva, "({x}, {y})");
            if let Some(z) = z {
                assert!((z - x).abs() < 1e-9, "z = x em toda a malha");
            }
        }
    }
}
