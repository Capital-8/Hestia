//! Terreno (PLANO do terreno A.4 regras 6 e 7): leitura das regiões de UM terreno (seções 163 e 164), plano da região e a cota proposta `zP(p)`.
//!
//! `zP` é a função ÚNICA da cota proposta: a malha da superfície proposta (`terreno_proposta`) só a avalia nos seus vértices, e a malha interpola entre eles.
//! Subdivisão não altera cota; só plataforma e região nivelada (as regiões "planas") entram em `aplicar`.
//!
//! Alcance `D` da região plana: `0,02` se os dois taludes são 0; senão o menor raio (até `ALCANCE_MAX`) a partir do qual o talude já não limita E, achado por
//! iteração sobre os vértices de E e sobre anéis de amostras à distância `D` (ver `definir_alcances`).

use std::collections::BTreeMap;

use crate::geo2d::{v, V};
use crate::secoes_terreno::{SecoesTerreno, PAPEL_SUBDIVISAO};
use crate::terreno_avalia::Malha;
use crate::terreno_tin::adensar;
use crate::terreno_tipos::{area_assinada, chave, misturar, ponto_no_poligono, Assinatura, SEMENTE};

/// Quanto os gêmeos ficam para fora (m).
const GEMEO: f64 = 0.01;
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

/// Região cujo talude não encontrou E dentro do teto de alcance: `(id, alcance medido, que é o próprio teto)`.
pub type AlcanceCurto = (u32, f64);

/// Pontos de amostragem do anel a distância `d` do contorno de `r`: cada ponto do contorno adensado deslocado `d` na normal do lado e, nos cantos convexos,
/// num leque de direções entre as normais dos dois lados (o anel de distância constante tem arcos ali).
fn anel_de_distancia(r: &Regiao, d: f64) -> Vec<V> {
    let n = r.contorno.len();
    let normal = |a: V, b: V| -> V {
        let l = crate::geo2d::hipot(b.x - a.x, b.y - a.y).max(1e-300);
        v((b.y - a.y) / l, -(b.x - a.x) / l)
    };
    let mut out = Vec::new();
    for k in 0..n {
        let (a, b) = (r.contorno[k], r.contorno[(k + 1) % n]);
        let nk = normal(a, b);
        let l = crate::geo2d::hipot(b.x - a.x, b.y - a.y);
        let passos = ((l / r.h).ceil() as usize).max(1);
        for i in 0..passos {
            let t = i as f64 / passos as f64;
            out.push(v(a.x + (b.x - a.x) * t + nk.x * d, a.y + (b.y - a.y) * t + nk.y * d));
        }
        // Leque no canto `b`: da normal deste lado à do próximo (só nos convexos: o giro é anti-horário e menor que meia volta).
        let nn = normal(b, r.contorno[(k + 2) % n]);
        let (a0, a1) = (nk.y.atan2(nk.x), nn.y.atan2(nn.x));
        let mut giro = a1 - a0;
        while giro < 0.0 {
            giro += 2.0 * std::f64::consts::PI;
        }
        if giro > 1e-9 && giro < std::f64::consts::PI {
            let m = ((giro * d / r.h).ceil() as usize).clamp(1, 64);
            for i in 0..=m {
                let ang = a0 + giro * i as f64 / m as f64;
                out.push(v(b.x + ang.cos() * d, b.y + ang.sin() * d));
            }
        }
    }
    out
}

