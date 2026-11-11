//! Resolução da parede cortina (decisão 0056, §5.2 a §5.4): a partir das seções 100 a 105 monta, por cortina, a grade (arestas, células, segmentos),
//! os montantes com a prioridade de junção, os painéis com a área livre e os avisos. É a FONTE ÚNICA de planta, malha, quantidades e avisos: nenhuma
//! consulta deriva peça por conta própria, então desenho e quantidade nunca divergem. Segue a referência TS (`cortinaRef/pecas.ts`).
//!
//! Convenções: `s` (ou `t`) ao longo do eixo de `a` para `b` (comprimento `L`), `z` para cima a partir de `z_base`, `yp` na profundidade a partir do
//! plano central, positivo para fora.
//!
//! Montantes (decisões do dono, 2026-11-10): o montante de BORDA fica EMBUTIDO em `[0, L] × [0, H]` (a face externa rente à ponta): o centro dele é a
//! meia largura para dentro da borda nominal da grade; os interiores ficam centrados na linha. As peças são POR SEGMENTO: a contínua corre de linha
//! a linha (centro a centro, sem aparo; a de borda corre até a ponta) e a quebrada para na face do contínuo (centro do contínuo mais ou menos a meia
//! largura). `round` usa profundidade = largura. A cortina de fora (arco, degenerada) só devolve o aviso.

use crate::cena::Cena;
use crate::cortina_grade::{arestas, linhas_do_eixo, IndiceGrades};
use crate::cortina_tipos::*;
use crate::esquema::{
    AVISO_CORTINA_ARCO_NAO_SUPORTADO, AVISO_CORTINA_CELULA_PEQUENA, AVISO_CORTINA_MONTANTE_SOBREPOSTO, AVISO_CORTINA_PROFUNDIDADE_MENOR_QUE_PERFIL,
    ENTRADA, ID_AUSENTE, LIMITE, NIVEL_TODOS,
};
use crate::secoes_cortina::SecoesCortina;

/// Um tipo de montante já conferido (só as formas retas valem na fase 1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Montante {
    pub tipo: u32,
    pub forma: u8,
    pub largura: f64,
    pub profundidade: f64,
    /// Deslocamento do perfil na profundidade (m, positivo para fora).
    pub desloc: f64,
    pub material: u32,
}

impl Montante {
    /// Profundidade que o perfil ocupa (o redondo usa o diâmetro).
    pub fn prof(&self) -> f64 {
        if self.forma == FORMA_REDONDA {
            self.largura
        } else {
            self.profundidade
        }
    }

    /// Área da seção reta (m²).
    pub fn area_secao(&self) -> f64 {
        if self.forma == FORMA_REDONDA {
            std::f64::consts::PI * self.largura * self.largura / 4.0
        } else {
            self.largura * self.profundidade
        }
    }

    /// Perímetro da seção (m).
    pub fn perimetro(&self) -> f64 {
        if self.forma == FORMA_REDONDA {
            std::f64::consts::PI * self.largura
        } else {
            2.0 * (self.largura + self.profundidade)
        }
    }
}

/// Um tipo de painel já conferido.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PainelTipo {
    pub tipo: u32,
    pub kind: u8,
    pub espessura: f64,
    pub desloc: f64,
    pub encaixe: f64,
    pub material: u32,
}

/// Uma célula da grade, entre linhas consecutivas e bordas (retângulo cheio, sem descontar montantes).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Celula {
    pub i: u32,
    pub j: u32,
    pub s0: f64,
    pub s1: f64,
    pub z0: f64,
    pub z1: f64,
    /// Tipo de painel da célula (sempre há o padrão).
    pub painel: u32,
    pub flags: u32,
}

/// Segmento de uma linha, entre duas linhas que a cruzam (ou uma borda), nominal (centro a centro, sem aparo). `linha` é a aresta (0 e `n` são as bordas).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Segmento {
    pub eixo: u8,
    pub linha: u32,
    pub k: u32,
    pub de: f64,
    pub ate: f64,
    pub papel: u32,
    /// `ID_AUSENTE` = sem montante nesse papel.
    pub montante: u32,
}

/// Peça de montante: um prisma do perfil, uma por segmento. `eixo` `EIXO_U`: vertical na linha de centro `pos` (s), de `de` a `ate` (z).
/// `EIXO_V`: horizontal na linha de centro `pos` (z), de `de` a `ate` (s). `k` é o índice do segmento; `continuo`: corre sem aparo.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PecaMont {
    pub eixo: u8,
    pub linha: u32,
    pub k: u32,
    pub papel: u32,
    pub m: Montante,
    pub pos: f64,
    pub de: f64,
    pub ate: f64,
    pub continuo: bool,
}

impl PecaMont {
    pub fn comprimento(&self) -> f64 {
        self.ate - self.de
    }
}

/// Painel de uma célula: o retângulo livre (a célula menos a meia largura dos montantes que a margeiam). Há um por célula, mesmo sem área.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PainelPeca {
    pub i: u32,
    pub j: u32,
    pub p: PainelTipo,
    /// Retângulo livre BRUTO (pode sair invertido numa célula menor que os montantes; use as larguras, que não são negativas).
    pub s0: f64,
    pub s1: f64,
    pub z0: f64,
    pub z1: f64,
    /// Há montante à esquerda, à direita, embaixo e em cima (o painel entra `encaixe` nele).
    pub lados: [bool; 4],
}

impl PainelPeca {
    pub fn largura_livre(&self) -> f64 {
        (self.s1 - self.s0).max(0.0)
    }

    pub fn altura_livre(&self) -> f64 {
        (self.z1 - self.z0).max(0.0)
    }

    fn bite(&self) -> f64 {
        if self.p.kind == PAINEL_VAZIO {
            0.0
        } else {
            self.p.encaixe
        }
    }

    /// Tem área para virar peça.
    pub fn tem_area(&self) -> bool {
        self.largura_livre() > 1e-9 && self.altura_livre() > 1e-9
    }

    /// Retângulo da caixa do painel: o livre mais o encaixe nos lados com montante. `(s0, s1, z0, z1)`.
    pub fn retangulo_bruto(&self) -> (f64, f64, f64, f64) {
        let b = self.bite();
        let f = |tem: bool| if tem { b } else { 0.0 };
        (self.s0 - f(self.lados[0]), self.s1 + f(self.lados[1]), self.z0 - f(self.lados[2]), self.z1 + f(self.lados[3]))
    }

    /// Área visível (retângulo livre).
    pub fn area_visivel(&self) -> f64 {
        self.largura_livre() * self.altura_livre()
    }

