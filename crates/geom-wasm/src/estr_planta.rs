//! Peças da estrutura e planta (docs/estrutura/PLANO.md, A.4.3; consulta 201 `estr_planta`; ficha K4).
//!
//! FONTE ÚNICA das consultas 201 a 204, 206 e 207: [`elementos`] monta cada pilar, viga e fundação como uma lista de prismas ([`PecaEstr`]: o
//! contorno do perfil e o `Quadro3` da extrusão), com os mesmos quadros da malha (`estr_malha`, `estr_fundacao`), então desenho, quantidade e malha
//! nunca divergem. Elemento que não forma geometria (tipo ou nível ausente, perfil inválido, eixo com menos de 1 mm, coordenada não finita) é
//! OMITIDO nestas consultas (não derruba a vista nem as quantidades); a consulta 204 é quem o aponta (código 1 ou 2), e a 200 continua a recusá-lo
//! com `ENTRADA`.
//!
//! Planta (A.4.3), por prisma, contra a cota absoluta `corte_z`:
//! - inteiro acima (`z mínimo > corte_z`): não sai;
//! - inteiro abaixo (`z máximo < corte_z`): contorno projetado (papel 2). Viga e fundação: tracejado (estilo 1); pilar abaixo do corte (pilarete,
//!   pilar curto): cheio (estilo 0). O contorno projetado do prisma vertical é o anel externo do perfil; o do prisma de eixo não vertical (viga,
//!   fundação corrida) é o contorno convexo da projeção ([`PecaEstr::contorno_planta`]);
//! - cortado: a seção pelo plano horizontal (`estr_corte::secao`): anel externo papel 0 (hachurável), furo papel 1, estilo 0. Pilar: o perfil; viga
//!   cortada: a faixa da viga na cota do corte;
//! - camadas de acabamento do pilar arquitetônico: só no detalhe fino e só cortadas, o anel externo da casca (papel 3, estilo 0).
//!
//! As vigas saem APARADAS no contorno dos pilares estruturais (A.4.5 c, `estr_juncoes::aparos`), como a junção diz. O detalhe também escolhe os lados
//! do círculo (`lados_por_lod`). Anéis fechados repetem o primeiro ponto. Ordem: categoria, elemento, parte, anel.

use std::collections::BTreeMap;
use std::rc::Rc;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::NIVEL_TODOS;
use crate::estr_fundacao::quadro_corrida;
use crate::estr_malha::{
    base_e_topo, casca_camadas, cota_do_nivel, quadro_pilar, quadro_viga, CATEGORIA_FUNDACAO, CATEGORIA_PILAR, CATEGORIA_VIGA, PARTE_BASE, PARTE_CAMADAS,
    PARTE_CORPO, PARTE_PESCOCO,
};
use crate::estr_perfil::{contorno_do_tipo, lados_por_lod, Contorno, P2};
use crate::estr_prisma::{Quadro3, P3};
use crate::secoes_estr::{PerfilLinha, DISCIPLINA_ARQUITETONICO, DISCIPLINA_ESTRUTURAL, FUNDACAO_CORRIDA, FUNDACAO_ESTACA, FUNDACAO_ISOLADA};

/// `estilo` das linhas.
pub const ESTILO_CHEIO: u32 = 0;
pub const ESTILO_TRACEJADO: u32 = 1;
/// `papel` das linhas de planta.
pub const PAPEL_ANEL: u32 = 0;
pub const PAPEL_FURO: u32 = 1;
pub const PAPEL_PROJETADO: u32 = 2;
pub const PAPEL_CAMADA: u32 = 3;

/// Um prisma de um elemento: o perfil (origem no centro da caixa) extrudado pelo quadro.
#[derive(Clone, Debug)]
pub struct PecaEstr {
    pub parte: u32,
    pub contorno: Rc<Contorno>,
    pub quadro: Quadro3,
}

