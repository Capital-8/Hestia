//! Terreno (PLANO do terreno A.4 regras 6 e 7): leitura das regiões de UM terreno (seções 163 e 164), plano da região e a cota proposta `zP(p)`.
//!
//! `zP` é a função ÚNICA da cota proposta: a malha da superfície proposta (`terreno_proposta`) só a avalia nos seus vértices, e a malha interpola entre eles.
//! Subdivisão não altera cota; só plataforma e região nivelada (as regiões "planas") entram em `aplicar`.
//!
//! Alcance `D` da região plana: `0,02` se os dois taludes são 0; senão `min(50, Hmax · max(talude_corte, talude_aterro) + h)`, com `Hmax` o maior
//! `|E(q) − zR(q)|` nos pontos do contorno adensado que caem no domínio de E e `h = limitar(sqrt(área) / 40, 0,25, 2,0)`.

use std::collections::BTreeMap;

use crate::geo2d::{v, V};
use crate::secoes_terreno::{SecoesTerreno, PAPEL_SUBDIVISAO};
use crate::terreno_avalia::Malha;
use crate::terreno_tin::adensar;
use crate::terreno_tipos::{area_assinada, chave, misturar, ponto_no_poligono, Assinatura, SEMENTE};

/// Alcance (m) de uma região plana sem talude: só a faixa dos "gêmeos".
pub const ALCANCE_MIN: f64 = 0.02;
/// Teto do alcance (m).
pub const ALCANCE_MAX: f64 = 50.0;
/// Limites do passo `h` da região (m).
pub const PASSO_MIN: f64 = 0.25;
pub const PASSO_MAX: f64 = 2.0;
/// Distância (m) até a qual um ponto conta como SOBRE o contorno.
pub const TOL_SOBRE: f64 = 1e-9;

/// Uma região do terreno, pronta para uso: contorno anti-horário sem pontos repetidos, plano e alcance.
#[derive(Clone, Debug)]
pub struct Regiao {
    pub id: u32,
    pub ordem: u32,
    pub papel: u8,
    pub contorno: Vec<V>,
    /// Área do polígono (positiva).
    pub area: f64,
    /// Passo `h` (regra 7).
    pub h: f64,
    /// Alcance `D` (regra 7). 0 na subdivisão.
    pub alcance: f64,
    pub cota: f64,
    pub inclinacao: f64,
    pub direcao: f64,
    pub ref_xy: V,
    pub talude_corte: f64,
    pub talude_aterro: f64,
    /// Caixa do contorno: `[x_min, y_min, x_max, y_max]`.
    caixa: [f64; 4],
}

impl Regiao {
    /// Plataforma ou região nivelada: as que alteram a cota.
    pub fn plana(&self) -> bool {
        self.papel != PAPEL_SUBDIVISAO
    }

    /// Plano da região (regra 6): `cota + inclinacao · ((p − ref) · u)`, com `u = (cos direcao, sin direcao)`.
    pub fn zr(&self, p: V) -> f64 {
        self.cota + self.inclinacao * ((p.x - self.ref_xy.x) * self.direcao.cos() + (p.y - self.ref_xy.y) * self.direcao.sin())
    }

    /// `true` se `p` está a no máximo `folga` da caixa do contorno.
    pub fn perto(&self, p: V, folga: f64) -> bool {
        p.x >= self.caixa[0] - folga && p.x <= self.caixa[2] + folga && p.y >= self.caixa[1] - folga && p.y <= self.caixa[3] + folga
    }

    pub fn caixa(&self) -> [f64; 4] {
        self.caixa
    }

    /// `true` se `p` está dentro do contorno (paridade de cruzamentos).
    pub fn dentro(&self, p: V) -> bool {
        self.perto(p, 0.0) && ponto_no_poligono(p, &self.contorno)
    }