    /// Área bruta: livre mais o encaixe nos lados com montante (a visível quando é vazio ou não tem área).
    pub fn area_bruta(&self) -> f64 {
        if self.p.kind == PAINEL_VAZIO || !self.tem_area() {
            return self.area_visivel();
        }
        let b = self.bite();
        let (nl, nr, nb, nt) = (u8::from(self.lados[0]), u8::from(self.lados[1]), u8::from(self.lados[2]), u8::from(self.lados[3]));
        (self.largura_livre() + b * f64::from(nl + nr)) * (self.altura_livre() + b * f64::from(nb + nt))
    }

    pub fn perimetro_livre(&self) -> f64 {
        2.0 * (self.largura_livre() + self.altura_livre())
    }
}

/// Aviso com a posição no mundo (`x, y, z`). Os índices `i`, `j` dependem do código (ver `cortina_avisos`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AvisoC {
    pub codigo: u32,
    pub i: u32,
    pub j: u32,
    pub medido: f64,
    pub limite: f64,
    pub p: [f64; 3],
}

/// A cortina resolvida.
#[derive(Clone, Debug)]
pub struct Geom {
    pub l: f64,
    pub h: f64,
    /// Profundidade do sistema.
    pub d: f64,
    pub z_base: f64,
    pub a: [f64; 2],
    /// Direção do eixo (unitária) e normal à esquerda.
    pub u: [f64; 2],
    pub n: [f64; 2],
    /// `-1` quando a parede é invertida; a direção "para fora" é `sigma · n`.
    pub sigma: f64,
    /// Posição do plano central em `s` (m).
    pub s_mid: f64,
    /// Arestas NOMINAIS de cada eixo (`0`, as linhas internas e o comprimento).
    pub us: Vec<f64>,
    pub vs: Vec<f64>,
    /// Centro de cada montante por aresta: o interior fica na linha; o de borda fica embutido (a meia largura para dentro).
    pub cu: Vec<f64>,
    pub cv: Vec<f64>,
    /// `ORIGEM_GERADA` ou `ORIGEM_MANUAL`.
    pub origem_u: u32,
    pub origem_v: u32,
    pub prioridade: u8,
    pub min_cell: f64,
    /// Montante de cada aresta e o seu papel.
    pub mont_u: Vec<Option<Montante>>,
    pub mont_v: Vec<Option<Montante>>,
    pub papel_u: Vec<u32>,
    pub papel_v: Vec<u32>,
    pub painel_padrao: PainelTipo,
    pub celulas: Vec<Celula>,
    pub segmentos: Vec<Segmento>,
    pub pecas: Vec<PecaMont>,
    pub paineis: Vec<PainelPeca>,
}

impl Geom {
    pub fn nu(&self) -> usize {
        self.us.len() - 1
    }

    pub fn nv(&self) -> usize {
        self.vs.len() - 1
    }

    /// Índice global de uma linha: U = `0..=nu`, V = `nu+1..=nu+1+nv`.
    pub fn linha_global(&self, eixo: u8, linha: u32) -> u32 {
        if eixo == EIXO_U {
            linha
        } else {
            self.nu() as u32 + 1 + linha
        }
    }

    /// Ponto do mundo para `(t, yp, z)`: `t` ao longo do eixo, `yp` na profundidade (positivo para fora, a partir do plano central) e `z` acima da base.
    pub fn mundo(&self, t: f64, yp: f64, z: f64) -> [f64; 3] {
        let s = self.s_mid + self.sigma * yp;
        [self.a[0] + self.u[0] * t + self.n[0] * s, self.a[1] + self.u[1] * t + self.n[1] * s, self.z_base + z]
    }

    /// Largura vista do montante de cada aresta vertical (0 sem montante).
    pub fn largura_u(&self, i: usize) -> f64 {
        self.mont_u.get(i).copied().flatten().map(|m| m.largura).unwrap_or(0.0)
    }

    pub fn largura_v(&self, j: usize) -> f64 {
        self.mont_v.get(j).copied().flatten().map(|m| m.largura).unwrap_or(0.0)
    }
}

/// Uma cortina de `cortinas`. Sem `g` quando a cortina ficou de fora (degenerada ou em arco): só os avisos.
#[derive(Clone, Debug)]
pub struct CortinaR {
    pub id: u32,
    pub nivel: u32,
    pub tipo: u32,
    pub g: Option<Geom>,
    pub avisos: Vec<AvisoC>,
}

fn montante_de(sec: &SecoesCortina, id: u32) -> Result<Option<Montante>, u32> {
    if id == ID_AUSENTE {
        return Ok(None);
    }
    let m = sec.montantes.get(&id).ok_or(ENTRADA)?;
    // L, trapézio e canto chegam na fase 3.
    if m.forma > FORMA_REDONDA || m.largura <= 0.0 || m.profundidade <= 0.0 {
        return Err(ENTRADA);
    }
    Ok(Some(Montante { tipo: id, forma: m.forma, largura: m.largura, profundidade: m.profundidade, desloc: m.deslocamento, material: m.material }))
}

fn painel_de(sec: &SecoesCortina, id: u32) -> Result<PainelTipo, u32> {
    let p = sec.paineis.get(&id).ok_or(ENTRADA)?;
    if (p.tipo != PAINEL_VAZIO && p.espessura <= 0.0) || (!p.encaixe.is_nan() && p.encaixe < 0.0) {
        return Err(ENTRADA);
    }
    Ok(PainelTipo { tipo: id, kind: p.tipo, espessura: p.espessura, desloc: p.deslocamento, encaixe: if p.encaixe.is_nan() { ENCAIXE_PADRAO } else { p.encaixe }, material: p.material })
}

/// Resolve as cortinas do nível (`NIVEL_TODOS` = todas), em ordem crescente de id. `ENTRADA` para seção inconsistente (inclusive ângulo de grade ≠ 0 até a
/// fase 7), `LIMITE` para o que passa dos máximos.
pub fn resolver(cena: &Cena, nivel: u32) -> Result<Vec<CortinaR>, u32> {
    let sec = &cena.cortina;
    if sec.cortinas.is_empty() {
        return Ok(Vec::new());
    }
    sec.validar_referencias()?;
    let grades = IndiceGrades::novo(sec);
    let mut out = Vec::new();
    for &id in sec.cortinas.keys() {
        if nivel != NIVEL_TODOS && sec.cortinas.get(&id).map(|c| c.nivel) != Some(nivel) {
            continue;
        }
        out.push(resolver_uma(sec, &grades, id)?);
    }
    Ok(out)
}