impl PecaEstr {
    /// `[z mínimo, z máximo]` do anel externo na altura `s` do eixo.
    pub fn faixa_z_em(&self, s: f64) -> [f64; 2] {
        self.contorno.anel.iter().map(|&p| self.quadro.ponto(p, s)[2]).fold([f64::INFINITY, f64::NEG_INFINITY], |f, z| [f[0].min(z), f[1].max(z)])
    }

    /// `[z mínimo, z máximo]` do prisma.
    pub fn faixa_z(&self) -> [f64; 2] {
        let (a, b) = (self.faixa_z_em(0.0), self.faixa_z_em(1.0));
        [a[0].min(b[0]), a[1].max(b[1])]
    }

    /// Eixo sem componente em planta (pilar, fundação isolada e estaca).
    pub fn vertical(&self) -> bool {
        let e = self.quadro.eixo;
        e[0].hypot(e[1]) <= 1e-9 * (1.0 + e[2].abs())
    }

    /// Um anel do perfil em planta, na base do eixo.
    pub fn anel_planta(&self, anel: &[P2]) -> Vec<P2> {
        anel.iter().map(|&p| { let w = self.quadro.ponto(p, 0.0); [w[0], w[1]] }).collect()
    }

    /// Contorno projetado em planta: o anel externo (prisma vertical) ou o contorno convexo da projeção, anti-horário, começando pelo vértice de menor
    /// `(ao longo do eixo, à esquerda do eixo)` no referencial do eixo (canto do início, à direita): o mesmo vértice para o mesmo elemento.
    pub fn contorno_planta(&self) -> Vec<P2> {
        if self.vertical() {
            return self.anel_planta(&self.contorno.anel);
        }
        let (q, e) = (&self.quadro, self.quadro.eixo);
        let h = e[0].hypot(e[1]);
        let (u, n) = ([e[0] / h, e[1] / h], [-e[1] / h, e[0] / h]);
        let o = [q.origem[0], q.origem[1]];
        let mut local: Vec<P2> = Vec::with_capacity(2 * self.contorno.anel.len());
        for s in [0.0, 1.0] {
            for &p in &self.contorno.anel {
                let w = q.ponto(p, s);
                let d = [w[0] - o[0], w[1] - o[1]];
                local.push([d[0] * u[0] + d[1] * u[1], d[0] * n[0] + d[1] * n[1]]);
            }
        }
        let mut h = contorno_convexo(local);
        // Início estável contra o arredondamento: entre os vértices de menor `ao longo` (1 nm), o de menor `à esquerda`.
        let a0 = h.iter().map(|l| l[0]).fold(f64::INFINITY, f64::min);
        let ini = (0..h.len()).filter(|&i| h[i][0] <= a0 + 1e-9).min_by(|&i, &j| h[i][1].total_cmp(&h[j][1])).unwrap_or(0);
        h.rotate_left(ini);
        h.iter().map(|l| [o[0] + l[0] * u[0] + l[1] * n[0], o[1] + l[0] * u[1] + l[1] * n[1]]).collect()
    }

    /// Volume exato do prisma (área do perfil × comprimento do eixo normal ao perfil).
    pub fn volume(&self) -> f64 {
        self.contorno.area() * self.quadro.orientacao().abs()
    }

    /// Área lateral (perímetro de todos os anéis × comprimento do eixo).
    pub fn area_lateral(&self) -> f64 {
        self.contorno.perimetro() * self.quadro.orientacao().abs()
    }
}

