//! Esquadria (porta ou janela) numa célula da parede cortina (decisão 0056, fase 5; ADR §7; consulta `cortina_celula_porta`, id 107).
//!
//! A esquadria ocupa a REGIÃO inteira da célula (célula ou retângulo fundido pelos segmentos removidos, fase 2) e substitui o painel dela. Regras:
//! - **vão virtual**: o retângulo `s0..s1 × z0..z1` (coordenadas da parede: `s` ao longo do eixo da cortina, `z` acima da base da cortina) em que a esquadria
//!   se inscreve. Preencher a célula (`ajuste` 0): a largura entre as faces dos montantes menos a folga de 4 mm de cada lado, do peitoril à face do montante
//!   de cima. Grade ajustada (`ajuste` 1): o tamanho nominal do tipo (largura e altura da seção 7, sem a folga de obra) alinhado no centro, no início ou no
//!   fim da região, limitado ao livre; o TS cria as linhas de grade (ADR §7.4) e o Rust as pede em `linhas`;
//! - **soleira derivada** (§7.5.1): porta (não janela) com peitoril efetivo 0 omite o segmento horizontal de base sob a região (a borda da base, ou o
//!   segmento do montante horizontal interior). É derivada a cada resolução: nada é gravado e o montante volta sozinho se a esquadria sai ou vira janela;
//! - **um só batente** (§7.6): onde o lado do vão tem montante o batente próprio é omitido (o montante é o batente); `lados` diz quais lados têm montante;
//! - **folha mínima** (§7.5.3) e **porta fora do piso** (§7.5.4): só avisos (11 e 12); o vão limitado à célula é o aviso 13.
//!
//! SIMPLIFICAÇÕES REGISTRADAS (a composição de esquadrias do projeto, `openingParts.ts`, é TypeScript e não existe no Rust):
//! - a folha é um quadro de montantes de `LARG_PERFIL_FOLHA` com `esp_folha` de espessura (0,04 se o tipo não traz), uma folha por `folhas` (1 se o tipo é
//!   de vão livre com folhas 0: nenhuma), e um vidro de `ESP_VIDRO_ESQUADRIA` dentro do quadro, tanto na porta quanto na janela;
//! - o batente é o prisma de `larg_batente` (0,05 se ausente) por toda a profundidade do sistema nos lados sem montante (e na base da janela sem montante);
//! - o símbolo de planta é o contorno do vão, mais folha e arco de giro nos planos de giro (swing, double, dblact, hinged) e, nos demais, só o traço da folha;
//! - não há ferragens, soleira de porta nem composição da folha (almofadas, bandeira interna).

use crate::consultas::Saida;
use crate::cortina_pecas::{AvisoC, Geom};
use crate::cortina_remap::Regiao;
use crate::cortina_tipos::*;
use crate::esquema::{AVISO_CORTINA_ESQUADRIA_MAIOR_QUE_CELULA, AVISO_CORTINA_PORTA_FOLHA_MINIMA, AVISO_CORTINA_PORTA_FORA_DO_PISO};
use crate::secoes_a3::TipoAbertura;

/// Folga entre a folha e a face do montante (m), `CURTAIN_LEAF_GAP` do modelo.
pub const FOLGA_FOLHA: f64 = 0.004;
/// Largura do perfil do quadro da folha (m).
pub const LARG_PERFIL_FOLHA: f64 = 0.05;
/// Espessura do vidro da esquadria (m).
pub const ESP_VIDRO_ESQUADRIA: f64 = 0.008;
/// Espessura padrão da folha e largura padrão do batente quando o tipo não traz (m).
pub const ESP_FOLHA_PADRAO: f64 = 0.04;
pub const LARG_BATENTE_PADRAO: f64 = 0.05;

/// Planos de `tipos_abertura.plano` (índice do `PlanSymbol`).
const PLANO_SLIDING: u8 = 2;
const PLANO_POCKET: u8 = 8;
const PLANO_GARAGE: u8 = 11;
const PLANOS_DE_GIRO: [u8; 4] = [0, 1, 7, 12];

/// Bits de `flags` das esquadrias (`portas` da consulta 107).
pub const ESQ_SOLEIRA_DERIVADA: u32 = 1;
pub const ESQ_LIMITADA: u32 = 2;
pub const ESQ_FOLHA_MINIMA: u32 = 4;
pub const ESQ_FORA_DO_PISO: u32 = 8;
pub const ESQ_REGIAO_MULTIPLA: u32 = 16;