fn resolver_uma(sec: &SecoesCortina, grades: &IndiceGrades, id: u32) -> Result<CortinaR, u32> {
    let c = sec.cortinas.get(&id).ok_or(ENTRADA)?;
    let t = sec.tipos.get(&c.tipo).ok_or(ENTRADA)?;
    let mut r = CortinaR { id, nivel: c.nivel, tipo: c.tipo, g: None, avisos: Vec::new() };
    let (dx, dy) = (c.b[0] - c.a[0], c.b[1] - c.a[1]);
    let l = dx.hypot(dy);
    let h = c.altura;
    if l < COMPRIMENTO_MIN || h < ALTURA_MIN {
        return Ok(r); // degenerada: fica de fora, sem aviso
    }
    let u = [dx / l, dy / l];
    let n = [-u[1], u[0]];
    let d = t.profundidade;
    if c.sag.abs() > 1e-9 {
        let p = [c.a[0] + u[0] * l / 2.0, c.a[1] + u[1] * l / 2.0, c.z_base + h / 2.0];
        r.avisos.push(AvisoC { codigo: AVISO_CORTINA_ARCO_NAO_SUPORTADO, i: ID_AUSENTE, j: ID_AUSENTE, medido: c.sag, limite: 0.0, p });
        return Ok(r);
    }
    let eu = grades.efetivo(c.tipo, id, EIXO_U)?;
    let ev = grades.efetivo(c.tipo, id, EIXO_V)?;
    let lu = linhas_do_eixo(l, &eu)?;
    let lv = linhas_do_eixo(h, &ev)?;
    let us = arestas(l, &lu.linhas);
    let vs = arestas(h, &lv.linhas);
    let (nu, nv) = (us.len() - 1, vs.len() - 1);
    if nu.saturating_mul(nv) > LIMITE_CELULAS {
        return Err(LIMITE);
    }

    // Quadro: o plano central e o lado de fora (mesma conta de `buildFrame`: sExt = sinal · extOffset, sInt = sExt − sinal · profundidade).
    let ext = match c.loc {
        0 | 1 => d / 2.0,
        2 | 4 => 0.0,
        _ => d,
    };
    let sigma = if c.invertida { -1.0 } else { 1.0 };
    let s_mid = sigma * (ext - d / 2.0);

    // Montantes por papel e painel padrão.
    let m = |k: usize| montante_de(sec, t.montantes[k]);
    let (m_iv, m_ih, m_bi, m_bf, m_bb, m_bt) = (m(0)?, m(1)?, m(2)?, m(3)?, m(4)?, m(5)?);
    let painel_padrao = painel_de(sec, if c.painel_padrao != ID_AUSENTE { c.painel_padrao } else { t.painel_padrao })?;
    let min_cell = if t.celula_minima.is_nan() { CELULA_MINIMA_PADRAO } else { t.celula_minima };
    let mont_u: Vec<Option<Montante>> = (0..=nu).map(|i| if i == 0 { m_bi } else if i == nu { m_bf } else { m_iv }).collect();
    let papel_u: Vec<u32> = (0..=nu).map(|i| if i == 0 { PAPEL_BORDA_INI } else if i == nu { PAPEL_BORDA_FIM } else { PAPEL_INT_V }).collect();
    let mont_v: Vec<Option<Montante>> = (0..=nv).map(|j| if j == 0 { m_bb } else if j == nv { m_bt } else { m_ih }).collect();
    let papel_v: Vec<u32> = (0..=nv).map(|j| if j == 0 { PAPEL_BORDA_BASE } else if j == nv { PAPEL_BORDA_TOPO } else { PAPEL_INT_H }).collect();
    // Centros: os montantes de borda ficam embutidos em [0, L] x [0, H]; os interiores, sobre a linha.
    let centros = |arestas: &[f64], mont: &[Option<Montante>], comprimento: f64| -> Vec<f64> {
        let n = arestas.len() - 1;
        (0..=n)
            .map(|k| match mont[k] {
                Some(x) if k == 0 => x.largura / 2.0,
                Some(x) if k == n => comprimento - x.largura / 2.0,
                _ => arestas[k],
            })
            .collect()
    };
    let (cu, cv) = (centros(&us, &mont_u, l), centros(&vs, &mont_v, h));
    let origem = |e: &crate::cortina_tipos::EixoEfetivo| if e.modo == MODO_MANUAL { ORIGEM_MANUAL } else { ORIGEM_GERADA };

    let mut g = Geom {
        l,
        h,
        d,
        z_base: c.z_base,
        a: c.a,
        u,
        n,
        sigma,
        s_mid,
        us,
        vs,
        cu,
        cv,
        origem_u: origem(&eu),
        origem_v: origem(&ev),
        prioridade: t.prioridade,
        min_cell,
        mont_u,
        mont_v,
        papel_u,
        papel_v,
        painel_padrao,
        celulas: Vec::new(),
        segmentos: Vec::new(),
        pecas: Vec::new(),
        paineis: Vec::new(),
    };

    // Segmentos nominais: cada linha de U corre na vertical (um por fileira) e cada linha de V na horizontal (um por coluna).
    for i in 0..=nu {
        for k in 0..nv {
            g.segmentos.push(Segmento { eixo: EIXO_U, linha: i as u32, k: k as u32, de: g.vs[k], ate: g.vs[k + 1], papel: g.papel_u[i], montante: g.mont_u[i].map(|x| x.tipo).unwrap_or(ID_AUSENTE) });
        }
    }
    for j in 0..=nv {
        for k in 0..nu {
            g.segmentos.push(Segmento { eixo: EIXO_V, linha: j as u32, k: k as u32, de: g.us[k], ate: g.us[k + 1], papel: g.papel_v[j], montante: g.mont_v[j].map(|x| x.tipo).unwrap_or(ID_AUSENTE) });
        }
    }

    // Células e painéis (um por célula, mesmo sem área livre).
    for i in 0..nu {
        for j in 0..nv {
            let (fs0, fs1) = (g.cu[i] + g.largura_u(i) / 2.0, g.cu[i + 1] - g.largura_u(i + 1) / 2.0);
            let (fz0, fz1) = (g.cv[j] + g.largura_v(j) / 2.0, g.cv[j + 1] - g.largura_v(j + 1) / 2.0);
            let lados = [g.mont_u[i].is_some(), g.mont_u[i + 1].is_some(), g.mont_v[j].is_some(), g.mont_v[j + 1].is_some()];
            let painel = PainelPeca { i: i as u32, j: j as u32, p: painel_padrao, s0: fs0, s1: fs1, z0: fz0, z1: fz1, lados };
            let menor = painel.largura_livre().min(painel.altura_livre());
            let mut flags = 0;
            if menor < min_cell - EPS_CONTAGEM {
                flags |= CELULA_PEQUENA;
                let p = g.mundo((g.us[i] + g.us[i + 1]) / 2.0, 0.0, (g.vs[j] + g.vs[j + 1]) / 2.0);
                r.avisos.push(AvisoC { codigo: AVISO_CORTINA_CELULA_PEQUENA, i: i as u32, j: j as u32, medido: menor, limite: min_cell, p });
            }
            g.paineis.push(painel);
            g.celulas.push(Celula { i: i as u32, j: j as u32, s0: g.us[i], s1: g.us[i + 1], z0: g.vs[j], z1: g.vs[j + 1], painel: painel_padrao.tipo, flags });
        }
    }

    // Montantes por segmento. O contínuo corre de linha a linha (centro a centro); o quebrado para na face do contínuo.
    let vertical_continua = t.prioridade == PRIORIDADE_VERTICAL;
    for i in 0..=nu {
        let Some(mt) = g.mont_u[i] else { continue };
        for k in 0..nv {
            let (de, ate) = if vertical_continua { (g.vs[k], g.vs[k + 1]) } else { (g.cv[k] + g.largura_v(k) / 2.0, g.cv[k + 1] - g.largura_v(k + 1) / 2.0) };
            if ate - de > TOL_POS {
                g.pecas.push(PecaMont { eixo: EIXO_U, linha: i as u32, k: k as u32, papel: g.papel_u[i], m: mt, pos: g.cu[i], de, ate, continuo: vertical_continua });
            }
        }
    }
    for j in 0..=nv {
        let Some(mt) = g.mont_v[j] else { continue };
        for k in 0..nu {
            let (de, ate) = if !vertical_continua { (g.us[k], g.us[k + 1]) } else { (g.cu[k] + g.largura_u(k) / 2.0, g.cu[k + 1] - g.largura_u(k + 1) / 2.0) };
            if ate - de > TOL_POS {
                g.pecas.push(PecaMont { eixo: EIXO_V, linha: j as u32, k: k as u32, papel: g.papel_v[j], m: mt, pos: g.cv[j], de, ate, continuo: !vertical_continua });
            }
        }
    }

    // Avisos de montante: duas linhas vizinhas (bordas contam) mais próximas que a meia soma das larguras, medido entre os CENTROS dos montantes.
    for (eixo, cs, ms) in [(EIXO_U, &g.cu, &g.mont_u), (EIXO_V, &g.cv, &g.mont_v)] {
        for k in 0..cs.len() - 1 {
            if let (Some(a), Some(b)) = (ms[k], ms[k + 1]) {
                let (dist, lim) = (cs[k + 1] - cs[k], (a.largura + b.largura) / 2.0);
                if dist < lim - EPS_CONTAGEM {
                    let meio = (cs[k] + cs[k + 1]) / 2.0;
                    let (i, j, p) = if eixo == EIXO_U { (k as u32, ID_AUSENTE, g.mundo(meio, 0.0, 0.0)) } else { (ID_AUSENTE, k as u32, g.mundo(0.0, 0.0, meio)) };
                    r.avisos.push(AvisoC { codigo: AVISO_CORTINA_MONTANTE_SOBREPOSTO, i, j, medido: dist, limite: lim, p });
                }
            }
        }
    }
    // Informativos do cálculo dos eixos (sobra fundida e posição fora do vão): `i` é o índice no eixo U e `j`, no eixo V.
    for (eixo, la) in [(EIXO_U, &lu), (EIXO_V, &lv)] {
        for a in &la.avisos {
            let (i, j, p) = if eixo == EIXO_U { (a.indice, ID_AUSENTE, g.mundo(a.pos, 0.0, 0.0)) } else { (ID_AUSENTE, a.indice, g.mundo(0.0, 0.0, a.pos)) };
            r.avisos.push(AvisoC { codigo: a.codigo, i, j, medido: a.medido, limite: a.limite, p });
        }
    }
    // Perfil mais fundo que o sistema: um aviso por tipo de montante usado; `i` leva o `id_num` do tipo.
    let mut fundos: Vec<Montante> = Vec::new();
    for mt in g.mont_u.iter().chain(g.mont_v.iter()).flatten() {
        if mt.prof() > d + EPS_CONTAGEM && !fundos.iter().any(|x| x.tipo == mt.tipo) {
            fundos.push(*mt);
        }
    }
    for mt in fundos {
        r.avisos.push(AvisoC { codigo: AVISO_CORTINA_PROFUNDIDADE_MENOR_QUE_PERFIL, i: mt.tipo, j: ID_AUSENTE, medido: mt.prof(), limite: d, p: g.mundo(0.0, 0.0, 0.0) });
    }
    r.avisos.sort_by(|a, b| a.codigo.cmp(&b.codigo).then(a.i.cmp(&b.i)).then(a.j.cmp(&b.j)).then(a.medido.total_cmp(&b.medido)));
    r.g = Some(g);
    Ok(r)
}

