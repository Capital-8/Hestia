//! Distribuição do guarda-corpo (decisão 0055, Fase 3c): postes (§5.5), balaústres (§5.6), por degrau, painéis (§5.7) e a malha de cada peça.
//!
//! Funções puras sobre um `TrechoGC` (a cadeia da Fase 3a; até lá, as cadeias sintéticas de `gc_tipos`) e structs simples de parâmetros. Nada aqui lê as
//! tabelas de `secoes_gc`: a integração (consulta `guarda_malha`) monta os parâmetros a partir delas. A cota da cadeia é a do EIXO sobre o hospedeiro;
//! as alturas (`h_base`, `h_topo`, `altura`) já chegam resolvidas (referência a trilho/corrimão, ajuste de patamar) e somam à cota da cadeia.
//! Toda distribuição é medida no plano horizontal (`s` = comprimento horizontal acumulado).

use std::collections::HashMap;

use crate::esquema::{ENTRADA, LIMITE};
use crate::gc_tipos::*;

const EPS: f64 = 1e-9;
const EPS_S: f64 = 1e-7;
/// Quanto a quina de um degrau pode ficar fora da cadeia (m) e ainda contar (arco discretizado da Fase 3a).
const TOL_PONTA_DEGRAU: f64 = 0.005;

pub const AVISO_PADRAO_NAO_CABE: u8 = 1;
pub const AVISO_PADRAO_COMPRIMIDO: u8 = 2;
pub const AVISO_VAO_SEM_ESPACO: u8 = 3;
pub const AVISO_POSTE_SOBRA_CURTA: u8 = 4;
/// Montante por degrau que não cabe inteiro sobre o piso (invadiria o espelho ou a quina); `valor` é a pisada útil do degrau.
pub const AVISO_MONTANTE_FORA_DO_PISO: u8 = 5;

pub const PAPEL_POSTE: u8 = 0;
pub const PAPEL_BALAUSTRE: u8 = 1;
pub const PAPEL_PAINEL: u8 = 5;
pub const PAPEL_CABO: u8 = 6;

/// `justif`, `sobra`, `quebra` e `escopo` de `padroes_guarda`.
pub const JUSTIF_INICIO: u8 = 0;
pub const JUSTIF_FIM: u8 = 1;
pub const JUSTIF_CENTRO: u8 = 2;
pub const JUSTIF_DISTRIBUIR: u8 = 3;
pub const SOBRA_EXTRA: u8 = 1;
pub const SOBRA_FOLGA_PONTAS: u8 = 2;
pub const QUEBRA_SEGMENTO: u8 = 0;
pub const QUEBRA_ANGULO: u8 = 1;
pub const ESCOPO_VAO: u8 = 0;
/// `modo` do poste intermediário.
pub const MODO_NENHUM: u8 = 0;
pub const MODO_MAXIMO: u8 = 1;
pub const MODO_FIXO: u8 = 2;
pub const MODO_NUMERO: u8 = 3;
/// `familia` do painel.
pub const FAM_VIDRO: u8 = 0;
pub const FAM_CHAPA: u8 = 1;
pub const FAM_PERFURADA: u8 = 2;
pub const FAM_TELA: u8 = 3;
pub const FAM_CABO: u8 = 4;

#[derive(Clone, Debug, PartialEq)]
pub struct Aviso {
    pub codigo: u8,
    /// Posição horizontal sobre o trecho.
    pub s: f64,
    pub valor: f64,
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Perfis
// ---------------------------------------------------------------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
pub struct PerfilP {
    pub forma: u8,
    pub largura: f64,
    pub altura: f64,
    pub lados: u32,
    pub pontos: Vec<[f64; 2]>,
}

impl PerfilP {
    pub fn circular(diametro: f64) -> PerfilP {
        PerfilP { forma: FORMA_CIRCULAR, largura: diametro, altura: diametro, lados: 0, pontos: Vec::new() }
    }
    pub fn retangular(largura: f64, altura: f64) -> PerfilP {
        PerfilP { forma: FORMA_RETANGULAR, largura, altura, lados: 0, pontos: Vec::new() }
    }

    /// Extensão do perfil ao longo do caminho (o que ocupa espaço na distribuição).
    pub fn largura_ao_longo(&self) -> f64 {
        if self.forma == FORMA_POLIGONO && !self.pontos.is_empty() {
            let mn = self.pontos.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
            let mx = self.pontos.iter().map(|p| p[0]).fold(f64::NEG_INFINITY, f64::max);
            mx - mn
        } else {
            self.largura
        }
    }

    fn lados_efetivos(&self) -> u32 {
        if self.lados >= LADOS_MIN {
            self.lados.min(LADOS_MAX)
        } else if self.largura > DIAMETRO_CIRCULO_GRANDE {
            LADOS_CIRCULO_GRANDE
        } else {
            LADOS_CIRCULO
        }
    }