/// Contorno convexo (cadeia monótona), anti-horário, a partir do menor ponto em `(x, y)`, sem pontos colineares.
pub fn contorno_convexo(mut pts: Vec<P2>) -> Vec<P2> {
    pts.retain(|p| p[0].is_finite() && p[1].is_finite());
    pts.sort_by(|a, b| a[0].total_cmp(&b[0]).then(a[1].total_cmp(&b[1])));
    pts.dedup();
    if pts.len() < 3 {
        return pts;
    }
    let cruz = |o: P2, a: P2, b: P2| (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    let mut h: Vec<P2> = Vec::with_capacity(pts.len() + 1);
    for passada in 0..2 {
        let piso = h.len();
        let iter: Box<dyn Iterator<Item = &P2>> = if passada == 0 { Box::new(pts.iter()) } else { Box::new(pts.iter().rev()) };
        for &p in iter {
            while h.len() >= piso + 2 && cruz(h[h.len() - 2], h[h.len() - 1], p) <= 1e-15 {
                h.pop();
            }
            h.push(p);
        }
        h.pop();
    }
    h
}

/// Um elemento da estrutura com os seus prismas (na ordem de `parte`).
#[derive(Clone, Debug)]
pub struct ElementoEstr {
    pub num: u32,
    pub categoria: u32,
    pub nivel: u32,
    pub tipo: u32,
    pub material: u32,
    /// Pilar: disciplina do tipo; viga e fundação: estrutural.
    pub disciplina: u8,
    pub pecas: Vec<PecaEstr>,
    /// Posição do pilar e da fundação isolada.
    pub centro: Option<P2>,
    /// Eixo da viga (com as cotas das pontas) e da fundação corrida (na cota do topo), sem aparo.
    pub eixo: Option<[P3; 2]>,
    /// Altura do pilar, eixo 3D da viga, comprimento da corrida, comprimento da estaca ou altura total da isolada.
    pub comprimento: f64,
}

type Cache = BTreeMap<(u32, u32, u32), Option<Rc<Contorno>>>;

fn perfil_rc(cache: &mut Cache, cena: &Cena, chave: (u32, u32, u32), p: &PerfilLinha, lados: usize) -> Option<Rc<Contorno>> {
    cache.entry(chave).or_insert_with(|| contorno_do_tipo(&cena.estr, p, lados).ok().map(Rc::new)).clone()
}

fn finito(q: &Quadro3) -> bool {
    q.origem.iter().chain(&q.ex).chain(&q.ey).chain(&q.eixo).all(|c| c.is_finite())
}

fn peca(parte: u32, contorno: Rc<Contorno>, quadro: Quadro3) -> Option<PecaEstr> {
    finito(&quadro).then_some(PecaEstr { parte, contorno, quadro })
}

fn quadro_vertical(pos: P2, rotacao: f64, z: f64, dz: f64) -> Quadro3 {
    let (s, c) = rotacao.sin_cos();
    Quadro3 { origem: [pos[0], pos[1], z], ex: [c, s, 0.0], ey: [-s, c, 0.0], eixo: [0.0, 0.0, dz] }
}

/// Os elementos do nível (`NIVEL_TODOS` = todos) em ordem de categoria e `id_num`, no LOD pedido. Os que não formam geometria ficam de fora.
pub fn elementos(cena: &Cena, nivel: u32, lod: u32) -> Vec<ElementoEstr> {
    let (estr, lados) = (&cena.estr, lados_por_lod(lod));
    let do_nivel = |n: u32| nivel == NIVEL_TODOS || n == nivel;
    let mut cache: Cache = BTreeMap::new();
    let mut out = Vec::new();
    for (&num, l) in estr.pilares.iter().filter(|(_, l)| do_nivel(l.nivel)) {
        let Some(t) = estr.tipos_pilar.get(&l.tipo) else { continue };
        let Some(c) = perfil_rc(&mut cache, cena, (CATEGORIA_PILAR, l.tipo, PARTE_CORPO), &t.perfil, lados) else { continue };
        let Ok((base, topo)) = base_e_topo(cena, l) else { continue };
        let q = quadro_pilar(l, base, topo);
        let Some(corpo) = peca(PARTE_CORPO, Rc::clone(&c), q) else { continue };
        let mut pecas = vec![corpo];
        if t.disciplina == DISCIPLINA_ARQUITETONICO {
            let casca = cache.entry((CATEGORIA_PILAR, l.tipo, PARTE_CAMADAS)).or_insert_with(|| casca_camadas(&c, t.espessura_camadas).map(|m| Rc::new(m.contorno))).clone();
            pecas.extend(casca.and_then(|k| peca(PARTE_CAMADAS, k, q)));
        }
        let e = ElementoEstr { num, categoria: CATEGORIA_PILAR, nivel: l.nivel, tipo: l.tipo, material: t.material, disciplina: t.disciplina, pecas, centro: Some(l.pos), eixo: None, comprimento: topo - base };
        out.push(e);
    }
    for (&num, l) in estr.vigas.iter().filter(|(_, l)| do_nivel(l.nivel)) {
        let Some(t) = estr.tipos_viga.get(&l.tipo) else { continue };
        let Some(c) = perfil_rc(&mut cache, cena, (CATEGORIA_VIGA, l.tipo, PARTE_CORPO), &t.perfil, lados) else { continue };
        let (Ok(q), Ok(cota)) = (quadro_viga(cena, l, c.faixa_y()), cota_do_nivel(cena, l.nivel)) else { continue };
        let Some(corpo) = peca(PARTE_CORPO, c, q) else { continue };
        let eixo = [[l.a[0], l.a[1], cota + l.deslocamento_z[0]], [l.b[0], l.b[1], cota + l.deslocamento_z[1]]];
        let comprimento = (0..3).map(|k| (eixo[1][k] - eixo[0][k]).powi(2)).sum::<f64>().sqrt();
        let e = ElementoEstr { num, categoria: CATEGORIA_VIGA, nivel: l.nivel, tipo: l.tipo, material: t.material, disciplina: DISCIPLINA_ESTRUTURAL, pecas: vec![corpo], centro: None, eixo: Some(eixo), comprimento };
        out.push(e);
    }
    for (&num, l) in estr.fundacoes.iter().filter(|(_, l)| do_nivel(l.nivel)) {
        let Some(t) = estr.tipos_fundacao.get(&l.tipo) else { continue };
        let Some(base) = perfil_rc(&mut cache, cena, (CATEGORIA_FUNDACAO, l.tipo, PARTE_BASE), &t.base, lados) else { continue };
        let Ok(cota) = cota_do_nivel(cena, l.nivel) else { continue };
        let topo = cota + l.deslocamento_topo;
        if !topo.is_finite() || !t.altura_base.is_finite() || t.altura_base <= 0.0 {
            continue;
        }
        let mut e = ElementoEstr { num, categoria: CATEGORIA_FUNDACAO, nivel: l.nivel, tipo: l.tipo, material: t.material, disciplina: DISCIPLINA_ESTRUTURAL, pecas: Vec::new(), centro: None, eixo: None, comprimento: 0.0 };
        match (t.modo, l.pos, l.eixo) {
            (FUNDACAO_CORRIDA, None, Some((a, b))) if t.forma != FUNDACAO_ESTACA => {
                let Ok(q) = quadro_corrida(a, b, topo, base.faixa_y()) else { continue };
                e.pecas.extend(peca(PARTE_BASE, base, q));
                e.eixo = Some([[a[0], a[1], topo], [b[0], b[1], topo]]);
                e.comprimento = (b[0] - a[0]).hypot(b[1] - a[1]);
            }
            (FUNDACAO_ISOLADA, Some(pos), None) => {
                let (topo_base, pescoco) = match t.pescoco {
                    Some((p, altura)) if t.forma != FUNDACAO_ESTACA && altura.is_finite() && altura > 0.0 => {
                        let Some(c) = perfil_rc(&mut cache, cena, (CATEGORIA_FUNDACAO, l.tipo, PARTE_PESCOCO), &p, lados) else { continue };
                        (topo - altura, Some((c, altura)))
                    }
                    Some(_) => continue,
                    None => (topo, None),
                };
                e.pecas.extend(peca(PARTE_BASE, base, quadro_vertical(pos, l.rotacao, topo_base, -t.altura_base)));
                if let Some((c, altura)) = pescoco {
                    e.pecas.extend(peca(PARTE_PESCOCO, c, quadro_vertical(pos, l.rotacao, topo_base, altura)));
                }
                e.centro = Some(pos);
                e.comprimento = topo - topo_base + t.altura_base;
            }
            _ => continue,
        }
        if !e.pecas.is_empty() {
            out.push(e);
        }
    }
    out
}

/// Os elementos do nível com as vigas aparadas no contorno dos pilares estruturais (de qualquer nível; A.4.5 c).
pub fn elementos_aparados(cena: &Cena, nivel: u32, lod: u32) -> Vec<ElementoEstr> {
    let mut todos = elementos(cena, NIVEL_TODOS, lod);
    let aparos = crate::estr_juncoes::aparos(&todos);
    crate::estr_juncoes::aplicar_aparos(&mut todos, &aparos);
    todos.retain(|e| nivel == NIVEL_TODOS || e.nivel == nivel);
    todos
}

/// Uma linha de planta ou de corte, em coordenadas da vista.
#[derive(Clone, Debug, PartialEq)]
pub struct LinhaEstr {
    pub elemento: u32,
    pub categoria: u32,
    pub estilo: u32,
    pub papel: u32,
    pub fechada: bool,
    pub pontos: Vec<P2>,
}

/// Saídas `linhas [elemento, categoria, estilo, papel, n_pontos]` e `pontos [x, y]`; linha fechada repete o primeiro ponto.
pub fn achatar(linhas: &[LinhaEstr]) -> Vec<Saida> {
    let (mut tab, mut pts) = (Vec::with_capacity(5 * linhas.len()), Vec::new());
    for l in linhas {
        let extra = usize::from(l.fechada && !l.pontos.is_empty());
        tab.extend([l.elemento, l.categoria, l.estilo, l.papel, (l.pontos.len() + extra) as u32]);
        for p in l.pontos.iter().chain(l.pontos.first().filter(|_| l.fechada)) {
            pts.extend(p);
        }
    }
    vec![Saida::U32(tab), Saida::F64(pts)]
}

/// Linhas de planta dos elementos (já filtrados e aparados) contra o corte `corte_z`.
pub fn planta(elementos: &[ElementoEstr], corte_z: f64, lod: u32) -> Vec<LinhaEstr> {
    let mut out = Vec::new();
    let horizontal = [0.0, 0.0, 1.0];
    for e in elementos {
        let linha = |estilo: u32, papel: u32, pontos: Vec<P2>| LinhaEstr { elemento: e.num, categoria: e.categoria, estilo, papel, fechada: true, pontos };
        for p in &e.pecas {
            let [z0, z1] = p.faixa_z();
            if z0 > corte_z {
                continue;
            }
            if p.parte == PARTE_CAMADAS {
                if lod >= 2 && z1 >= corte_z {
                    for (furo, anel) in crate::estr_corte::secao(&p.contorno, &p.quadro, horizontal, corte_z) {
                        if !furo {
                            out.push(linha(ESTILO_CHEIO, PAPEL_CAMADA, xy(&anel)));
                        }
                    }
                }
            } else if z1 < corte_z {
                let estilo = if e.categoria == CATEGORIA_PILAR { ESTILO_CHEIO } else { ESTILO_TRACEJADO };
                out.push(linha(estilo, PAPEL_PROJETADO, p.contorno_planta()));
            } else {
                for (furo, anel) in crate::estr_corte::secao(&p.contorno, &p.quadro, horizontal, corte_z) {
                    out.push(linha(ESTILO_CHEIO, if furo { PAPEL_FURO } else { PAPEL_ANEL }, xy(&anel)));
                }
            }
        }
    }
    out
}

fn xy(pts: &[P3]) -> Vec<P2> {
    pts.iter().map(|p| [p[0], p[1]]).collect()
}

/// Consulta 201 `estr_planta` (`detalhe` acima de 2 vale como 2).
pub fn consulta_estr_planta(cena: &Cena, nivel: u32, corte_z: f64, detalhe: u32) -> Result<Vec<Saida>, u32> {
    let lod = detalhe.min(2);
    Ok(achatar(&planta(&elementos_aparados(cena, nivel, lod), corte_z, lod)))
}