/// Folha mínima (m) do tipo: 0 em vão livre (sem folha), 0,30 janela, 0,50 correr, 0,60 giro (`CURTAIN_MIN_LEAF`, a confirmar).
pub fn folha_minima(t: &TipoAbertura) -> f64 {
    if t.folhas == 0 {
        0.0
    } else if t.janela {
        0.30
    } else if matches!(t.plano, PLANO_SLIDING | PLANO_POCKET | PLANO_GARAGE) {
        0.50
    } else {
        0.60
    }
}

/// Esquadria resolvida de uma região.
#[derive(Clone, Debug, PartialEq)]
pub struct Esquadria {
    /// Célula canônica da região.
    pub i: u32,
    pub j: u32,
    /// Linha da seção 7 (`tipo_abertura_num`) e o tipo já lido.
    pub tipo_num: u32,
    pub tipo: TipoAbertura,
    pub flip_mao: bool,
    pub flip_sentido: bool,
    pub grade: bool,
    pub alinhamento: u8,
    /// O vão: `s0..s1 × z0..z1`.
    pub s0: f64,
    pub s1: f64,
    pub z0: f64,
    pub z1: f64,
    /// Peitoril efetivo (m acima da base livre da região) e se o segmento da base some.
    pub peitoril: f64,
    pub derivada: bool,
    /// Largura e altura livres da região (entre as faces dos montantes; a largura já sem as folgas).
    pub larg_livre: f64,
    pub alt_livre: f64,
    pub folha_min: f64,
    /// Base da região (a linha de grade), em z acima da base da cortina.
    pub z_regiao: f64,
    /// Lados com montante: esquerda, direita, base, topo.
    pub lados: [bool; 4],
    pub flags: u32,
    /// Material da folha e do vidro (da cortina: o do montante de borda e o do painel padrão).
    pub mat_folha: u32,
    pub mat_vidro: u32,
    /// Linhas de grade que o ajuste pede (`ajuste` 1): `(eixo, pos)` em m; a consulta 107 as devolve.
    pub linhas: Vec<(u8, f64)>,
}

impl Esquadria {
    pub fn largura(&self) -> f64 {
        (self.s1 - self.s0).max(0.0)
    }
    pub fn altura(&self) -> f64 {
        (self.z1 - self.z0).max(0.0)
    }
    pub fn tem_vao(&self) -> bool {
        self.largura() > 1e-6 && self.altura() > 1e-6
    }
}

/// Caixa da esquadria no sistema `(t, y, z)` da cortina (`y` na profundidade a partir do plano central).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Caixa {
    pub t0: f64,
    pub t1: f64,
    pub y0: f64,
    pub y1: f64,
    pub z0: f64,
    pub z1: f64,
    pub vidro: bool,
}

impl Caixa {
    pub fn volume(&self) -> f64 {
        (self.t1 - self.t0) * (self.y1 - self.y0) * (self.z1 - self.z0)
    }
}

/// Dados de entrada de uma esquadria numa região (já remapeados e com o tipo lido).
pub struct Pedido<'a> {
    pub tipo_num: u32,
    pub tipo: &'a TipoAbertura,
    pub flip_mao: bool,
    pub flip_sentido: bool,
    pub grade: bool,
    pub alinhamento: u8,
    pub soleira: f64,
    /// Menor resto que ainda vira célula (`max(resto_minimo, célula_minima)`): sobra menor absorve o alinhamento do centro para o início (§7.3).
    pub limiar: f64,
}

/// Peitoril efetivo: a soleira por instância se vier; senão 0 (a base da região), como o comando do modelo.
pub fn peitoril_efetivo(soleira: f64) -> f64 {
    if soleira.is_finite() {
        soleira.max(0.0)
    } else {
        0.0
    }
}

/// A soleira é derivada (o segmento da base some) numa porta com peitoril 0.
pub fn soleira_derivada(t: &TipoAbertura, soleira: f64) -> bool {
    !t.janela && peitoril_efetivo(soleira) <= 1e-9
}