/// Define o alcance `D` das regiões planas (regra 7): a menor distância ao contorno a partir da qual o talude já não limita E. Não se estima por `Hmax` do
/// contorno (terreno que sobe além do contorno faria o talude acabar num degrau antes de tocar E): parte do ponto mais longe em que o talude ainda limita um
/// vértice de E e cresce (10 % mais `h`) até um anel inteiro de pontos à distância `D` encontrar E já dentro do talude. Passando de `ALCANCE_MAX` o alcance
/// fica no teto e a região volta na lista devolvida (aviso 7).
pub fn definir_alcances(regioes: &mut [Regiao], e: &Malha) -> Vec<AlcanceCurto> {
    let mut curtos = Vec::new();
    for i in 0..regioes.len() {
        if !regioes[i].plana() {
            continue;
        }
        if regioes[i].talude_corte <= 0.0 && regioes[i].talude_aterro <= 0.0 {
            regioes[i].alcance = ALCANCE_MIN;
            continue;
        }
        // O talude da região i é medido sobre o que as regiões ANTERIORES (já com o alcance final) deixaram: um talude que só aparece por cima do
        // talude de outra região também precisa de alcance.
        let r = regioes[i].clone();
        let mut sozinha = r.clone();
        sozinha.alcance = f64::MAX / 4.0;
        let antes: Vec<Regiao> = regioes[..i].to_vec();
        let mut com = antes.clone();
        com.push(sozinha.clone());
        let ativo = |p: V| -> bool { e.cota(p.x, p.y).is_some_and(|z| (aplicar(&com, p, z) - aplicar(&antes, p, z)).abs() > 1e-9) };
        let anel_ativo = |d: f64| -> bool { anel_de_distancia(&sozinha, d).into_iter().filter(|&p| sozinha.mais_proximo(p).1 >= d * 0.98).any(ativo) };
        let mut d = r.h;
        for q in &e.v {
            let p = v(q[0], q[1]);
            if sozinha.perto(p, ALCANCE_MAX) && !sozinha.dentro(p) {
                let dist = sozinha.mais_proximo(p).1;
                if dist <= ALCANCE_MAX && dist > d && ativo(p) {
                    d = dist;
                }
            }
        }
        d = d.min(ALCANCE_MAX);
        while d < ALCANCE_MAX && anel_ativo(d) {
            d = (d * 1.1 + r.h).min(ALCANCE_MAX);
        }
        if d >= ALCANCE_MAX && anel_ativo(d) {
            curtos.push((r.id, d));
        }
        regioes[i].alcance = d;
    }
    curtos
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

/// Ponto de cruzamento próprio (as duas retas se cortam no interior dos dois trechos) de `a1`–`a2` com `b1`–`b2`.
fn cruzamento(a1: V, a2: V, b1: V, b2: V) -> Option<V> {
    let (ra, rb) = (v(a2.x - a1.x, a2.y - a1.y), v(b2.x - b1.x, b2.y - b1.y));
    let (o1, o2) = (ra.x * (b1.y - a1.y) - ra.y * (b1.x - a1.x), ra.x * (b2.y - a1.y) - ra.y * (b2.x - a1.x));
    let (o3, o4) = (rb.x * (a1.y - b1.y) - rb.y * (a1.x - b1.x), rb.x * (a2.y - b1.y) - rb.y * (a2.x - b1.x));
    if o1 * o2 < 0.0 && o3 * o4 < 0.0 {
        let t = o3 / (o3 - o4);
        return Some(v(a1.x + ra.x * t, a1.y + ra.y * t));
    }
    None
}

/// Um ponto onde os contornos de `a` e `b` se sobrepõem (aviso 3), ou `None` se só se tocam ou não se encontram. Lados que se cruzam, vértice de um
/// estritamente dentro do outro; e, para contornos que coincidem, pontos médios de lados e o centroide.
pub fn sobreposicao(a: &Regiao, b: &Regiao) -> Option<V> {
    let (ca, cb) = (a.caixa(), b.caixa());
    if ca[0] >= cb[2] || cb[0] >= ca[2] || ca[1] >= cb[3] || cb[1] >= ca[3] {
        return None;
    }
    let (na, nb) = (a.contorno.len(), b.contorno.len());
    for i in 0..na {
        for j in 0..nb {
            if let Some(p) = cruzamento(a.contorno[i], a.contorno[(i + 1) % na], b.contorno[j], b.contorno[(j + 1) % nb]) {
                return Some(p);
            }
        }
    }
    let meios = |r: &Regiao| -> Vec<V> { (0..r.contorno.len()).map(|k| (r.contorno[k], r.contorno[(k + 1) % r.contorno.len()])).map(|(p, q)| v((p.x + q.x) / 2.0, (p.y + q.y) / 2.0)).collect() };
    let centroide = |r: &Regiao| -> V {
        let n = r.contorno.len() as f64;
        v(r.contorno.iter().map(|p| p.x).sum::<f64>() / n, r.contorno.iter().map(|p| p.y).sum::<f64>() / n)
    };
    let dentro_do_outro = |x: &Regiao, y: &Regiao| -> Option<V> {
        let na_fronteira = x.contorno.iter().copied().chain(meios(x));
        na_fronteira.chain([centroide(x)].into_iter().filter(|&c| x.dentro(c))).find(|&p| y.estritamente_dentro(p))
    };
    dentro_do_outro(a, b).or_else(|| dentro_do_outro(b, a))
}

/// Gêmeo de cada ponto de um anel anti-horário: 0,01 m para fora, na normal do trecho ou, nos cantos, na soma normalizada das normais dos dois trechos.
pub fn gemeos(anel: &[V]) -> Vec<V> {
    let n = anel.len();
    let normal = |a: V, b: V| -> Option<V> {
        let l = crate::geo2d::hipot(b.x - a.x, b.y - a.y);
        (l > 0.0).then(|| v((b.y - a.y) / l, -(b.x - a.x) / l))
    };
    let mut out = Vec::with_capacity(n);
    for k in 0..n {
        let (a, p, b) = (anel[(k + n - 1) % n], anel[k], anel[(k + 1) % n]);
        let (n1, n2) = (normal(a, p), normal(p, b));
        let soma = match (n1, n2) {
            (Some(x), Some(y)) => v(x.x + y.x, x.y + y.y),
            (Some(x), None) | (None, Some(x)) => x,
            (None, None) => continue,
        };
        let l = crate::geo2d::hipot(soma.x, soma.y);
        let dir = if l > 1e-9 {
            v(soma.x / l, soma.y / l)
        } else if let Some(y) = n2.or(n1) {
            y
        } else {
            continue;
        };
        out.push(v(p.x + dir.x * GEMEO, p.y + dir.y * GEMEO));
    }
    out
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
        assert_eq!(q, v(5.0, 5.0), "o canto");
        assert!((d - 18f64.sqrt()).abs() < 1e-12);
        assert!(r.estritamente_dentro(v(10.0, 10.0)) && !r.estritamente_dentro(v(5.0, 10.0)), "sobre o contorno não é estritamente dentro");
        assert_eq!(r.contorno_denso().len(), 160, "4 lados de 10 m com passo 0,25");
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

    fn quadrado_em(id: u32, ordem: u32, papel: u8, x0: f64, y0: f64, lado: f64) -> Regiao {
        let c = [v(x0, y0), v(x0 + lado, y0), v(x0 + lado, y0 + lado), v(x0, y0 + lado)];
        let mut s = crate::secoes_terreno::SecoesTerreno::default();
        s.regioes.insert(id, crate::secoes_terreno::RegiaoTerrenoLinha { terreno: 1, ordem, papel, cota: 0.0, inclinacao: 0.0, direcao: 0.0, ref_xy: [0.0; 2], talude_corte: 0.0, talude_aterro: 0.0 });
        for (k, p) in c.iter().enumerate() {
            s.regiao_pontos.insert(k as u32, crate::secoes_terreno::RegiaoPontoLinha { regiao: id, ordem: k as u32, x: p.x, y: p.y });
        }
        regioes_do_terreno(&s, 1).remove(0)
    }

    #[test]
    fn sobreposicao_cruza_contem_coincide_e_so_toca() {
        let a = quadrado_em(1, 0, 1, 0.0, 0.0, 10.0);
        assert!(sobreposicao(&a, &quadrado_em(2, 1, 1, 5.0, 5.0, 10.0)).is_some(), "lados que se cruzam");
        assert!(sobreposicao(&a, &quadrado_em(2, 1, 1, 2.0, 2.0, 3.0)).is_some(), "um dentro do outro");
        assert!(sobreposicao(&quadrado_em(2, 1, 1, 2.0, 2.0, 3.0), &a).is_some());
        assert!(sobreposicao(&a, &quadrado_em(2, 1, 1, 0.0, 0.0, 10.0)).is_some(), "contornos idênticos");
        assert!(sobreposicao(&a, &quadrado_em(2, 1, 1, 10.0, 0.0, 10.0)).is_none(), "só dividem um lado");
        assert!(sobreposicao(&a, &quadrado_em(2, 1, 1, 20.0, 20.0, 5.0)).is_none(), "longe");
    }

    #[test]
    fn gemeos_ficam_a_um_centimetro_para_fora() {
        let q = [v(0.0, 0.0), v(2.0, 0.0), v(2.0, 2.0), v(0.0, 2.0)];
        let g = gemeos(&q);
        assert_eq!(g.len(), 4);
        let s = 0.01 / 2f64.sqrt();
        assert!((g[0].x + s).abs() < 1e-12 && (g[0].y + s).abs() < 1e-12, "no canto, na diagonal para fora");
        let denso = crate::terreno_tin::adensar(&q, 1.0);
        let g = gemeos(&denso);
        assert!((g[1].x - 1.0).abs() < 1e-12 && (g[1].y + 0.01).abs() < 1e-12, "no meio do lado, na normal do trecho");
    }

    #[test]
    fn cruzamento_so_no_interior_dos_dois_trechos() {
        let p = cruzamento(v(0.0, 0.0), v(2.0, 2.0), v(0.0, 2.0), v(2.0, 0.0)).expect("cruza");
        assert!((p.x - 1.0).abs() < 1e-12 && (p.y - 1.0).abs() < 1e-12);
        assert!(cruzamento(v(0.0, 0.0), v(1.0, 0.0), v(0.0, 1.0), v(1.0, 1.0)).is_none());
        assert!(cruzamento(v(0.0, 0.0), v(2.0, 0.0), v(1.0, 0.0), v(1.0, 2.0)).is_none(), "encosta num extremo: não é cruzamento próprio");
    }
}