/// Tabela de PARÂMETROS das peças (o equivalente de `cortinaRef/pecas.ts`), no formato de `cortina_pecas` da referência TS, para a paridade comparar as
/// peças sem decodificar as matrizes de `cortina_malha`. Não é uma consulta do contrato. Valores na grade de 1 µm.
///
/// - `montantes` `[cortina_num, papel, tipo_num, linha (global), k, vertical (0/1), continuo (0/1)]` e `montantes_geo` `[s, z, comprimento, largura,
///   profundidade]`: `s` e `z` são o início da peça (vertical: `s` = o centro da linha, `z` = o início; horizontal: `s` = o início, `z` = o centro);
/// - `paineis` `[cortina_num, i, j, tipo_num, papel (10 vidro, 11 sólido, 12 vazio)]` e `paineis_geo` `[s0, s1, z0, z1, area_visivel, area_bruta]`
///   (retângulo livre bruto).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TabelaPecas {
    pub montantes: Vec<u32>,
    pub montantes_geo: Vec<f64>,
    pub paineis: Vec<u32>,
    pub paineis_geo: Vec<f64>,
}

pub fn tabela_pecas(cena: &Cena, nivel: u32) -> Result<TabelaPecas, u32> {
    let mut t = TabelaPecas::default();
    for c in resolver(cena, nivel)? {
        let Some(g) = &c.g else { continue };
        for p in &g.pecas {
            let vertical = p.eixo == EIXO_U;
            t.montantes.extend_from_slice(&[c.id, p.papel, p.m.tipo, g.linha_global(p.eixo, p.linha), p.k, u32::from(vertical), u32::from(p.continuo)]);
            let (s, z) = if vertical { (p.pos, p.de) } else { (p.de, p.pos) };
            t.montantes_geo.extend_from_slice(&[na_grade(s), na_grade(z), na_grade(p.comprimento()), na_grade(p.m.largura), na_grade(p.m.prof())]);
        }
        for p in &g.paineis {
            let papel = match p.p.kind {
                PAINEL_VIDRO => PAPEL_PAINEL_VIDRO,
                PAINEL_SOLIDO => PAPEL_PAINEL_SOLIDO,
                _ => PAPEL_PAINEL_VAZIO,
            };
            t.paineis.extend_from_slice(&[c.id, p.i, p.j, p.p.tipo, papel]);
            t.paineis_geo.extend_from_slice(&[na_grade(p.s0), na_grade(p.s1), na_grade(p.z0), na_grade(p.z1), na_grade(p.area_visivel()), na_grade(p.area_bruta())]);
        }
    }
    Ok(t)
}