/// Vão e avisos de uma região. `livre` é o retângulo livre da região `(fs0, fs1, fz0, fz1)` (entre as faces dos montantes que existem depois da soleira
/// derivada), `lados` quem tem montante; `bruta` o retângulo entre as linhas de grade `(s0, s1, z0, z1)`.
pub fn montar_esquadria(g: &Geom, reg: &Regiao, p: &Pedido, livre: (f64, f64, f64, f64), lados: [bool; 4], bruta: (f64, f64, f64, f64), avisos: &mut Vec<AvisoC>) -> Esquadria {
    let (fs0, fs1, fz0, fz1) = livre;
    let (bs0, bs1, bz0, bz1) = bruta;
    let peitoril = peitoril_efetivo(p.soleira);
    let derivada = soleira_derivada(p.tipo, p.soleira);
    let (ls0, ls1) = (fs0 + FOLGA_FOLHA, fs1 - FOLGA_FOLHA);
    let larg_livre = ls1 - ls0;
    let mut flags = 0;
    if derivada {
        flags |= ESQ_SOLEIRA_DERIVADA;
    }
    if (reg.i1 - reg.i0 + 1) * (reg.j1 - reg.j0 + 1) > 1 {
        flags |= ESQ_REGIAO_MULTIPLA;
    }
    let (mut s0, mut s1, mut z0, mut z1);
    if p.grade {
        let (w, h) = (p.tipo.largura, p.tipo.altura);
        let (wb, hb) = (bs1 - bs0, bz1 - bz0);
        let al = if p.alinhamento == 0 && (wb - w) / 2.0 < p.limiar { 1 } else { p.alinhamento };
        let t0 = match al {
            1 => bs0,
            2 => bs1 - w,
            _ => (bs0 + bs1) / 2.0 - w / 2.0,
        };
        s0 = t0.max(ls0);
        s1 = (t0 + w).min(ls1);
        z0 = (bz0 + peitoril).max(fz0);
        z1 = (bz0 + peitoril + h).min(fz1);
        if w > wb + TOL_POS || peitoril + h > hb + TOL_POS {
            flags |= ESQ_LIMITADA;
            let (medido, limite) = if w > wb + TOL_POS { (w, wb) } else { (peitoril + h, hb) };
            avisos.push(AvisoC { codigo: AVISO_CORTINA_ESQUADRIA_MAIOR_QUE_CELULA, i: reg.canon.0 as u32, j: reg.canon.1 as u32, medido, limite, p: g.mundo((bs0 + bs1) / 2.0, 0.0, (bz0 + bz1) / 2.0) });
        }
    } else {
        s0 = ls0;
        s1 = ls1;
        z0 = fz0 + peitoril;
        z1 = fz1;
    }
    if s1 < s0 {
        s0 = (s0 + s1) / 2.0;
        s1 = s0;
    }
    if z1 < z0 {
        z0 = (z0 + z1) / 2.0;
        z1 = z0;
    }
    let folha_min = folha_minima(p.tipo);
    let centro = g.mundo((s0 + s1) / 2.0, 0.0, (z0 + z1) / 2.0);
    if folha_min > 0.0 && larg_livre < folha_min - TOL_POS {
        flags |= ESQ_FOLHA_MINIMA;
        avisos.push(AvisoC { codigo: AVISO_CORTINA_PORTA_FOLHA_MINIMA, i: reg.canon.0 as u32, j: reg.canon.1 as u32, medido: larg_livre, limite: folha_min, p: centro });
    }
    if derivada && bz0 > TOL_POS {
        flags |= ESQ_FORA_DO_PISO;
        avisos.push(AvisoC { codigo: AVISO_CORTINA_PORTA_FORA_DO_PISO, i: reg.canon.0 as u32, j: reg.canon.1 as u32, medido: bz0, limite: 0.0, p: centro });
    }
    Esquadria {
        i: reg.canon.0 as u32,
        j: reg.canon.1 as u32,
        tipo_num: p.tipo_num,
        tipo: *p.tipo,
        flip_mao: p.flip_mao,
        flip_sentido: p.flip_sentido,
        grade: p.grade,
        alinhamento: p.alinhamento,
        s0,
        s1,
        z0,
        z1,
        peitoril,
        derivada,
        larg_livre,
        alt_livre: fz1 - fz0,
        folha_min,
        z_regiao: bz0,
        lados,
        flags,
        mat_folha: ID_AUSENTE_MAT,
        mat_vidro: ID_AUSENTE_MAT,
        linhas: Vec::new(),
    }
}

/// `material_num` ausente (o TS usa o material padrão).
pub const ID_AUSENTE_MAT: u32 = crate::esquema::ID_AUSENTE;