    /// Anel em coordenadas locais `(u, v)`: u ao longo do caminho, v para a esquerda. Anti-horário.
    pub fn anel(&self) -> Vec<[f64; 2]> {
        match self.forma {
            FORMA_RETANGULAR => {
                let (a, b) = (self.largura / 2.0, self.altura / 2.0);
                vec![[-a, -b], [a, -b], [a, b], [-a, b]]
            }
            FORMA_POLIGONO => {
                let mut p = self.pontos.clone();
                if area_assinada(&p) < 0.0 {
                    p.reverse();
                }
                p
            }
            _ => {
                let n = self.lados_efetivos();
                let r = self.largura / 2.0;
                (0..n)
                    .map(|i| {
                        let t = std::f64::consts::TAU * i as f64 / n as f64;
                        [r * t.cos(), r * t.sin()]
                    })
                    .collect()
            }
        }
    }
}

fn area_assinada(p: &[[f64; 2]]) -> f64 {
    let n = p.len();
    (0..n).map(|i| p[i][0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * p[i][1]).sum::<f64>() / 2.0
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Percurso (amostragem horizontal da cadeia)
// ---------------------------------------------------------------------------------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct Percurso {
    /// Nós distintos em planta; num trecho fechado o primeiro é repetido no fim.
    pub nos: Vec<No3>,
    /// Comprimento horizontal acumulado de cada nó de `nos`.
    pub s: Vec<f64>,
    /// Quantidade de nós distintos (sem a repetição do fecho).
    pub n: usize,
    pub total: f64,
    pub fechado: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct Amostra {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub ux: f64,
    pub uy: f64,
}

impl Percurso {
    pub fn de(t: &TrechoGC) -> Percurso {
        let mut nos: Vec<No3> = Vec::new();
        for p in &t.nos {
            if nos.last().is_none_or(|q| (q.x - p.x).hypot(q.y - p.y) > EPS) {
                nos.push(*p);
            }
        }
        if t.fechado && nos.len() > 1 {
            let (a, b) = (nos[0], nos[nos.len() - 1]);
            if (a.x - b.x).hypot(a.y - b.y) <= EPS {
                nos.pop();
            }
        }
        let n = nos.len();
        let fechado = t.fechado && n >= 3;
        if fechado {
            nos.push(nos[0]);
        }
        let mut s = vec![0.0];
        for w in nos.windows(2) {
            s.push(s[s.len() - 1] + (w[1].x - w[0].x).hypot(w[1].y - w[0].y));
        }
        let total = *s.last().unwrap_or(&0.0);
        Percurso { nos, s, n, total, fechado }
    }

    fn dir_seg(&self, k: usize) -> (f64, f64) {
        let (a, b) = (self.nos[k], self.nos[k + 1]);
        let l = (b.x - a.x).hypot(b.y - a.y);
        ((b.x - a.x) / l, (b.y - a.y) / l)
    }

    fn n_seg(&self) -> usize {
        self.nos.len().saturating_sub(1)
    }

    fn inclinacao(&self, k: usize) -> f64 {
        (self.nos[k + 1].z - self.nos[k].z) / (self.s[k + 1] - self.s[k])
    }

    /// Direção média num nó (bissetriz).
    fn dir_no(&self, i: usize) -> (f64, f64) {
        let m = self.n_seg();
        let (prev, next) = if i == 0 {
            (if self.fechado { Some(m - 1) } else { None }, Some(0))
        } else if i >= m {
            (Some(m - 1), if self.fechado { Some(0) } else { None })
        } else {
            (Some(i - 1), Some(i))
        };
        match (prev, next) {
            (Some(a), Some(b)) => {
                let (da, db) = (self.dir_seg(a), self.dir_seg(b));
                let (sx, sy) = (da.0 + db.0, da.1 + db.1);
                let l = sx.hypot(sy);
                if l < 1e-9 { db } else { (sx / l, sy / l) }
            }
            (Some(a), None) => self.dir_seg(a),
            (None, Some(b)) => self.dir_seg(b),
            _ => (1.0, 0.0),
        }
    }

    /// Giro (rad, sempre positivo) em planta no nó `i`.
    pub fn giro(&self, i: usize) -> f64 {
        let m = self.n_seg();
        let (a, b) = if i == 0 {
            if !self.fechado || m == 0 {
                return 0.0;
            }
            (m - 1, 0)
        } else if i >= m {
            return 0.0;
        } else {
            (i - 1, i)
        };
        let (da, db) = (self.dir_seg(a), self.dir_seg(b));
        (da.0 * db.1 - da.1 * db.0).atan2(da.0 * db.0 + da.1 * db.1).abs()
    }

    pub fn amostra(&self, s: f64) -> Amostra {
        if self.nos.len() < 2 {
            let p = self.nos.first().copied().unwrap_or(No3 { x: 0.0, y: 0.0, z: 0.0 });
            return Amostra { x: p.x, y: p.y, z: p.z, ux: 1.0, uy: 0.0 };
        }
        let s = s.clamp(0.0, self.total);
        // Segmento que contém s.
        let m = self.n_seg();
        let mut k = match self.s.binary_search_by(|v| v.partial_cmp(&s).unwrap()) {
            Ok(i) => i.min(m - 1),
            Err(i) => i.saturating_sub(1).min(m - 1),
        };
        // Perto de um nó: direção média.
        let mut dir = None;
        for cand in [k, k + 1] {
            if cand < self.s.len() && (self.s[cand] - s).abs() < EPS_S {
                dir = Some(self.dir_no(cand));
                k = k.min(m - 1);
            }
        }
        let (a, b) = (self.nos[k], self.nos[k + 1]);
        let t = ((s - self.s[k]) / (self.s[k + 1] - self.s[k])).clamp(0.0, 1.0);
        let (ux, uy) = dir.unwrap_or_else(|| self.dir_seg(k));
        Amostra { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, ux, uy }
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Postes (§5.2 e §5.5)
// ---------------------------------------------------------------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
pub struct PosteP {
    pub ativo: bool,
    pub perfil: PerfilP,
    pub material: u32,
    pub acima: f64,
    pub abaixo: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ParamPostes {
    pub inicio: PosteP,
    pub fim: PosteP,
    pub canto: PosteP,
    pub intermediario: PosteP,
    pub ang_canto: f64,
    pub modo: u8,
    pub espacamento: f64,
    pub numero: u32,
}

impl ParamPostes {
    pub fn do_papel(&self, papel: u8) -> &PosteP {
        match papel {
            POSTE_INICIO => &self.inicio,
            POSTE_FIM => &self.fim,
            POSTE_CANTO => &self.canto,
            _ => &self.intermediario,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Poste {
    pub s: f64,
    pub papel: u8,
    /// `true` = poste de nó (início, fim, canto, transição); `false` = intermediário de vão.
    pub no: bool,
    pub meia: f64,
    pub x: f64,
    pub y: f64,
    pub z0: f64,
    pub z1: f64,
    pub ux: f64,
    pub uy: f64,
}

fn novo_poste(perc: &Percurso, s: f64, papel: u8, no: bool, pp: &ParamPostes, altura: f64) -> Poste {
    let par = pp.do_papel(papel);
    let a = perc.amostra(s);
    Poste { s, papel, no, meia: par.perfil.largura_ao_longo() / 2.0, x: a.x, y: a.y, z0: a.z - par.abaixo, z1: a.z + altura + par.acima, ux: a.ux, uy: a.uy }
}

/// Postes de um trecho: nós (início, fim, canto, transição) e intermediários de cada vão. Ordenados por `s`.
pub fn postes(perc: &Percurso, curvo: bool, pp: &ParamPostes, altura: f64, avisos: &mut Vec<Aviso>) -> Vec<Poste> {
    let mut nos: Vec<Poste> = Vec::new();
    if perc.nos.len() < 2 {
        return nos;
    }
    let (n, m) = (perc.n, perc.n_seg());
    for i in 0..n {
        let s = perc.s[i];
        if !perc.fechado && i == 0 {
            if pp.inicio.ativo {
                nos.push(novo_poste(perc, s, POSTE_INICIO, true, pp, altura));
            }
        } else if !perc.fechado && i == n - 1 {
            if pp.fim.ativo {
                nos.push(novo_poste(perc, s, POSTE_FIM, true, pp, altura));
            }
        } else if !curvo {
            let (a, b) = if i == 0 { (m - 1, 0) } else { (i - 1, i) };
            if perc.giro(i) > pp.ang_canto + EPS {
                if pp.canto.ativo {
                    nos.push(novo_poste(perc, s, POSTE_CANTO, true, pp, altura));
                }
            } else if (perc.inclinacao(a) - perc.inclinacao(b)).abs() > 1e-9 {
                // Nó de transição: intermediário se houver espaçamento configurado, senão canto.
                if pp.intermediario.ativo && pp.modo != MODO_NENHUM {
                    nos.push(novo_poste(perc, s, POSTE_INTERMEDIARIO, true, pp, altura));
                } else if pp.canto.ativo {
                    nos.push(novo_poste(perc, s, POSTE_CANTO, true, pp, altura));
                }
            }
        }
    }
    // Limites de vão: pontas do trecho e cada nó com poste.
    let meia_no = |s: f64| nos.iter().filter(|p| (p.s - s).abs() < EPS_S || (perc.fechado && s > perc.total - EPS_S && p.s < EPS_S)).map(|p| p.meia).fold(0.0, f64::max);
    let mut lim: Vec<f64> = vec![0.0];
    lim.extend(nos.iter().map(|p| p.s).filter(|&s| s > EPS_S && s < perc.total - EPS_S));
    lim.push(perc.total);
    let mut inter: Vec<Poste> = Vec::new();
    if pp.intermediario.ativo && pp.modo != MODO_NENHUM {
        let meia_i = pp.intermediario.perfil.largura_ao_longo() / 2.0;
        for w in lim.windows(2) {
            let (a, b) = (w[0], w[1]);
            let l = b - a;
            if l <= EPS {
                continue;
            }
            let mut pos: Vec<f64> = Vec::new();
            match pp.modo {
                MODO_MAXIMO if pp.espacamento > 0.0 => {
                    let k = (l / pp.espacamento - EPS).ceil() as i64 - 1;
                    pos.extend((1..=k.max(0)).map(|j| a + l * j as f64 / (k + 1) as f64));
                }
                MODO_FIXO if pp.espacamento > 0.0 => {
                    let mut j = 1.0;
                    while a + j * pp.espacamento < b - EPS {
                        pos.push(a + j * pp.espacamento);
                        j += 1.0;
                    }
                    let resto = l - (j - 1.0) * pp.espacamento;
                    if resto < 0.3 * pp.espacamento - EPS {
                        avisos.push(Aviso { codigo: AVISO_POSTE_SOBRA_CURTA, s: b, valor: resto });
                    }
                }
                MODO_NUMERO if pp.numero > 0 => {
                    let k = pp.numero as f64;
                    pos.extend((1..=pp.numero).map(|j| a + l * j as f64 / (k + 1.0)));
                }
                _ => {}
            }
            let (ma, mb) = (meia_no(a), meia_no(b));
            for s in pos {
                if s - a < ma + meia_i - EPS || b - s < mb + meia_i - EPS {
                    continue;
                }
                inter.push(novo_poste(perc, s, POSTE_INTERMEDIARIO, false, pp, altura));
            }
        }
    }
    nos.extend(inter);
    nos.sort_by(|a, b| a.s.partial_cmp(&b.s).unwrap().then(a.papel.cmp(&b.papel)));
    nos
}

fn meia_em(postes: &[Poste], perc: &Percurso, s: f64) -> f64 {
    postes
        .iter()
        .filter(|p| (p.s - s).abs() < EPS_S || (perc.fechado && s > perc.total - EPS_S && p.s < EPS_S))
        .map(|p| p.meia)
        .fold(0.0, f64::max)
}

/// Limites de vão: pontas e todos os postes, com a meia largura do poste de cada um (0 se não há).
fn limites_de_vao(perc: &Percurso, postes: &[Poste]) -> Vec<(f64, f64)> {
    let mut s: Vec<f64> = vec![0.0];
    s.extend(postes.iter().map(|p| p.s).filter(|&v| v > EPS_S && v < perc.total - EPS_S));
    s.push(perc.total);
    s.dedup_by(|b, a| (*b - *a).abs() < EPS_S);
    s.into_iter().map(|v| (v, meia_em(postes, perc, v))).collect()
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Balaústres (§5.6)
// ---------------------------------------------------------------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
pub struct ElemP {
    /// `None` = elemento vazio (só ocupa espaço).
    pub perfil: Option<PerfilP>,
    pub material: u32,
    pub dist_anterior: f64,
    pub desloc_lateral: f64,
    pub desloc_base: f64,
    pub desloc_topo: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PorDegrauP {
    pub ativo: bool,
    pub quantidade: u32,
    /// Distância do bocel (borda frontal do piso) ao centro do montante, em metros, sempre positiva (o sentido vem do sinal da pisada).
    pub dist_quina: f64,
    /// `true` = centro da pisada (ignora `dist_quina`): com N montantes, o centro de cada uma de N faixas iguais da pisada.
    pub centro: bool,
    pub perfil: Option<PerfilP>,
    pub material: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PadraoP {
    pub elementos: Vec<ElemP>,
    pub periodo: f64,
    pub justif: u8,
    pub sobra: u8,
    pub quebra: u8,
    pub ang_quebra: f64,
    pub escopo: u8,
    /// Alturas resolvidas sobre a cota da cadeia (base e topo do padrão, antes dos deslocamentos do elemento).
    pub h_base: f64,
    pub h_topo: f64,
    pub por_degrau: PorDegrauP,
}

/// Degrau de um lance: `s0` é a quina (início da pisada, horizontal), `z` a cota do degrau.
#[derive(Clone, Debug, PartialEq)]
pub struct DegrauP {
    pub s0: f64,
    pub profundidade: f64,
    /// Cota de apoio do montante: topo do piso ACABADO do degrau (sem acabamento, o topo do piso estrutural).
    pub z: f64,
    /// Projeção do bocel deste degrau à frente da face acabada do espelho `s0` (para o lado oposto ao da pisada). 0 sem bocel.
    pub bocel: f64,
    /// Projeção do bocel do degrau seguinte, que avança sobre o fundo desta pisada. 0 sem bocel ou sem degrau seguinte.
    pub bocel_seguinte: f64,
}

impl DegrauP {
    /// Degrau sem acabamento: bocel zero, a pisada vai da face do espelho à do seguinte.
    pub fn simples(s0: f64, profundidade: f64, z: f64) -> Self {
        DegrauP { s0, profundidade, z, bocel: 0.0, bocel_seguinte: 0.0 }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Balaustre {
    pub s: f64,
    pub x: f64,
    pub y: f64,
    pub z0: f64,
    pub z1: f64,
    pub ux: f64,
    pub uy: f64,
    /// Índice em `PadraoP::elementos`; `None` = balaústre por degrau.
    pub elem: Option<usize>,
}

/// Posições locais `(u, índice do elemento)` de um vão com comprimento útil `lu` (centro do primeiro ao centro do último).
fn posicoes_no_vao(pad: &PadraoP, cum: &[f64], lu: f64, s_ref: f64, avisos: &mut Vec<Aviso>) -> Vec<(f64, usize)> {
    let d = *cum.last().unwrap();
    let p = pad.periodo;
    let mut out: Vec<(f64, usize)> = Vec::new();
    if lu < EPS {
        avisos.push(Aviso { codigo: AVISO_VAO_SEM_ESPACO, s: s_ref, valor: lu });
        return out;
    }
    if lu + EPS < d {
        // Padrão inteiro não cabe: só os elementos do início que cabem, sem cortar nenhum.
        avisos.push(Aviso { codigo: AVISO_PADRAO_NAO_CABE, s: s_ref, valor: lu });
        for (j, c) in cum.iter().enumerate() {
            if *c <= lu + EPS {
                out.push((*c, j));
            }
        }
        return out;
    }
    let (u0, per, k) = match pad.justif {
        JUSTIF_DISTRIBUIR => {
            let m = ((lu - d) / p - EPS).ceil().max(0.0);
            if m < 0.5 {
                (0.0, p, 1usize)
            } else {
                let per = (lu - d) / m;
                if per < 0.5 * p - EPS {
                    avisos.push(Aviso { codigo: AVISO_PADRAO_COMPRIMIDO, s: s_ref, valor: per });
                }
                (0.0, per, m as usize + 1)
            }
        }
        j => {
            let k = (((lu - d) / p) + EPS).floor() as usize + 1;
            let sobra = lu - ((k - 1) as f64 * p + d);
            let u0 = match j {
                JUSTIF_INICIO => {
                    if pad.sobra == SOBRA_FOLGA_PONTAS { sobra / 2.0 } else { 0.0 }
                }
                JUSTIF_FIM => {
                    if pad.sobra == SOBRA_FOLGA_PONTAS { sobra / 2.0 } else { sobra }
                }
                _ => sobra / 2.0,
            };
            (u0, p, k)
        }
    };
    for r in 0..k {
        for (j, c) in cum.iter().enumerate() {
            out.push((u0 + r as f64 * per + c, j));
        }
    }
    // Balaústre extra rente à ponta livre (justificação início/fim, sobra não repartida): usa o primeiro elemento do padrão.
    if pad.sobra == SOBRA_EXTRA && (pad.justif == JUSTIF_INICIO || pad.justif == JUSTIF_FIM) {
        let sobra = lu - ((k - 1) as f64 * per + d);
        if sobra > EPS && sobra >= per / 2.0 - EPS {
            out.push((if pad.justif == JUSTIF_INICIO { lu } else { 0.0 }, 0));
        }
    }
    out.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    out
}

/// Referência do degrau: `(s do bocel, pisada)`. O bocel é a borda frontal do piso e a pisada corre dele para a frente (sinal = sentido do caminho).
/// `s0` e `profundidade` já são medidos nas faces ACABADAS dos espelhos. Com acabamento, a borda frontal é a frente do bocel acabado (recuada `bocel`
/// da face do espelho, contra o sentido da pisada) e o fundo útil é a face do espelho seguinte menos o bocel dele, que passa por cima do piso.
/// Sem acabamento (`bocel` e `bocel_seguinte` zero) o resultado é `(s0, profundidade)`. O sentido da pisada vem do sinal de `profundidade`.
pub fn piso_do_degrau(dg: &DegrauP) -> (f64, f64) {
    let sg = if dg.profundidade < 0.0 { -1.0 } else { 1.0 };
    (dg.s0 - sg * dg.bocel, dg.profundidade + sg * (dg.bocel - dg.bocel_seguinte))
}

/// Empurra para dentro do piso um montante de centro `s` (meia seção `meia`) que cairia a menos de meia seção da quina (frente do bocel) ou do
/// espelho do degrau seguinte. Regra determinística: o centro, medido do bocel para a frente (`off`), vai para o ponto mais próximo de
/// `[meia, pisada - meia]`; se a pisada não comporta a seção inteira (`pisada < 2 * meia`), vai para o meio da pisada. Fora de qualquer
/// pisada (antes do 1º degrau, depois do último) `s` não muda. Só vale para escada (degraus informados).
pub fn empurrar_para_o_piso(degraus: &[DegrauP], s: f64, meia: f64) -> f64 {
    for dg in degraus {
        let (bocel, pisada) = piso_do_degrau(dg);
        let sg = if pisada < 0.0 { -1.0 } else { 1.0 };
        let p = pisada.abs();
        let off = (s - bocel) * sg;
        if off < -EPS || off >= p - EPS {
            continue;
        }
        let novo = if p < 2.0 * meia { p / 2.0 } else { off.clamp(meia, p - meia) };
        return bocel + sg * novo;
    }
    s
}

/// Distâncias, medidas do bocel para a frente, dos centros dos montantes de um degrau de pisada `p` (> 0).
/// Centro da pisada: N faixas iguais, um montante no meio de cada (N = 1: no meio da pisada).
/// Distância dada `d`: N = 1 em `d`; N > 1 igualmente espaçados de `d` até `p - d` (simétrico).
pub fn deslocamentos_no_piso(pd: &PorDegrauP, p: f64) -> Vec<f64> {
    let q = pd.quantidade.max(1) as usize;
    if pd.centro {
        return (0..q).map(|j| (j as f64 + 0.5) * p / q as f64).collect();
    }
    let d = pd.dist_quina.max(0.0);
    if q == 1 {
        return vec![d];
    }
    let passo = (p - 2.0 * d) / (q - 1) as f64;
    (0..q).map(|j| d + j as f64 * passo).collect()
}

#[allow(clippy::too_many_arguments)]
pub fn balaustres(
    perc: &Percurso,
    curvo: bool,
    origem: OrigemTrecho,
    postes: &[Poste],
    pad: &PadraoP,
    degraus: &[DegrauP],
    restante: usize,
    avisos: &mut Vec<Aviso>,
) -> Result<Vec<Balaustre>, u32> {
    if pad.elementos.is_empty() || pad.elementos.len() > LIMITE_ELEMENTOS_PADRAO || pad.periodo.is_nan() || pad.periodo <= EPS {
        return Err(ENTRADA);
    }
    let mut out: Vec<Balaustre> = Vec::new();
    if perc.nos.len() < 2 {
        return Ok(out);
    }
    let larg = |e: &ElemP| e.perfil.as_ref().map_or(0.0, |p| p.largura_ao_longo());
    let mut cum = Vec::with_capacity(pad.elementos.len());
    let mut acc = 0.0;
    for (j, e) in pad.elementos.iter().enumerate() {
        if j > 0 {
            acc += e.dist_anterior;
        }
        cum.push(acc);
    }
    let w_ini = larg(&pad.elementos[0]);
    let w_fim = larg(pad.elementos.last().unwrap());

    let colocar = |out: &mut Vec<Balaustre>, s: f64, elem: Option<usize>, z0: f64, z1: f64, lateral: f64| -> Result<(), u32> {
        if z1 <= z0 + EPS {
            return Ok(());
        }
        if out.len() + 1 > restante {
            return Err(LIMITE);
        }
        let a = perc.amostra(s);
        out.push(Balaustre { s, x: a.x - a.uy * lateral, y: a.y + a.ux * lateral, z0, z1, ux: a.ux, uy: a.uy, elem });
        Ok(())
    };

    // Por degrau: só nos lances (escada); patamares usam o padrão normal.
    if pad.por_degrau.ativo && matches!(origem, OrigemTrecho::Lance | OrigemTrecho::Caracol) && !degraus.is_empty() && pad.por_degrau.quantidade >= 1 {
        let meia_pd = pad.por_degrau.perfil.as_ref().map_or(0.0, |p| p.largura_ao_longo()) / 2.0;
        if pad.por_degrau.perfil.is_some() {
            let mut avisou = false;
            for dg in degraus {
                let (bocel, pisada) = piso_do_degrau(dg);
                let sg = if pisada < 0.0 { -1.0 } else { 1.0 };
                let p = pisada.abs();
                let desl = deslocamentos_no_piso(&pad.por_degrau, p);
                for off in desl.iter() {
                    // O montante inteiro tem de ficar sobre o piso: a seção não passa do bocel nem do espelho do degrau seguinte.
                    if *off < meia_pd - EPS || *off > p - meia_pd + EPS {
                        if !avisou {
                            avisos.push(Aviso { codigo: AVISO_MONTANTE_FORA_DO_PISO, s: bocel, valor: p });
                            avisou = true;
                        }
                        continue;
                    }
                    let s = bocel + sg * off;
                    // A cadeia real é cortada nas quinas por projeção em arco discretizado: tolera 5 mm fora das pontas.
                    if s < -TOL_PONTA_DEGRAU || s > perc.total + TOL_PONTA_DEGRAU {
                        continue;
                    }
                    let s = s.clamp(0.0, perc.total);
                    if colide(postes, s, meia_pd, -1.0, perc.total + 1.0) {
                        continue;
                    }
                    let a = perc.amostra(s);
                    colocar(&mut out, s, None, dg.z, a.z + pad.h_topo, 0.0)?;
                }
            }
        }
        return Ok(out);
    }

    // Fronteiras dos vãos.
    let mut front: Vec<(f64, f64)> = if pad.escopo == ESCOPO_VAO {
        limites_de_vao(perc, postes)
    } else {
        vec![(0.0, meia_em(postes, perc, 0.0)), (perc.total, meia_em(postes, perc, perc.total))]
    };
    if !curvo {
        let m = perc.n_seg();
        for i in 1..perc.n.min(m + 1) {
            if i >= perc.n || (!perc.fechado && i == perc.n - 1) {
                continue;
            }
            let quebra = match pad.quebra {
                QUEBRA_SEGMENTO => true,
                QUEBRA_ANGULO => perc.giro(i) > pad.ang_quebra + EPS,
                _ => false,
            };
            if quebra {
                front.push((perc.s[i], meia_em(postes, perc, perc.s[i])));
            }
        }
    }
    front.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    front.dedup_by(|b, a| {
        if (b.0 - a.0).abs() < EPS_S {
            a.1 = a.1.max(b.1);
            true
        } else {
            false
        }
    });

    for w in front.windows(2) {
        let ((sa, ma), (sb, mb)) = (w[0], w[1]);
        let a = ma + w_ini / 2.0;
        let b = mb + w_fim / 2.0;
        let lu = (sb - sa) - a - b;
        let locais = posicoes_no_vao(pad, &cum, lu, sa, avisos);
        for (u, j) in locais {
            let mut s = sa + a + u;
            let e = &pad.elementos[j];
            let Some(perfil) = &e.perfil else { continue };
            // Escada: o balaústre nunca fica sobre a quina nem sobre o espelho; vai para dentro do piso.
            if matches!(origem, OrigemTrecho::Lance | OrigemTrecho::Caracol) && !degraus.is_empty() {
                s = empurrar_para_o_piso(degraus, s, perfil.largura_ao_longo() / 2.0);
            }
            if colide(postes, s, perfil.largura_ao_longo() / 2.0, sa, sb) {
                continue;
            }
            let base = perc.amostra(s).z;
            colocar(&mut out, s, Some(j), base + pad.h_base + e.desloc_base, base + pad.h_topo + e.desloc_topo, e.desloc_lateral)?;
        }
    }
    Ok(out)
}

/// `true` se um elemento centrado em `s` (meia largura `meia`) encosta num poste estritamente interior ao vão `(sa, sb)`.
fn colide(postes: &[Poste], s: f64, meia: f64, sa: f64, sb: f64) -> bool {
    postes.iter().any(|p| p.s > sa + EPS_S && p.s < sb - EPS_S && (p.s - s).abs() < p.meia + meia - EPS)
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Painéis (§5.7)
// ---------------------------------------------------------------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
pub struct PainelP {
    pub familia: u8,
    pub h_base: f64,
    pub h_topo: f64,
    pub desl_base: f64,
    pub desl_topo: f64,
    pub espessura: f64,
    pub folga_lateral: f64,
    pub largura_max: f64,
    pub material: u32,
    pub perf_diam: f64,
    pub perf_passo_x: f64,
    pub perf_passo_y: f64,
    pub perf_alternado: bool,
    pub tela_larg: f64,
    pub tela_alt: f64,
    pub tela_fio: f64,
    pub cabo_diam: f64,
    pub cabo_espac: f64,
    /// 0 horizontal, 1 vertical.
    pub cabo_orient: u8,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PainelGerado {
    pub s0: f64,
    pub s1: f64,
}

/// Divide cada vão entre postes consecutivos em painéis iguais (largura máxima) com `folga_lateral` entre eles e até o poste.
pub fn paineis(perc: &Percurso, postes: &[Poste], p: &PainelP, avisos: &mut Vec<Aviso>) -> Vec<PainelGerado> {
    let mut out = Vec::new();
    if perc.nos.len() < 2 {
        return out;
    }
    for w in limites_de_vao(perc, postes).windows(2) {
        let ((sa, ma), (sb, mb)) = (w[0], w[1]);
        let avail = (sb - sa) - ma - mb - 2.0 * p.folga_lateral;
        let n = if p.largura_max > EPS { ((avail / p.largura_max - EPS).ceil().max(1.0)) as usize } else { 1 };
        let largura = (avail - (n as f64 - 1.0) * p.folga_lateral) / n as f64;
        if largura <= EPS {
            avisos.push(Aviso { codigo: AVISO_VAO_SEM_ESPACO, s: sa, valor: largura });
            continue;
        }
        for i in 0..n {
            let s0 = sa + ma + p.folga_lateral + i as f64 * (largura + p.folga_lateral);
            out.push(PainelGerado { s0, s1: s0 + largura });
        }
    }
    out
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Malha
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/// Malha de uma peça: sólido fechado e orientado para fora. Vértices na grade de 1 µm, soldados dentro da peça.
#[derive(Clone, Debug, Default)]
pub struct Malha {
    pub vertices: Vec<[f64; 3]>,
    pub indices: Vec<u32>,
    mapa: HashMap<[i64; 3], u32>,
}

impl Malha {
    fn v(&mut self, p: [f64; 3]) -> u32 {
        let k = [(p[0] / GRADE_SAIDA).round() as i64, (p[1] / GRADE_SAIDA).round() as i64, (p[2] / GRADE_SAIDA).round() as i64];
        if let Some(&i) = self.mapa.get(&k) {
            return i;
        }
        let i = self.vertices.len() as u32;
        self.vertices.push([k[0] as f64 * GRADE_SAIDA, k[1] as f64 * GRADE_SAIDA, k[2] as f64 * GRADE_SAIDA]);
        self.mapa.insert(k, i);
        i
    }

    fn tri(&mut self, a: [f64; 3], b: [f64; 3], c: [f64; 3]) {
        let (a, b, c) = (self.v(a), self.v(b), self.v(c));
        if a != b && b != c && a != c {
            self.indices.extend([a, b, c]);
        }
    }

    pub fn n_triangulos(&self) -> usize {
        self.indices.len() / 3
    }

    /// Volume assinado (positivo = normais para fora).
    pub fn volume(&self) -> f64 {
        self.indices
            .chunks(3)
            .map(|t| {
                let (a, b, c) = (self.vertices[t[0] as usize], self.vertices[t[1] as usize], self.vertices[t[2] as usize]);
                (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
            })
            .sum()
    }

    /// Fechada: cada aresta dirigida aparece uma vez e a oposta também (variedade orientada). Euler `V - E + F = 2` vale para sólidos sem furo.
    pub fn fechada(&self) -> bool {
        let mut m: HashMap<(u32, u32), i32> = HashMap::new();
        for t in self.indices.chunks(3) {
            for (a, b) in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
                *m.entry((a, b)).or_insert(0) += 1;
            }
        }
        m.iter().all(|(&(a, b), &n)| n == 1 && m.get(&(b, a)) == Some(&1))
    }

    pub fn euler(&self) -> i64 {
        let f = self.n_triangulos() as i64;
        self.vertices.len() as i64 - (3 * f / 2) + f
    }
}

/// Triangulação por orelhas de um anel anti-horário em planta (índices do anel).
fn orelhas(p: &[[f64; 2]]) -> Vec<[usize; 3]> {
    let n = p.len();
    let mut idx: Vec<usize> = (0..n).collect();
    let mut out = Vec::new();
    let cruz = |a: [f64; 2], b: [f64; 2], c: [f64; 2]| (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    let mut guarda = 0;
    while idx.len() > 3 && guarda < 10_000 {
        guarda += 1;
        let m = idx.len();
        let mut achou = false;
        for i in 0..m {
            let (a, b, c) = (idx[(i + m - 1) % m], idx[i], idx[(i + 1) % m]);
            if cruz(p[a], p[b], p[c]) <= 1e-14 {
                continue;
            }
            let dentro = idx.iter().any(|&q| {
                q != a && q != b && q != c && cruz(p[a], p[b], p[q]) >= -1e-14 && cruz(p[b], p[c], p[q]) >= -1e-14 && cruz(p[c], p[a], p[q]) >= -1e-14
            });
            if !dentro {
                out.push([a, b, c]);
                idx.remove(i);
                achou = true;
                break;
            }
        }
        if !achou {
            // Anel degenerado: leque do que sobrou.
            break;
        }
    }
    if idx.len() >= 3 {
        for i in 1..idx.len() - 1 {
            out.push([idx[0], idx[i], idx[i + 1]]);
        }
    }
    out
}

/// Sólido entre dois anéis de mesma contagem (`base` e `topo`), anti-horários em planta. Tampas por orelhas (ou duas metades no quadrilátero).
pub fn prisma_de_aneis(base: &[[f64; 3]], topo: &[[f64; 3]]) -> Malha {
    let n = base.len();
    let mut m = Malha::default();
    for i in 0..n {
        let j = (i + 1) % n;
        m.tri(base[i], base[j], topo[j]);
        m.tri(base[i], topo[j], topo[i]);
    }
    let plano: Vec<[f64; 2]> = base.iter().map(|p| [p[0], p[1]]).collect();
    let tris = if n == 4 { vec![[0, 1, 2], [0, 2, 3]] } else { orelhas(&plano) };
    for t in tris {
        m.tri(base[t[0]], base[t[2]], base[t[1]]);
        m.tri(topo[t[0]], topo[t[1]], topo[t[2]]);
    }
    m
}

/// Prisma vertical de `perfil` centrado em `(cx, cy)` entre `z0` e `z1`; `u` é a direção do caminho, `v` a normal à esquerda.
pub fn prisma_vertical(perfil: &PerfilP, cx: f64, cy: f64, ux: f64, uy: f64, z0: f64, z1: f64) -> Malha {
    let anel = perfil.anel();
    let pt = |p: &[f64; 2], z: f64| [cx + p[0] * ux - p[1] * uy, cy + p[0] * uy + p[1] * ux, z];
    let b: Vec<[f64; 3]> = anel.iter().map(|p| pt(p, z0)).collect();
    let t: Vec<[f64; 3]> = anel.iter().map(|p| pt(p, z1)).collect();
    prisma_de_aneis(&b, &t)
}

fn norm3(v: [f64; 3]) -> [f64; 3] {
    let l = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    [v[0] / l, v[1] / l, v[2] / l]
}
fn cruz3(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/// Cilindro fechado de `a` a `b` com `lados` lados (leque central nas duas tampas).
pub fn cilindro(a: [f64; 3], b: [f64; 3], diametro: f64, lados: u32) -> Malha {
    let d = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    let ajuda = if d[2].abs() < 0.9 { [0.0, 0.0, 1.0] } else { [1.0, 0.0, 0.0] };
    let e1 = norm3(cruz3(ajuda, d));
    let e2 = cruz3(d, e1);
    let r = diametro / 2.0;
    let n = lados.max(3) as usize;
    let anel = |c: [f64; 3]| -> Vec<[f64; 3]> {
        (0..n)
            .map(|i| {
                let t = std::f64::consts::TAU * i as f64 / n as f64;
                let (co, si) = (r * t.cos(), r * t.sin());
                [c[0] + co * e1[0] + si * e2[0], c[1] + co * e1[1] + si * e2[1], c[2] + co * e1[2] + si * e2[2]]
            })
            .collect()
    };
    let (p, q) = (anel(a), anel(b));
    let mut m = Malha::default();
    for i in 0..n {
        let j = (i + 1) % n;
        m.tri(p[i], p[j], q[j]);
        m.tri(p[i], q[j], q[i]);
        m.tri(a, p[j], p[i]);
        m.tri(b, q[i], q[j]);
    }
    m
}

/// Caixa de uma faceta de painel: placa de espessura `e` entre os pontos `p0` e `p1` do eixo, base em `zb*` e topo em `zt*` (paralelogramo).
fn caixa_faceta(p0: Amostra, p1: Amostra, e: f64, zb: (f64, f64), zt: (f64, f64)) -> Malha {
    let l = (p1.x - p0.x).hypot(p1.y - p0.y);
    let (ux, uy) = ((p1.x - p0.x) / l, (p1.y - p0.y) / l);
    let (nx, ny) = (-uy * e / 2.0, ux * e / 2.0);
    let ponto = |a: Amostra, sinal: f64, z: f64| [a.x + sinal * nx, a.y + sinal * ny, z];
    let b = [ponto(p0, -1.0, zb.0), ponto(p1, -1.0, zb.1), ponto(p1, 1.0, zb.1), ponto(p0, 1.0, zb.0)];
    let t = [ponto(p0, -1.0, zt.0), ponto(p1, -1.0, zt.1), ponto(p1, 1.0, zt.1), ponto(p0, 1.0, zt.0)];
    prisma_de_aneis(&b, &t)
}

/// Pontos de amostra de `[s0, s1]` incluindo os nós interiores.
fn amostras(perc: &Percurso, s0: f64, s1: f64) -> Vec<(f64, Amostra)> {
    let mut ss = vec![s0];
    ss.extend(perc.s.iter().take(perc.n).copied().filter(|&v| v > s0 + EPS_S && v < s1 - EPS_S));
    ss.push(s1);
    ss.into_iter().map(|s| (s, perc.amostra(s))).collect()
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Conjunto
// ---------------------------------------------------------------------------------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct PecaMalha {
    pub papel: u8,
    pub material: u32,
    pub malha: Malha,
    /// Painel perfurado/tela desenhado como sólido sem furo.
    pub simplificado: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ConfigDistribuicao {
    pub altura: f64,
    pub postes: ParamPostes,
    pub padroes: Vec<PadraoP>,
    pub paineis: Vec<PainelP>,
    pub degraus: Vec<DegrauP>,
    /// `false` = só posições e avisos (sem malha), para as consultas de contagem.
    pub gerar_malha: bool,
}

#[derive(Clone, Debug, Default)]
pub struct SaidaDistribuicao {
    pub postes: Vec<Poste>,
    pub balaustres: Vec<Vec<Balaustre>>,
    pub paineis: Vec<Vec<PainelGerado>>,
    pub pecas: Vec<PecaMalha>,
    pub avisos: Vec<Aviso>,
    /// Cabos de cada painel de `cfg.paineis` (um item por painel de cabos; vazio nos outros): eixo de cada cabo como polilinha 3D. Sempre calculado
    /// (com ou sem malha): é a fonte única do desenho e das quantidades dos cabos.
    pub cabos: Vec<Vec<Vec<[f64; 3]>>>,
}

/// Distribui postes, balaústres e painéis de um trecho. `restante` = quantos balaústres ainda cabem no guarda-corpo (`LIMITE_BALAUSTRES` menos o que
/// os outros trechos já usaram). `Err(LIMITE)` quando passa; `Err(ENTRADA)` para padrão inválido.
pub fn distribuir(trecho: &TrechoGC, cfg: &ConfigDistribuicao, restante: usize) -> Result<SaidaDistribuicao, u32> {
    let perc = Percurso::de(trecho);
    let mut saida = SaidaDistribuicao::default();
    saida.postes = postes(&perc, trecho.curvo, &cfg.postes, cfg.altura, &mut saida.avisos);
    let mut resta = restante;
    for pad in &cfg.padroes {
        let v = balaustres(&perc, trecho.curvo, trecho.origem, &saida.postes, pad, &cfg.degraus, resta, &mut saida.avisos)?;
        resta -= v.len();
        saida.balaustres.push(v);
    }
    for pn in &cfg.paineis {
        let lista = paineis(&perc, &saida.postes, pn, &mut saida.avisos);
        let mut cabos = Vec::new();
        if pn.familia == FAM_CABO {
            for g in &lista {
                cabos.extend(cabos_do_painel(&perc, g, pn));
            }
        }
        saida.cabos.push(cabos);
        saida.paineis.push(lista);
    }
    if cfg.gerar_malha {
        for p in &saida.postes {
            let par = cfg.postes.do_papel(p.papel);
            saida.pecas.push(PecaMalha {
                papel: PAPEL_POSTE,
                material: par.material,
                malha: prisma_vertical(&par.perfil, p.x, p.y, p.ux, p.uy, p.z0, p.z1),
                simplificado: false,
            });
        }
        for (pad, lista) in cfg.padroes.iter().zip(&saida.balaustres) {
            for b in lista {
                let (perfil, material) = match b.elem {
                    Some(j) => (pad.elementos[j].perfil.as_ref(), pad.elementos[j].material),
                    None => (pad.por_degrau.perfil.as_ref(), pad.por_degrau.material),
                };
                if let Some(perfil) = perfil {
                    saida.pecas.push(PecaMalha {
                        papel: PAPEL_BALAUSTRE,
                        material,
                        malha: prisma_vertical(perfil, b.x, b.y, b.ux, b.uy, b.z0, b.z1),
                        simplificado: false,
                    });
                }
            }
        }
        for (pn, lista) in cfg.paineis.iter().zip(&saida.paineis) {
            for g in lista {
                malha_painel(&perc, g, pn, &mut saida.pecas);
            }
        }
    }
    Ok(saida)
}

fn malha_painel(perc: &Percurso, g: &PainelGerado, p: &PainelP, pecas: &mut Vec<PecaMalha>) {
    let am = amostras(perc, g.s0, g.s1);
    let zb = |a: &Amostra| a.z + p.h_base + p.desl_base;
    let zt = |a: &Amostra| a.z + p.h_topo + p.desl_topo;
    if p.familia == FAM_CABO {
        for eixo in cabos_do_painel(perc, g, p) {
            let mut m = Malha::default();
            for w in eixo.windows(2) {
                let c = cilindro(w[0], w[1], p.cabo_diam, LADOS_CIRCULO);
                juntar(&mut m, &c);
            }
            pecas.push(PecaMalha { papel: PAPEL_CABO, material: p.material, malha: m, simplificado: false });
        }
        return;
    }
    let esp = if p.familia == FAM_TELA { p.tela_fio.max(0.002) } else { p.espessura };
    let mut m = Malha::default();
    for w in am.windows(2) {
        let c = caixa_faceta(w[0].1, w[1].1, esp, (zb(&w[0].1), zb(&w[1].1)), (zt(&w[0].1), zt(&w[1].1)));
        juntar(&mut m, &c);
    }
    pecas.push(PecaMalha { papel: PAPEL_PAINEL, material: p.material, malha: m, simplificado: p.familia == FAM_PERFURADA || p.familia == FAM_TELA });
}

/// Eixos dos cabos de um painel de cabos (`FAM_CABO`): horizontais acompanham a cadeia entre `g.s0` e `g.s1`; verticais são retas de `h_base` a `h_topo`.
/// Fonte única da malha, da planta, do corte e das quantidades dos cabos.
pub fn cabos_do_painel(perc: &Percurso, g: &PainelGerado, p: &PainelP) -> Vec<Vec<[f64; 3]>> {
    let mut out = Vec::new();
    let (alt_b, alt_t) = (p.h_base + p.desl_base, p.h_topo + p.desl_topo);
    let h = alt_t - alt_b;
    let d = p.cabo_diam;
    if h <= d + EPS || d <= EPS || p.cabo_espac <= EPS {
        return out;
    }
    if p.cabo_orient == 0 {
        let am = amostras(perc, g.s0, g.s1);
        let n = ((h - d) / p.cabo_espac + EPS).floor() as usize + 1;
        let primeiro = alt_b + (h - (n as f64 - 1.0) * p.cabo_espac) / 2.0;
        for k in 0..n {
            let hk = primeiro + k as f64 * p.cabo_espac;
            out.push(am.iter().map(|(_, a)| [a.x, a.y, a.z + hk]).collect());
        }
    } else {
        let l = g.s1 - g.s0;
        if l <= d + EPS {
            return out;
        }
        let n = ((l - d) / p.cabo_espac + EPS).floor() as usize + 1;
        let primeiro = g.s0 + (l - (n as f64 - 1.0) * p.cabo_espac) / 2.0;
        for k in 0..n {
            let a = perc.amostra(primeiro + k as f64 * p.cabo_espac);
            out.push(vec![[a.x, a.y, a.z + alt_b], [a.x, a.y, a.z + alt_t]]);
        }
    }
    out
}

/// Acrescenta os sólidos de `o` em `m` (sólidos separados: cada um continua fechado).
fn juntar(m: &mut Malha, o: &Malha) {
    let base = m.vertices.len() as u32;
    m.vertices.extend(o.vertices.iter().copied());
    m.indices.extend(o.indices.iter().map(|i| i + base));
    // O mapa de soldagem deixa de valer para o que veio de fora; vértices novos não se fundem com os antigos.
    m.mapa.clear();
}

#[cfg(test)]
mod testes;
#[cfg(test)]
mod real;