#[cfg(test)]
pub(crate) mod testes {
    use super::*;
    use crate::secoes_cortina::*;

    /// Ids usados pelas cenas de teste.
    pub(crate) const TIPO: u32 = 1;
    pub(crate) const M_RET: u32 = 1; // retangular 50 x 100 mm
    pub(crate) const M_RED: u32 = 2; // redondo 50 mm
    pub(crate) const P_VIDRO: u32 = 1; // vidro 10 mm
    pub(crate) const P_SOLIDO: u32 = 2; // sólido 4 mm
    pub(crate) const P_VAZIO: u32 = 3;

    /// Especificação de um tipo de teste.
    pub(crate) struct Espec {
        pub u: EixoEfetivo,
        pub v: EixoEfetivo,
        /// `[int_v, int_h, borda_ini, borda_fim, borda_base, borda_topo]`
        pub mont: [u32; 6],
        pub prioridade: u8,
        pub painel: u32,
        pub profundidade: f64,
        pub celula_minima: f64,
    }

    impl Espec {
        pub(crate) fn novo(u: EixoEfetivo, v: EixoEfetivo) -> Espec {
            Espec { u, v, mont: [M_RET; 6], prioridade: PRIORIDADE_VERTICAL, painel: P_VIDRO, profundidade: 0.12, celula_minima: f64::NAN }
        }
    }

    fn grade_linha(dono: u8, dono_num: u32, eixo: u8, e: &EixoEfetivo) -> GradeLinha {
        GradeLinha {
            dono,
            dono_num,
            eixo,
            modo: e.modo,
            numero: if e.modo == MODO_NUMERO { e.numero } else { ID_AUSENTE },
            distancia: e.distancia,
            justificacao: e.justificacao,
            ancora: e.ancora,
            deslocamento: e.deslocamento,
            angulo: e.angulo,
            resto_minimo: e.resto_minimo,
        }
    }

    /// Cena com os montantes e painéis de teste e um tipo (`TIPO`).
    pub(crate) fn cena_com_tipo(e: &Espec) -> Cena {
        let mut c = Cena::novo();
        let s = &mut c.cortina;
        s.montantes.insert(M_RET, MontanteTipoLinha { forma: FORMA_RETANGULAR, largura: 0.05, profundidade: 0.1, espessura: 0.0, largura2: 0.0, deslocamento: 0.0, posicao: 0, material: 11 });
        s.montantes.insert(M_RED, MontanteTipoLinha { forma: FORMA_REDONDA, largura: 0.05, profundidade: 0.05, espessura: 0.0, largura2: 0.0, deslocamento: 0.0, posicao: 0, material: 12 });
        s.paineis.insert(P_VIDRO, PainelTipoLinha { tipo: PAINEL_VIDRO, espessura: 0.01, deslocamento: 0.0, encaixe: f64::NAN, material: 21, vidro_tipo: 0 });
        s.paineis.insert(P_SOLIDO, PainelTipoLinha { tipo: PAINEL_SOLIDO, espessura: 0.004, deslocamento: 0.0, encaixe: 0.01, material: 22, vidro_tipo: 0 });
        s.paineis.insert(P_VAZIO, PainelTipoLinha { tipo: PAINEL_VAZIO, espessura: 0.0, deslocamento: 0.0, encaixe: f64::NAN, material: ID_AUSENTE, vidro_tipo: 0 });
        s.tipos.insert(
            TIPO,
            TipoCortinaLinha {
                profundidade: e.profundidade,
                painel_padrao: e.painel,
                montantes: [e.mont[0], e.mont[1], e.mont[2], e.mont[3], e.mont[4], e.mont[5], ID_AUSENTE],
                prioridade: e.prioridade,
                celula_minima: e.celula_minima,
                faceta_max: f64::NAN,
                cadeia_grade: 0,
            },
        );
        s.grades.insert(1, grade_linha(0, TIPO, EIXO_U, &e.u));
        s.grades.insert(2, grade_linha(0, TIPO, EIXO_V, &e.v));
        for (grade, eixo) in [(1u32, &e.u), (2u32, &e.v)] {
            for (k, &p) in eixo.posicoes.iter().enumerate() {
                s.posicoes.insert(grade * 1000 + k as u32, GradePosicaoLinha { grade, ordem: k as u32, pos: p });
            }
        }
        c
    }

    /// Insere uma cortina reta de `(0,0)` a `(l,0)` no nível 0, com a altura `h`.
    pub(crate) fn com_cortina(mut c: Cena, id: u32, l: f64, h: f64) -> Cena {
        c.cortina.cortinas.insert(
            id,
            CortinaLinha { nivel: 0, tipo: TIPO, a: [0.0, 0.0], b: [l, 0.0], z_base: 0.0, altura: h, sag: 0.0, invertida: false, loc: 0, flags: 0, painel_padrao: ID_AUSENTE, hosp: ID_AUSENTE },
        );
        c
    }

    pub(crate) fn cena_simples(e: &Espec, l: f64, h: f64) -> Cena {
        com_cortina(cena_com_tipo(e), 1, l, h)
    }

    fn geom(c: &Cena) -> Geom {
        resolver(c, 0).expect("resolver").remove(0).g.expect("geometria")
    }