/// Caixas da esquadria: batente nos lados sem montante, e por folha o quadro e o vidro. Coordenadas `(t, y, z)` da cortina; `y` centrado no plano central.
pub fn caixas(e: &Esquadria, profundidade: f64) -> Vec<Caixa> {
    let mut v = Vec::new();
    if !e.tem_vao() {
        return v;
    }
    let fw = if e.tipo.larg_batente > 0.0 { e.tipo.larg_batente } else { LARG_BATENTE_PADRAO };
    let esp = (if e.tipo.esp_folha > 0.0 { e.tipo.esp_folha } else { ESP_FOLHA_PADRAO }).min(profundidade);
    let (yb0, yb1) = (-profundidade / 2.0, profundidade / 2.0);
    let (mut t0, mut t1, mut z0, mut z1) = (e.s0, e.s1, e.z0, e.z1);
    let caixa = |t0, t1, y0, y1, z0, z1, vidro| Caixa { t0, t1, y0, y1, z0, z1, vidro };
    // Batente próprio só onde não há montante: jambas, cabeça e, na janela, a soleira.
    if !e.lados[0] {
        v.push(caixa(t0, (t0 + fw).min(t1), yb0, yb1, z0, z1, false));
        t0 += fw;
    }
    if !e.lados[1] {
        v.push(caixa((t1 - fw).max(t0), t1, yb0, yb1, z0, z1, false));
        t1 -= fw;
    }
    if !e.lados[3] {
        v.push(caixa(t0, t1, yb0, yb1, (z1 - fw).max(z0), z1, false));
        z1 -= fw;
    }
    if e.tipo.janela && !e.lados[2] {
        v.push(caixa(t0, t1, yb0, yb1, z0, (z0 + fw).min(z1), false));
        z0 += fw;
    }
    let n = e.tipo.folhas as usize;
    if n == 0 || t1 - t0 <= 1e-6 || z1 - z0 <= 1e-6 {
        return v;
    }
    let (ya, yb) = (-esp / 2.0, esp / 2.0);
    let (yv0, yv1) = (-ESP_VIDRO_ESQUADRIA / 2.0, ESP_VIDRO_ESQUADRIA / 2.0);
    let l = (t1 - t0) / n as f64;
    for k in 0..n {
        let (a, b) = (t0 + l * k as f64, t0 + l * (k + 1) as f64);
        let r = LARG_PERFIL_FOLHA.min(l / 2.0).min((z1 - z0) / 2.0);
        // Montantes da folha: duas verticais inteiras e duas travessas entre elas.
        v.push(caixa(a, a + r, ya, yb, z0, z1, false));
        v.push(caixa(b - r, b, ya, yb, z0, z1, false));
        v.push(caixa(a + r, b - r, ya, yb, z0, z0 + r, false));
        v.push(caixa(a + r, b - r, ya, yb, z1 - r, z1, false));
        if b - a - 2.0 * r > 1e-6 && z1 - z0 - 2.0 * r > 1e-6 {
            v.push(caixa(a + r, b - r, yv0, yv1, z0 + r, z1 - r, true));
        }
    }
    v
}

/// Área do vidro da esquadria (m²): a face das caixas de vidro.
pub fn area_vidro(cs: &[Caixa]) -> f64 {
    cs.iter().filter(|c| c.vidro).map(|c| (c.t1 - c.t0) * (c.z1 - c.z0)).sum()
}

/// Símbolo de planta da esquadria, no plano `z` do corte: o contorno do vão (retângulo por toda a profundidade) e, por folha, o traço dela e, nos planos de
/// giro, o arco. Cada linha é `(fechada, pontos)` já no mundo. `s_mid`, `d`: o plano central e a profundidade do sistema.
pub fn simbolo_planta(g: &Geom, e: &Esquadria) -> Vec<(bool, bool, Vec<[f64; 2]>)> {
    let mut out = Vec::new();
    if !e.tem_vao() {
        return out;
    }
    let xy = |t: f64, y: f64| {
        let p = g.mundo(t, y, 0.0);
        [p[0], p[1]]
    };
    let meio = g.d / 2.0;
    out.push((true, false, vec![xy(e.s0, -meio), xy(e.s1, -meio), xy(e.s1, meio), xy(e.s0, meio)]));
    if e.tipo.folhas == 0 {
        return out;
    }
    let hw = e.largura() / 2.0;
    let tc = (e.s0 + e.s1) / 2.0;
    // `+n` do vão (o lado `s` positivo) é `yp` positivo vezes `sigma`; o sentido de abertura troca com `flip_sentido`.
    let lado = if e.flip_sentido { -1.0 } else { 1.0 } * g.sigma;
    if !e.tipo.janela && PLANOS_DE_GIRO.contains(&e.tipo.plano) {
        let n = e.tipo.folhas.min(2) as usize;
        let comp = if n == 2 { hw } else { 2.0 * hw };
        let dobradicas: Vec<f64> = if n == 2 { vec![-1.0, 1.0] } else { vec![if e.flip_mao { 1.0 } else { -1.0 }] };
        let face = lado * meio;
        for h in dobradicas {
            let (th, to) = (tc + h * hw, tc + h * hw);
            let fecha = if n == 2 { tc } else { tc - h * hw };
            let (ph, po) = (xy(th, face), xy(to, face + lado * comp));
            out.push((false, false, vec![ph, po]));
            // Arco de giro: do ponto aberto ao ponto fechado, em volta da dobradiça.
            let (a0, a1) = ((po[1] - ph[1]).atan2(po[0] - ph[0]), {
                let pf = xy(fecha, face);
                (pf[1] - ph[1]).atan2(pf[0] - ph[0])
            });
            let mut d = a1 - a0;
            while d > std::f64::consts::PI {
                d -= std::f64::consts::TAU;
            }
            while d < -std::f64::consts::PI {
                d += std::f64::consts::TAU;
            }
            let r = comp;
            let pts: Vec<[f64; 2]> = (0..=18)
                .map(|k| {
                    let a = a0 + d * k as f64 / 18.0;
                    [ph[0] + r * a.cos(), ph[1] + r * a.sin()]
                })
                .collect();
            out.push((false, true, pts));
        }
    } else {
        out.push((false, false, vec![xy(e.s0, 0.0), xy(e.s1, 0.0)]));
    }
    out
}