    /// Ponto do contorno mais próximo de `p` e a distância até ele (empate: o primeiro lado).
    pub fn mais_proximo(&self, p: V) -> (V, f64) {
        let n = self.contorno.len();
        let mut melhor = (self.contorno[0], f64::INFINITY);
        for k in 0..n {
            let (a, b) = (self.contorno[k], self.contorno[(k + 1) % n]);
            let (dx, dy) = (b.x - a.x, b.y - a.y);
            let l2 = dx * dx + dy * dy;
            let t = if l2 > 0.0 { (((p.x - a.x) * dx + (p.y - a.y) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
            let q = v(a.x + dx * t, a.y + dy * t);
            let d = crate::geo2d::hipot(p.x - q.x, p.y - q.y);
            if d < melhor.1 {
                melhor = (q, d);
            }
        }
        melhor
    }

    /// Distância de `p` à região: 0 dentro dela, senão a distância ao contorno.
    pub fn distancia(&self, p: V) -> f64 {
        if self.dentro(p) {
            0.0
        } else {
            self.mais_proximo(p).1
        }
    }

    /// `true` se `p` está estritamente dentro (não sobre o contorno).
    pub fn estritamente_dentro(&self, p: V) -> bool {
        self.dentro(p) && self.mais_proximo(p).1 > TOL_SOBRE
    }

    /// Contorno adensado com o passo `h` (cantos mantidos).
    pub fn contorno_denso(&self) -> Vec<V> {
        adensar(&self.contorno, self.h)
    }
}

/// Lê as regiões do terreno, ordenadas por `ordem` e depois por `id_num`. Região com menos de 3 pontos distintos ou sem área é ignorada. Contorno horário é
/// invertido (o modelo já entrega anti-horário; aqui só se garante).
pub fn regioes_do_terreno(s: &SecoesTerreno, terreno: u32) -> Vec<Regiao> {
    let mut pontos: BTreeMap<u32, Vec<(u32, u32, V)>> = s.regioes.iter().filter(|(_, r)| r.terreno == terreno).map(|(&id, _)| (id, Vec::new())).collect();
    if pontos.is_empty() {
        return Vec::new();
    }
    for (&id, p) in &s.regiao_pontos {
        if let Some(l) = pontos.get_mut(&p.regiao) {
            l.push((p.ordem, id, v(p.x, p.y)));
        }
    }
    let mut out = Vec::new();
    for (id, mut l) in pontos {
        l.sort_unstable_by_key(|x| (x.0, x.1));
        let Some(r) = s.regioes.get(&id) else { continue };
        let mut c: Vec<V> = Vec::with_capacity(l.len());
        for (_, _, p) in l {
            if c.last().is_none_or(|u| chave(u.x, u.y) != chave(p.x, p.y)) {
                c.push(p);
            }
        }
        while c.len() > 1 && c.first().map(|p| chave(p.x, p.y)) == c.last().map(|p| chave(p.x, p.y)) {
            c.pop();
        }
        let a = area_assinada(&c);
        if c.len() < 3 || !a.is_finite() || a.abs() < 1e-12 {
            continue;
        }
        if a < 0.0 {
            c.reverse();
        }
        let area = a.abs();
        let (mut min, mut max) = ([f64::INFINITY; 2], [f64::NEG_INFINITY; 2]);
        for p in &c {
            min = [min[0].min(p.x), min[1].min(p.y)];
            max = [max[0].max(p.x), max[1].max(p.y)];
        }
        out.push(Regiao {
            id,
            ordem: r.ordem,
            papel: r.papel,
            contorno: c,
            area,
            h: (area.sqrt() / 40.0).clamp(PASSO_MIN, PASSO_MAX),
            alcance: if r.papel == PAPEL_SUBDIVISAO { 0.0 } else { ALCANCE_MIN },
            cota: r.cota,
            inclinacao: r.inclinacao,
            direcao: r.direcao,
            ref_xy: v(r.ref_xy[0], r.ref_xy[1]),
            talude_corte: r.talude_corte,
            talude_aterro: r.talude_aterro,
            caixa: [min[0], min[1], max[0], max[1]],
        });
    }
    out.sort_by_key(|r| (r.ordem, r.id));
    out
}

/// Define o alcance `D` das regiões planas (regra 7), que depende de E por causa de `Hmax`.
pub fn definir_alcances(regioes: &mut [Regiao], e: &Malha) {
    for r in regioes.iter_mut().filter(|r| r.plana()) {
        if r.talude_corte <= 0.0 && r.talude_aterro <= 0.0 {
            r.alcance = ALCANCE_MIN;
            continue;
        }
        let hmax = r.contorno_denso().iter().filter_map(|&q| e.cota(q.x, q.y).map(|z| (z - r.zr(q)).abs())).fold(0.0, f64::max);
        r.alcance = (hmax * r.talude_corte.max(r.talude_aterro) + r.h).min(ALCANCE_MAX);
    }
}

/// Cota proposta (regra 7) em `p`, partindo de `z0 = E(p)`: para cada região plana, em ordem, dentro ou sobre o contorno vale o plano da região; fora dele,
/// até o alcance, a cota de E é limitada pelo talude a partir do ponto mais próximo do contorno. Talude 0 = sem limite daquele lado.
pub fn aplicar(regioes: &[Regiao], p: V, z0: f64) -> f64 {
    let mut z = z0;
    for r in regioes.iter().filter(|r| r.plana()) {
        if !r.perto(p, r.alcance.max(TOL_SOBRE)) {
            continue;
        }
        if r.dentro(p) {
            z = r.zr(p);
            continue;
        }
        let (q, d) = r.mais_proximo(p);
        if d <= TOL_SOBRE {
            z = r.zr(p);
        } else if d <= r.alcance && (r.talude_corte > 0.0 || r.talude_aterro > 0.0) {
            let zq = r.zr(q);
            let baixo = if r.talude_aterro > 0.0 { zq - d / r.talude_aterro } else { f64::NEG_INFINITY };
            let alto = if r.talude_corte > 0.0 { zq + d / r.talude_corte } else { f64::INFINITY };
            z = z.max(baixo).min(alto);
        }
    }
    z
}

/// `zP(p)` por inteiro: `E(p)` e depois `aplicar`. `None` fora do domínio de E.
pub fn zp(regioes: &[Regiao], e: &Malha, p: V) -> Option<f64> {
    e.cota(p.x, p.y).map(|z| aplicar(regioes, p, z))
}

/// Assinatura das regiões (seções 163 e 164) de cada terreno. Terreno sem região não aparece.
pub fn assinaturas_regioes(s: &SecoesTerreno) -> BTreeMap<u32, Assinatura> {
    let mut m: BTreeMap<u32, Assinatura> = BTreeMap::new();
    for (&id, r) in &s.regioes {
        let h = m.entry(r.terreno).or_insert(SEMENTE);
        let nums = [r.cota, r.inclinacao, r.direcao, r.ref_xy[0], r.ref_xy[1], r.talude_corte, r.talude_aterro];
        for x in [3, u64::from(id), u64::from(r.ordem), u64::from(r.papel)].into_iter().chain(nums.iter().map(|x| x.to_bits())) {
            misturar(h, x);
        }
    }
    for (&id, p) in &s.regiao_pontos {
        let Some(r) = s.regioes.get(&p.regiao) else { continue };
        let h = m.entry(r.terreno).or_insert(SEMENTE);
        for x in [4, u64::from(id), u64::from(p.regiao), u64::from(p.ordem), p.x.to_bits(), p.y.to_bits()] {
            misturar(h, x);
        }
    }
    m
}

#[cfg(test)]
mod testes {
    use super::*;

    fn quadrado(papel: u8) -> Regiao {
        let c = vec![v(5.0, 5.0), v(15.0, 5.0), v(15.0, 15.0), v(5.0, 15.0)];
        Regiao {
            id: 1,
            ordem: 0,
            papel,
            area: 100.0,
            h: 0.25,
            alcance: 2.0,
            contorno: c,
            cota: 8.0,
            inclinacao: 0.1,
            direcao: 0.0,
            ref_xy: v(10.0, 10.0),
            talude_corte: 1.0,
            talude_aterro: 0.0,
            caixa: [5.0, 5.0, 15.0, 15.0],
        }
    }

    #[test]
    fn plano_da_regiao_e_distancias() {
        let r = quadrado(1);
        assert_eq!(r.zr(v(10.0, 10.0)), 8.0);
        assert!((r.zr(v(12.0, 3.0)) - 8.2).abs() < 1e-12, "só o componente na direção de subida conta");
        assert!(r.dentro(v(6.0, 6.0)) && !r.dentro(v(4.0, 6.0)));
        assert_eq!(r.distancia(v(6.0, 6.0)), 0.0);
        assert_eq!(r.distancia(v(3.0, 10.0)), 2.0);
        let (q, d) = r.mais_proximo(v(2.0, 2.0));
        assert_eq!((q, d), (v(5.0, 5.0), 18f64.sqrt()), "o canto");
        assert!(r.estritamente_dentro(v(10.0, 10.0)) && !r.estritamente_dentro(v(5.0, 10.0)), "sobre o contorno não é estritamente dentro");
        assert_eq!(r.contorno_denso().len(), 40);
        assert!(r.plana() && !quadrado(0).plana());
    }

    #[test]
    fn aplicar_limita_pelo_talude_e_ignora_subdivisao() {
        let regs = vec![quadrado(2)];
        // Dentro: o plano. Sobre o contorno: o plano. No talude: o menor entre E e o talude. Além do alcance: E.
        assert_eq!(aplicar(&regs, v(10.0, 10.0), 10.0), 8.0);
        assert!((aplicar(&regs, v(5.0, 10.0), 10.0) - (8.0 - 0.5)).abs() < 1e-12, "sobre o contorno: zR dali, com a inclinação");
        assert!((aplicar(&regs, v(4.0, 10.0), 10.0) - 8.5).abs() < 1e-12, "talude de corte 1: 0,5 de subida por 1 m, a partir de zR(q) = 7,5");
        assert_eq!(aplicar(&regs, v(2.0, 10.0), 10.0), 10.0, "além do alcance");
        assert_eq!(aplicar(&regs, v(4.0, 10.0), 7.0), 7.0, "talude de aterro 0: sem limite embaixo");
        assert_eq!(aplicar(&[quadrado(0)], v(10.0, 10.0), 10.0), 10.0, "subdivisão não altera cota");
    }

    #[test]
    fn assinatura_so_de_quem_tem_regiao() {
        let s = SecoesTerreno::default();
        assert!(assinaturas_regioes(&s).is_empty());
    }
}