    fn igual(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-9, "{a} != {b}");
    }

    #[test]
    fn grade_de_quatro_por_tres_tem_doze_celulas_e_segmentos_por_linha() {
        let e = Espec::novo(EixoEfetivo::numero(4), EixoEfetivo::numero(3));
        let g = geom(&cena_simples(&e, 6.0, 3.0));
        assert_eq!((g.nu(), g.nv()), (4, 3));
        assert_eq!(g.us, vec![0.0, 1.5, 3.0, 4.5, 6.0]);
        assert_eq!(g.vs, vec![0.0, 1.0, 2.0, 3.0]);
        assert_eq!(g.celulas.len(), 12);
        assert_eq!(g.paineis.len(), 12);
        // 5 linhas verticais com 3 segmentos e 4 horizontais com 4 segmentos.
        assert_eq!(g.segmentos.len(), 5 * 3 + 4 * 4);
        assert_eq!(g.segmentos.iter().filter(|s| s.eixo == EIXO_U && s.papel == PAPEL_INT_V).count(), 3 * 3);
        assert_eq!(g.segmentos.iter().filter(|s| s.papel == PAPEL_BORDA_BASE).count(), 4);
        assert_eq!(g.celulas[0], Celula { i: 0, j: 0, s0: 0.0, s1: 1.5, z0: 0.0, z1: 1.0, painel: P_VIDRO, flags: 0 });
        assert_eq!((g.linha_global(EIXO_U, 4), g.linha_global(EIXO_V, 0), g.linha_global(EIXO_V, 3)), (4, 5, 8));
    }

    #[test]
    fn montante_de_borda_fica_embutido_e_o_interior_na_linha() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        let g = geom(&cena_simples(&e, 4.0, 3.0));
        assert_eq!(g.cu, vec![0.025, 2.0, 3.975]);
        assert_eq!(g.cv, vec![0.025, 1.5, 2.975]);
        // A caixa de todas as peças cabe em [0, L] x [0, H]: nada sai da ponta.
        for p in &g.pecas {
            let w = p.m.largura / 2.0;
            let (s0, s1, z0, z1) = if p.eixo == EIXO_U { (p.pos - w, p.pos + w, p.de, p.ate) } else { (p.de, p.ate, p.pos - w, p.pos + w) };
            assert!(s0 >= -1e-12 && s1 <= 4.0 + 1e-12 && z0 >= -1e-12 && z1 <= 3.0 + 1e-12, "{p:?}");
        }
    }

    #[test]
    fn painel_livre_desconta_o_montante_de_borda_inteiro_e_a_meia_largura_do_interior() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        let g = geom(&cena_simples(&e, 4.0, 3.0));
        // Célula (0,0): s de 0 a 2, z de 0 a 1,5; borda de 50 mm rente à ponta e interior centrado na linha em 2 e em 1,5.
        let p = g.paineis.iter().find(|p| p.i == 0 && p.j == 0).expect("painel");
        igual(p.s0, 0.05);
        igual(p.s1, 1.975);
        igual(p.z0, 0.05);
        igual(p.z1, 1.475);
        igual(p.area_visivel(), 1.925 * 1.425);
        // Encaixe padrão de 12 mm nos quatro lados.
        igual(p.area_bruta(), (1.925 + 0.024) * (1.425 + 0.024));
        // O painel de uma célula de ponta do outro lado: de 2,025 a 3,95.
        let q = g.paineis.iter().find(|p| p.i == 1 && p.j == 1).expect("painel");
        igual(q.s0, 2.025);
        igual(q.s1, 3.95);
        igual(q.z0, 1.525);
        igual(q.z1, 2.95);
    }

    #[test]
    fn lado_sem_montante_nao_desconta_nem_encaixa() {
        let mut e = Espec::novo(EixoEfetivo::numero(1), EixoEfetivo::numero(1));
        e.mont = [M_RET, M_RET, ID_AUSENTE, M_RET, ID_AUSENTE, M_RET];
        let g = geom(&cena_simples(&e, 2.0, 3.0));
        let p = g.paineis[0];
        igual(p.s0, 0.0); // sem borda de início
        igual(p.s1, 1.95); // borda de fim de 50 mm rente à ponta
        igual(p.z0, 0.0); // sem borda de base
        igual(p.z1, 2.95);
        assert_eq!(p.lados, [false, true, false, true]);
        igual(p.area_bruta(), (1.95 + 0.012) * (2.95 + 0.012));
    }

    #[test]
    fn prioridade_vertical_corre_a_vertical_por_segmento_e_quebra_a_horizontal() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        let g = geom(&cena_simples(&e, 4.0, 3.0));
        let verticais: Vec<&PecaMont> = g.pecas.iter().filter(|p| p.eixo == EIXO_U).collect();
        let horizontais: Vec<&PecaMont> = g.pecas.iter().filter(|p| p.eixo == EIXO_V).collect();
        assert_eq!(verticais.len(), 3 * 2, "uma por segmento: 3 linhas verticais x 2 fileiras");
        assert!(verticais.iter().all(|p| p.continuo));
        // Contínuo: de linha a linha, sem aparo: 0 a 1,5 e 1,5 a 3.
        igual(verticais[0].de, 0.0);
        igual(verticais[0].ate, 1.5);
        igual(verticais[1].de, 1.5);
        igual(verticais[1].ate, 3.0);
        assert_eq!(horizontais.len(), 3 * 2, "uma por segmento em cada uma das três linhas horizontais");
        assert!(horizontais.iter().all(|p| !p.continuo));
        // Primeira horizontal da base: da face da borda (0,05) à face da interior (1,975).
        igual(horizontais[0].de, 0.05);
        igual(horizontais[0].ate, 1.975);
        igual(horizontais[0].pos, 0.025);
        assert_eq!(horizontais[0].papel, PAPEL_BORDA_BASE);
    }

    #[test]
    fn prioridade_horizontal_inverte_quem_corre() {
        let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        e.prioridade = PRIORIDADE_HORIZONTAL;
        let g = geom(&cena_simples(&e, 4.0, 3.0));
        let horizontais: Vec<&PecaMont> = g.pecas.iter().filter(|p| p.eixo == EIXO_V).collect();
        let verticais: Vec<&PecaMont> = g.pecas.iter().filter(|p| p.eixo == EIXO_U).collect();
        assert_eq!(horizontais.len(), 3 * 2);
        assert!(horizontais.iter().all(|p| p.continuo));
        igual(horizontais[0].de, 0.0);
        igual(horizontais[0].ate, 2.0);
        assert_eq!(verticais.len(), 3 * 2);
        igual(verticais[0].de, 0.05);
        igual(verticais[0].ate, 1.475);
    }

    #[test]
    fn nunca_ha_dois_solidos_sobrepostos_no_plano_s_z() {
        for prioridade in [PRIORIDADE_VERTICAL, PRIORIDADE_HORIZONTAL] {
            let mut e = Espec::novo(EixoEfetivo::distancia_fixa(1.2, JUSTIF_CENTRO), EixoEfetivo::distancia_maxima(1.1));
            e.prioridade = prioridade;
            let g = geom(&cena_simples(&e, 5.3, 3.4));
            // Retângulo de cada peça no plano (s, z).
            let ret = |p: &PecaMont| {
                let w = p.m.largura / 2.0;
                if p.eixo == EIXO_U {
                    (p.pos - w, p.pos + w, p.de, p.ate)
                } else {
                    (p.de, p.ate, p.pos - w, p.pos + w)
                }
            };
            let todos: Vec<_> = g.pecas.iter().map(ret).collect();
            for (a, ra) in todos.iter().enumerate() {
                for rb in todos.iter().skip(a + 1) {
                    let (ox, oy) = (ra.1.min(rb.1) - ra.0.max(rb.0), ra.3.min(rb.3) - ra.2.max(rb.2));
                    assert!(ox < 1e-9 || oy < 1e-9, "sobreposição entre {ra:?} e {rb:?}");
                }
            }
            // Os painéis também ficam fora dos montantes e a união cobre o retângulo [0, L] x [0, H] sem fresta (área soma exata).
            for p in &g.paineis {
                for rb in &todos {
                    let (ox, oy) = (p.s1.min(rb.1) - p.s0.max(rb.0), p.z1.min(rb.3) - p.z0.max(rb.2));
                    assert!(ox < 1e-9 || oy < 1e-9, "painel {p:?} dentro de {rb:?}");
                }
            }
            let area_montantes: f64 = todos.iter().map(|r| (r.1 - r.0) * (r.3 - r.2)).sum();
            let area_paineis: f64 = g.paineis.iter().map(|p| p.area_visivel()).sum();
            igual(area_montantes + area_paineis, 5.3 * 3.4);
        }
    }

    #[test]
    fn quadro_segue_a_linha_de_localizacao_e_a_inversao() {
        let e = Espec::novo(EixoEfetivo::numero(1), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 2.0, 3.0);
        // Linha de localização no centro: o plano central fica sobre o eixo.
        let g = geom(&c);
        igual(g.s_mid, 0.0);
        // Face externa: o plano central recua meia profundidade (0,06) para o lado de dentro (-n, pois a normal à esquerda é +y).
        c.cortina.cortinas.get_mut(&1).expect("c").loc = 2;
        igual(geom(&c).s_mid, -0.06);
        // Face interna: para o outro lado.
        c.cortina.cortinas.get_mut(&1).expect("c").loc = 3;
        igual(geom(&c).s_mid, 0.06);
        // Invertida: troca.
        c.cortina.cortinas.get_mut(&1).expect("c").invertida = true;
        let g = geom(&c);
        igual(g.s_mid, -0.06);
        igual(g.sigma, -1.0);
        // Para fora, no mundo, é sigma · n: com a parede em +x, n = +y.
        let p = g.mundo(1.0, 0.01, 0.5);
        igual(p[0], 1.0);
        igual(p[1], -0.06 - 0.01);
        igual(p[2], 0.5);
    }

    #[test]
    fn celula_pequena_e_montante_sobreposto_geram_aviso() {
        // Linhas manuais a 0,1 e a 0,02 m uma da outra: o vão livre é de 0,05 m (< 0,15) e depois não sobra nada; os montantes de 50 mm se sobrepõem.
        let e = Espec::novo(EixoEfetivo::manual(&[1.0, 1.1, 1.12], ANCORA_INICIO), EixoEfetivo::numero(1));
        let r = resolver(&cena_simples(&e, 3.0, 2.0), 0).expect("resolver");
        let a = &r[0].avisos;
        let pequenas: Vec<&AvisoC> = a.iter().filter(|x| x.codigo == AVISO_CORTINA_CELULA_PEQUENA).collect();
        assert_eq!(pequenas.len(), 2, "as células entre 1,0 e 1,1 (livre 0,05) e entre 1,1 e 1,12 (livre negativo, medido 0)");
        assert_eq!((pequenas[0].i, pequenas[0].j), (1, 0));
        igual(pequenas[0].medido, 0.05);
        igual(pequenas[0].limite, 0.15);
        igual(pequenas[1].medido, 0.0);
        let sobrepostos: Vec<&AvisoC> = a.iter().filter(|x| x.codigo == AVISO_CORTINA_MONTANTE_SOBREPOSTO).collect();
        assert_eq!(sobrepostos.len(), 1, "só 1,1 e 1,12 (0,02 < 0,05)");
        assert_eq!((sobrepostos[0].i, sobrepostos[0].j), (2, ID_AUSENTE));
        igual(sobrepostos[0].medido, 0.02);
        igual(sobrepostos[0].limite, 0.05);
        let g = r[0].g.as_ref().expect("g");
        assert_eq!(g.paineis.len(), 4, "um painel por célula, mesmo a sem área");
        assert!(!g.paineis[2].tem_area());
        igual(g.paineis[2].area_visivel(), 0.0);
        assert_eq!(g.celulas.iter().filter(|c| c.flags & CELULA_PEQUENA != 0).count(), 2);
    }

    #[test]
    fn celula_minima_e_configuravel_no_tipo() {
        let mut e = Espec::novo(EixoEfetivo::numero(4), EixoEfetivo::numero(1));
        // 4 colunas de 0,5 m: livre de 0,425 a 0,45 m. Com mínimo de 0,6 todas avisam; com o padrão (0,15) nenhuma.
        assert!(resolver(&cena_simples(&e, 2.0, 2.0), 0).expect("r")[0].avisos.iter().all(|a| a.codigo != AVISO_CORTINA_CELULA_PEQUENA));
        e.celula_minima = 0.6;
        let a = &resolver(&cena_simples(&e, 2.0, 2.0), 0).expect("r")[0].avisos;
        assert_eq!(a.iter().filter(|x| x.codigo == AVISO_CORTINA_CELULA_PEQUENA).count(), 4);
        igual(a[0].limite, 0.6);
    }

    #[test]
    fn perfil_mais_fundo_que_o_sistema_avisa() {
        let mut e = Espec::novo(EixoEfetivo::numero(1), EixoEfetivo::numero(1));
        e.profundidade = 0.08; // o retangular tem 0,10 de profundidade
        let a = &resolver(&cena_simples(&e, 2.0, 2.0), 0).expect("r")[0].avisos;
        let f: Vec<&AvisoC> = a.iter().filter(|x| x.codigo == AVISO_CORTINA_PROFUNDIDADE_MENOR_QUE_PERFIL).collect();
        assert_eq!(f.len(), 1, "um aviso por tipo de montante, não por linha");
        assert_eq!((f[0].i, f[0].j), (M_RET, ID_AUSENTE));
        igual(f[0].medido, 0.1);
        igual(f[0].limite, 0.08);
        // O redondo usa a largura como profundidade (0,05): não avisa num sistema de 0,08.
        let mut e = Espec::novo(EixoEfetivo::numero(1), EixoEfetivo::numero(1));
        e.mont = [M_RED; 6];
        e.profundidade = 0.04;
        let a = &resolver(&cena_simples(&e, 2.0, 2.0), 0).expect("r")[0].avisos;
        igual(a.iter().find(|x| x.codigo == AVISO_CORTINA_PROFUNDIDADE_MENOR_QUE_PERFIL).expect("aviso").medido, 0.05);
    }

    #[test]
    fn arco_fica_de_fora_com_aviso_e_angulo_da_grade_e_entrada() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        let mut c = cena_simples(&e, 4.0, 3.0);
        c = com_cortina(c, 2, 4.0, 3.0);
        c.cortina.cortinas.get_mut(&2).expect("c2").sag = 0.5;
        let r = resolver(&c, 0).expect("resolver");
        assert_eq!(r.len(), 2);
        assert!(r[0].g.is_some());
        assert!(r[1].g.is_none());
        assert_eq!(r[1].avisos[0].codigo, AVISO_CORTINA_ARCO_NAO_SUPORTADO);
        // Ângulo da grade: a instância sobrescreve o eixo U do tipo; ENTRADA até a fase 7.
        let mut c = cena_simples(&e, 4.0, 3.0);
        c.cortina.grades.insert(50, GradeLinha { dono: 1, dono_num: 1, eixo: EIXO_U, modo: HERDA, numero: ID_AUSENTE, distancia: f64::NAN, justificacao: HERDA, ancora: HERDA, deslocamento: f64::NAN, angulo: 0.3, resto_minimo: f64::NAN });
        assert_eq!(resolver(&c, 0).err(), Some(ENTRADA));
    }

    #[test]
    fn instancia_sobrescreve_campo_a_campo_e_herda_o_resto() {
        let e = Espec::novo(EixoEfetivo::distancia_fixa(1.5, JUSTIF_INICIO), EixoEfetivo::numero(2));
        let mut c = cena_simples(&e, 6.0, 3.0);
        assert_eq!(geom(&c).us, vec![0.0, 1.5, 3.0, 4.5, 6.0]);
        // A instância só troca a justificação e o deslocamento: a distância continua a do tipo. Padrão 0,1 + k·1,5.
        c.cortina.grades.insert(50, GradeLinha { dono: 1, dono_num: 1, eixo: EIXO_U, modo: HERDA, numero: ID_AUSENTE, distancia: f64::NAN, justificacao: JUSTIF_FIM, ancora: HERDA, deslocamento: 0.1, angulo: f64::NAN, resto_minimo: f64::NAN });
        let g = geom(&c);
        assert_eq!(g.us.len(), 6);
        igual(g.us[1], 0.1);
        igual(g.us[2], 1.6);
        igual(g.us[4], 4.6);
        // A instância troca o modo e o número.
        c.cortina.grades.insert(50, GradeLinha { dono: 1, dono_num: 1, eixo: EIXO_U, modo: MODO_NUMERO, numero: 3, distancia: f64::NAN, justificacao: HERDA, ancora: HERDA, deslocamento: f64::NAN, angulo: f64::NAN, resto_minimo: f64::NAN });
        assert_eq!(geom(&c).us, vec![0.0, 2.0, 4.0, 6.0]);
    }

    #[test]
    fn painel_padrao_da_instancia_vence_o_do_tipo() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 4.0, 3.0);
        assert!(geom(&c).paineis.iter().all(|p| p.p.kind == PAINEL_VIDRO));
        c.cortina.cortinas.get_mut(&1).expect("c").painel_padrao = P_SOLIDO;
        let g = geom(&c);
        assert!(g.paineis.iter().all(|p| p.p.kind == PAINEL_SOLIDO && p.p.tipo == P_SOLIDO));
        assert!(g.celulas.iter().all(|c| c.painel == P_SOLIDO));
    }

    #[test]
    fn referencia_quebrada_e_entrada_e_forma_futura_tambem() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 4.0, 3.0);
        c.cortina.montantes.get_mut(&M_RET).expect("m").forma = FORMA_L;
        assert_eq!(resolver(&c, 0).err(), Some(ENTRADA), "L só na fase 3");
        let mut c = cena_simples(&e, 4.0, 3.0);
        c.cortina.tipos.get_mut(&TIPO).expect("t").painel_padrao = 99;
        assert_eq!(resolver(&c, 0).err(), Some(ENTRADA), "painel do tipo inexistente");
        let mut c = cena_simples(&e, 4.0, 3.0);
        c.cortina.grades.remove(&2);
        assert_eq!(resolver(&c, 0).err(), Some(ENTRADA), "tipo sem a grade V");
    }

    #[test]
    fn limites_de_defesa_devolvem_limite() {
        let e = Espec::novo(EixoEfetivo::numero(100), EixoEfetivo::numero(100));
        assert_eq!(resolver(&cena_simples(&e, 50.0, 50.0), 0).err(), Some(LIMITE), "100 x 100 = 10000 células");
        let e = Espec::novo(EixoEfetivo::numero(130), EixoEfetivo::numero(1));
        assert_eq!(resolver(&cena_simples(&e, 50.0, 3.0), 0).err(), Some(LIMITE), "mais de 128 linhas no eixo");
        let e = Espec::novo(EixoEfetivo::numero(64), EixoEfetivo::numero(64));
        assert!(resolver(&cena_simples(&e, 50.0, 50.0), 0).is_ok(), "64 x 64 = 4096 vale");
    }

    #[test]
    fn nivel_filtra_e_degenerada_fica_de_fora() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 4.0, 3.0);
        c = com_cortina(c, 2, 4.0, 3.0);
        c.cortina.cortinas.get_mut(&2).expect("c2").nivel = 1;
        c = com_cortina(c, 3, 1e-6, 3.0);
        assert_eq!(resolver(&c, 0).expect("r").iter().map(|x| x.id).collect::<Vec<_>>(), vec![1, 3]);
        assert_eq!(resolver(&c, 1).expect("r").iter().map(|x| x.id).collect::<Vec<_>>(), vec![2]);
        assert_eq!(resolver(&c, NIVEL_TODOS).expect("r").len(), 3);
        assert!(resolver(&c, 0).expect("r")[1].g.is_none(), "comprimento nulo");
        assert!(resolver(&c, 9).expect("r").is_empty());
    }

    #[test]
    fn tabela_de_pecas_tem_o_formato_da_referencia() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let t = tabela_pecas(&cena_simples(&e, 4.0, 3.0), 0).expect("tabela");
        // 3 verticais x 1 fileira e 2 horizontais (base e topo) x 2 colunas.
        assert_eq!(t.montantes.len(), 7 * (3 + 4));
        assert_eq!(t.montantes_geo.len(), 5 * 7);
        // Primeira peça: borda início, tipo 1, linha global 0, k 0, vertical e contínua; s = centro embutido (0,025), z = 0, comprimento 3.
        assert_eq!(&t.montantes[0..7], &[1, PAPEL_BORDA_INI, M_RET, 0, 0, 1, 1]);
        assert_eq!(&t.montantes_geo[0..5], &[0.025, 0.0, 3.0, 0.05, 0.1]);
        // Quinta: horizontal da base (linha global nu + 1 = 3), quebrada; começa na face da borda (0,05).
        assert_eq!(&t.montantes[21..28], &[1, PAPEL_BORDA_BASE, M_RET, 3, 0, 0, 0]);
        assert_eq!(&t.montantes_geo[15..20], &[0.05, 0.025, 1.925, 0.05, 0.1]);
        assert_eq!(t.paineis.len(), 5 * 2);
        assert_eq!(&t.paineis[0..5], &[1, 0, 0, P_VIDRO, PAPEL_PAINEL_VIDRO]);
        // Painel (0,0): livre de 0,05 a 1,975 por 0,05 a 2,95; visível 1,925 x 2,9.
        assert_eq!(&t.paineis_geo[0..6], &[0.05, 1.975, 0.05, 2.95, 5.5825, 5.698876]);
    }
}