/// Linhas de grade que o ajuste à esquadria pede (ADR §7.4): `(eixo, pos)` em m, só no `ajuste` 1. `bruta` é a região entre as linhas; `limiar` o menor
/// resto que ainda vira célula; `existentes_u/v` as linhas interiores da grade (as que já estão lá não se repetem); `l` e `h` o vão da cortina.
#[allow(clippy::too_many_arguments)]
pub fn linhas_do_ajuste(bruta: (f64, f64, f64, f64), tipo: &TipoAbertura, peitoril: f64, alinhamento: u8, limiar: f64, existentes_u: &[f64], existentes_v: &[f64], l: f64, h: f64) -> Vec<(u8, f64)> {
    let (s0, s1, z0, z1) = bruta;
    let (w, hh) = (tipo.largura, tipo.altura);
    let cw = s1 - s0;
    let sobra = (cw - w) / 2.0;
    let efetivo = if alinhamento == 0 && sobra < limiar { 1 } else { alinhamento };
    let mut xs: Vec<f64> = Vec::new();
    if efetivo == 0 {
        if sobra >= limiar {
            xs.push(s0 + sobra);
            xs.push(s1 - sobra);
        }
    } else if cw - w >= limiar {
        xs.push(if efetivo == 1 { s0 + w } else { s1 - w });
    }
    let mut out: Vec<(u8, f64)> = xs.into_iter().map(|p| (EIXO_U, p)).collect();
    let topo = z0 + peitoril + hh;
    if z1 - topo >= limiar {
        out.push((EIXO_V, topo));
    }
    out.retain(|&(eixo, pos)| {
        let (a, ex) = if eixo == EIXO_U { (l, existentes_u) } else { (h, existentes_v) };
        pos > TOL_POS && pos < a - TOL_POS && !ex.iter().any(|q| (q - pos).abs() <= TOL_POS)
    });
    out
}

/// Consulta `cortina_celula_porta`: ver o JSON do contrato.
pub fn consulta_cortina_celula_porta(cena: &crate::cena::Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let cortinas = crate::cortina_pecas::resolver(cena, nivel)?;
    let (mut portas, mut vaos, mut linhas, mut linhas_pos) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for c in &cortinas {
        let Some(g) = &c.g else { continue };
        for e in &g.esquadrias {
            let lados = e.lados.iter().enumerate().fold(0u32, |a, (k, &b)| a | (u32::from(b) << k));
            portas.extend_from_slice(&[c.id, e.i, e.j, e.tipo_num, u32::from(e.grade), u32::from(e.flip_mao), u32::from(e.flip_sentido), u32::from(e.tipo.janela), lados, e.flags]);
            vaos.extend_from_slice(&[na_grade(e.s0), na_grade(e.s1), na_grade(e.z0), na_grade(e.z1), na_grade(g.d), na_grade(e.peitoril), na_grade(e.larg_livre), na_grade(e.alt_livre), na_grade(e.folha_min), na_grade(e.z_regiao)]);
            for (eixo, pos) in &e.linhas {
                linhas.extend_from_slice(&[c.id, e.i, e.j, u32::from(*eixo)]);
                linhas_pos.push(na_grade(*pos));
            }
        }
    }
    Ok(vec![Saida::U32(portas), Saida::F64(vaos), Saida::U32(linhas), Saida::F64(linhas_pos)])
}

#[cfg(test)]
#[path = "cortina_porta_testes.rs"]
mod testes;
