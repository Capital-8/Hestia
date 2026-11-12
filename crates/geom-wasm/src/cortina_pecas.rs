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

use std::collections::BTreeSet;

use crate::cena::Cena;
use crate::cortina_grade::{arestas, linhas_do_eixo, IndiceGrades};
use crate::cortina_juncao::resolver_ponta;
use crate::cortina_malha::{faixa_plana, faixas_do_vizinho, secao, valor_em, varia, Faixas};
use crate::cortina_remap::{fundir, linhas_finais, mapear_celulas, mapear_segmentos, Alvo, CelSob, Escolha, ExtLinha, LinhaFinal, Orfao, SegRemovido, SobLinha};
use crate::cortina_tipos::*;
use crate::esquema::{
    AVISO_CORTINA_ARCO_NAO_SUPORTADO, AVISO_CORTINA_CELULA_NAO_RETANGULAR, AVISO_CORTINA_CELULA_PEQUENA, AVISO_CORTINA_MONTANTE_SOBREPOSTO,
    AVISO_CORTINA_OVERRIDE_ORFAO_CELULA, AVISO_CORTINA_OVERRIDE_ORFAO_LINHA, AVISO_CORTINA_OVERRIDE_ORFAO_SEGMENTO, AVISO_CORTINA_PROFUNDIDADE_MENOR_QUE_PERFIL,
    ENTRADA, ID_AUSENTE, LIMITE, NIVEL_TODOS,
};
use crate::secoes_cortina::SecoesCortina;

/// Um tipo de montante já conferido. `espessura` (L: abas; canto: chapa) e `largura2` (trapézio: face interna) valem 0 onde não se aplicam.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Montante {
    pub tipo: u32,
    pub forma: u8,
    pub largura: f64,
    pub profundidade: f64,
    pub espessura: f64,
    pub largura2: f64,
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

    /// Área da seção reta (m²), pela fórmula de cada perfil (ADR §4.2): `rect` w·d; `round` πw²/4; `L` t(w + d − t); `trapezoid` (w + wb)/2·d;
    /// `corner` w·d − (w − 2t)(d − 2t).
    pub fn area_secao(&self) -> f64 {
        let (w, d, t) = (self.largura, self.profundidade, self.espessura);
        match self.forma {
            FORMA_REDONDA => std::f64::consts::PI * w * w / 4.0,
            FORMA_L => t * (w + d - t),
            FORMA_TRAPEZIO => (w + self.largura2) / 2.0 * d,
            FORMA_CORNER => w * d - (w - 2.0 * t) * (d - 2.0 * t),
            _ => w * d,
        }
    }

    /// Perímetro externo da seção (m). O canto soma o contorno interno, que é um furo.
    pub fn perimetro(&self) -> f64 {
        let (w, d, t) = (self.largura, self.profundidade, self.espessura);
        match self.forma {
            FORMA_REDONDA => std::f64::consts::PI * w,
            FORMA_L => 2.0 * (w + d),
            FORMA_TRAPEZIO => w + self.largura2 + 2.0 * (((w - self.largura2) / 2.0).powi(2) + d * d).sqrt(),
            FORMA_CORNER => 2.0 * (w + d) + 2.0 * ((w - 2.0 * t) + (d - 2.0 * t)),
            _ => 2.0 * (w + d),
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
    /// Tipo de painel da célula (sempre há o padrão; é o da região).
    pub painel: u32,
    pub flags: u32,
    /// Célula canônica da região a que a célula pertence (`i · nv + j` da de menor `(j, i)`); a célula é a própria região quando não há fusão.
    pub regiao: u32,
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
    /// `ID_AUSENTE` = sem montante nesse papel (também quando o segmento está inativo).
    pub montante: u32,
    /// Inativo: removido pelo usuário (`removedSegments`) ou interno a uma região fundida. Não gera peça.
    pub removido: bool,
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

/// Peça de montante com ESQUADRIA (fase 3): a ponta encosta no contorno de um vizinho contínuo que varia com a profundidade (perfil L ou trapézio), então
/// não é prisma. `lo` e `hi` são os limites da peça no eixo dela (`t` para horizontal; `z` para vertical), em função da profundidade `y`. Sai em `grupos`.
#[derive(Clone, Debug, PartialEq)]
pub struct PecaEsq {
    pub eixo: u8,
    pub linha: u32,
    pub k: u32,
    pub papel: u32,
    pub m: Montante,
    pub pos: f64,
    pub lo: Faixas,
    pub hi: Faixas,
    pub continuo: bool,
}

/// Montante de canto entre duas cortinas (fase 3, ADR §6.5): um prisma de altura total sobre o polígono do encontro (no mundo, anti-horário). Só a cortina
/// de menor id das duas o emite, então a peça existe uma vez só. `papel` é `PAPEL_CANTO`.
#[derive(Clone, Debug, PartialEq)]
pub struct PecaCanto {
    pub m: Montante,
    pub poligono: Vec<[f64; 2]>,
    /// Cotas absolutas de baixo e de cima.
    pub z0: f64,
    pub z1: f64,
}

impl PecaCanto {
    /// Área do polígono em planta (m²).
    pub fn area_planta(&self) -> f64 {
        let p = &self.poligono;
        (0..p.len()).map(|k| p[k][0] * p[(k + 1) % p.len()][1] - p[(k + 1) % p.len()][0] * p[k][1]).sum::<f64>().abs() / 2.0
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
    /// Origem de cada aresta (`ORIGEM_GERADA`, `ORIGEM_EXTRA` ou `ORIGEM_MANUAL`); as bordas valem 0.
    pub origem_u: Vec<u32>,
    pub origem_v: Vec<u32>,
    /// Linha travada (`locked`) de cada aresta: 1 ou 0 (flag bit 0 de `cortina_grade.linhas`); as bordas valem 0.
    pub travada_u: Vec<u32>,
    pub travada_v: Vec<u32>,
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
    /// Peças com esquadria (ver `PecaEsq`); as demais, prismas, estão em `pecas`.
    pub pecas_esq: Vec<PecaEsq>,
    /// Montantes de canto que esta cortina emite (fase 3): zero ou um por ponta.
    pub cantos: Vec<PecaCanto>,
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

    /// Segmento ativo (sem remoção) com montante: `eixo` U (vertical na linha `linha`, fileira `k`) ou V (horizontal).
    fn seg_com_montante(&self, eixo: u8, linha: usize, k: usize) -> bool {
        let idx = if eixo == EIXO_U { linha * self.nv() + k } else { (self.nu() + 1) * self.nv() + linha * self.nu() + k };
        let s = &self.segmentos[idx];
        !s.removido && s.montante != ID_AUSENTE
    }

    /// Face que o montante vertical da linha `i` oferece ao nó na fileira `j`: a largura do perfil, se algum segmento vertical que encosta no nó
    /// (fileira `j - 1` ou `j`) tem montante ativo; senão 0 (um segmento removido não recorta a horizontal, ADR §5.3).
    pub fn face_u(&self, i: usize, j: usize) -> f64 {
        let ativo = (j > 0 && self.seg_com_montante(EIXO_U, i, j - 1)) || (j < self.nv() && self.seg_com_montante(EIXO_U, i, j));
        if ativo { self.largura_u(i) } else { 0.0 }
    }

    /// Face que o montante horizontal da fileira `j` oferece ao nó na coluna `i` (análogo a `face_u`).
    pub fn face_v(&self, j: usize, i: usize) -> f64 {
        let ativo = (i > 0 && self.seg_com_montante(EIXO_V, j, i - 1)) || (i < self.nu() && self.seg_com_montante(EIXO_V, j, i));
        if ativo { self.largura_v(j) } else { 0.0 }
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
    if m.forma > FORMA_CORNER || m.largura <= 0.0 || m.profundidade <= 0.0 {
        return Err(ENTRADA);
    }
    // Geometria de cada forma (ADR §4.2): a alma e as abas de L cabem na seção; a chapa do canto é um tubo (furo com folga); o trapézio precisa de
    // face interna positiva. Valores ausentes (NaN) contam como zero.
    let (esp, wb) = (if m.espessura.is_nan() { 0.0 } else { m.espessura }, if m.largura2.is_nan() { 0.0 } else { m.largura2 });
    let menor = m.largura.min(m.profundidade);
    let valido = match m.forma {
        FORMA_L => esp > 0.0 && esp < menor,
        FORMA_TRAPEZIO => wb > 0.0,
        FORMA_CORNER => esp > 0.0 && 2.0 * esp < menor,
        _ => true,
    };
    if !valido {
        return Err(ENTRADA);
    }
    Ok(Some(Montante { tipo: id, forma: m.forma, largura: m.largura, profundidade: m.profundidade, espessura: esp, largura2: wb, desloc: m.deslocamento, material: m.material }))
}

/// Limite de uma ponta de montante contra o vizinho na linha: `coef` e `c` dão a coordenada `c + coef·x` do vizinho (x na face); `maximo` diz se a ponta
/// fica além do máximo (vizinho do lado de menor coordenada) ou do mínimo. Vizinho de plano (retangular ou redondo, ou `None` sem o vizinho ativo) dá a
/// face de largura do perfil, como sempre; o perfil L e o trapézio dão a envoltória exata por faixa de profundidade.
fn limite_vizinho(vizinho: Option<&Montante>, face: f64, c: f64, coef: f64, maximo: bool, nominal: f64) -> Faixas {
    if face == 0.0 {
        return faixa_plana(nominal);
    }
    match vizinho {
        Some(m) if matches!(m.forma, FORMA_L | FORMA_TRAPEZIO | FORMA_CORNER) => faixas_do_vizinho(&secao(m, 2), c, coef, maximo),
        _ => faixa_plana(if maximo { c + face / 2.0 } else { c - face / 2.0 }),
    }
}

/// Faixa de profundidade do perfil (`[y0, y1]` do sistema de referência da cortina).
fn faixa_y(m: &Montante) -> (f64, f64) {
    (m.desloc - m.prof() / 2.0, m.desloc + m.prof() / 2.0)
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
    // Quadro: o plano central e o lado de fora (mesma conta de `buildFrame`: sExt = sinal · extOffset, sInt = sExt − sinal · profundidade).
    let ext = match c.loc {
        0 | 1 => d / 2.0,
        2 | 4 => 0.0,
        _ => d,
    };
    let sigma = if c.invertida { -1.0 } else { 1.0 };
    let s_mid = sigma * (ext - d / 2.0);

    // Junção (fase 3, ADR §6.5): cada ponta com vizinha recua do nó (encosto reto ou canto), e a cortina passa a medir `l − recuos`, a partir do ponto
    // recuado. A grade, as sobrescritas e as peças usam essa cortina encurtada; sem junção, `recuo = 0` e nada muda.
    let mut pontas = [resolver_ponta(sec, id, c, t, 0), resolver_ponta(sec, id, c, t, 1)];
    let recuo = |p: &Option<crate::cortina_juncao::Ponta>| p.as_ref().map_or(0.0, |x| x.recuo);
    if l - recuo(&pontas[0]) - recuo(&pontas[1]) < 10.0 * COMPRIMENTO_MIN {
        pontas = [None, None]; // a junção comeria a cortina inteira: fica como se não houvesse
    }
    let (r0, r1) = (recuo(&pontas[0]), recuo(&pontas[1]));
    let a_cortina = [c.a[0] + u[0] * r0, c.a[1] + u[1] * r0];
    let l = l - r0 - r1;
    let eu = grades.efetivo(c.tipo, id, EIXO_U)?;
    let ev = grades.efetivo(c.tipo, id, EIXO_V)?;
    let lu = linhas_do_eixo(l, &eu)?;
    let lv = linhas_do_eixo(h, &ev)?;

    // Sobrescritas gravadas desta cortina (fase 2), em ordem de id. Cada uma é remapeada contra a grade NOVA (cortina_remap).
    let sob_linhas = |eixo: u8| -> Vec<SobLinha> {
        sec.linhas_sobrescritas
            .iter()
            .filter(|(_, s)| s.cortina == id && s.eixo == eixo)
            .map(|(&k, s)| SobLinha { id: k, linha: s.linha, pos_norm: s.pos_norm, n: s.n, travada: s.travada, pos: s.pos, comp: s.comp, modo: s.modo, montante: s.montante })
            .collect()
    };
    let ext_linhas = |eixo: u8| -> Vec<ExtLinha> {
        sec.extras.iter().filter(|(_, e)| e.cortina == id && e.eixo == eixo).map(|(&k, e)| ExtLinha { id: k, pos: e.pos, travada: e.travada, comp: e.comp, montante: e.montante }).collect()
    };
    let (manual_u, manual_v) = (eu.modo == MODO_MANUAL, ev.modo == MODO_MANUAL);
    let fin_u = linhas_finais(EIXO_U, l, &lu.linhas, manual_u, &sob_linhas(EIXO_U), &ext_linhas(EIXO_U));
    let fin_v = linhas_finais(EIXO_V, h, &lv.linhas, manual_v, &sob_linhas(EIXO_V), &ext_linhas(EIXO_V));
    let pos_u: Vec<f64> = fin_u.linhas.iter().map(|f| f.pos).collect();
    let pos_v: Vec<f64> = fin_v.linhas.iter().map(|f| f.pos).collect();
    let us = arestas(l, &pos_u);
    let vs = arestas(h, &pos_v);
    let (nu, nv) = (us.len() - 1, vs.len() - 1);
    if nu.saturating_mul(nv) > LIMITE_CELULAS {
        return Err(LIMITE);
    }
    let cel_sob: Vec<CelSob> = sec
        .celulas_sobrescritas
        .iter()
        .filter(|(_, x)| x.cortina == id)
        .map(|(&k, x)| CelSob { id: k, i: x.i, j: x.j, s: x.s, z: x.z, nu: x.nu, nv: x.nv, painel: x.painel })
        .collect();
    let celulas_fin = mapear_celulas(&us, &vs, &cel_sob);
    let seg_ref: Vec<SegRemovido> = sec
        .segmentos_removidos
        .iter()
        .filter(|(_, s)| s.cortina == id)
        .map(|(&k, s)| SegRemovido { id: k, eixo: s.eixo, extra: s.extra, linha: s.linha, pos_norm: s.pos_norm, n: s.n, k: s.k, nk: s.nk, mid: s.mid })
        .collect();
    let (pedidos, orf_seg) = mapear_segmentos(&seg_ref, [fin_u.linhas.as_slice(), fin_v.linhas.as_slice()], [lu.linhas.as_slice(), lv.linhas.as_slice()], [us.as_slice(), vs.as_slice()]);
    let fus = fundir(nu, nv, &pedidos);

    // Montantes por papel e painel padrão.
    let m = |k: usize| montante_de(sec, t.montantes[k]);
    let (m_iv, m_ih, m_bi, m_bf, m_bb, m_bt) = (m(0)?, m(1)?, m(2)?, m(3)?, m(4)?, m(5)?);
    // O montante de canto substitui o de borda da ponta (o canto é um só, entre as duas cortinas).
    let (m_bi, m_bf) = (if pontas[0].as_ref().is_some_and(|x| x.canto.is_some()) { None } else { m_bi }, if pontas[1].as_ref().is_some_and(|x| x.canto.is_some()) { None } else { m_bf });
    let painel_padrao = painel_de(sec, if c.painel_padrao != ID_AUSENTE { c.painel_padrao } else { t.painel_padrao })?;
    let min_cell = if t.celula_minima.is_nan() { CELULA_MINIMA_PADRAO } else { t.celula_minima };
    // Montante de cada aresta: a borda é do papel; a linha interior é a final, com o montante do eixo, o seu próprio ou nenhum.
    let escolhido = |f: &LinhaFinal, padrao: Option<Montante>| -> Result<Option<Montante>, u32> {
        match f.montante {
            Escolha::Padrao => Ok(padrao),
            Escolha::Sem => Ok(None),
            Escolha::Tipo(x) => montante_de(sec, x),
        }
    };
    let mut mont_u: Vec<Option<Montante>> = vec![None; nu + 1];
    let mut origem_u: Vec<u32> = vec![0; nu + 1];
    let mut travada_u: Vec<u32> = vec![0; nu + 1];
    mont_u[0] = m_bi;
    mont_u[nu] = m_bf;
    for (k, f) in fin_u.linhas.iter().enumerate() {
        mont_u[k + 1] = escolhido(f, m_iv)?;
        origem_u[k + 1] = f.origem;
        travada_u[k + 1] = u32::from(f.travada);
    }
    let mut mont_v: Vec<Option<Montante>> = vec![None; nv + 1];
    let mut origem_v: Vec<u32> = vec![0; nv + 1];
    let mut travada_v: Vec<u32> = vec![0; nv + 1];
    mont_v[0] = m_bb;
    mont_v[nv] = m_bt;
    for (k, f) in fin_v.linhas.iter().enumerate() {
        mont_v[k + 1] = escolhido(f, m_ih)?;
        origem_v[k + 1] = f.origem;
        travada_v[k + 1] = u32::from(f.travada);
    }
    let papel_u: Vec<u32> = (0..=nu).map(|i| if i == 0 { PAPEL_BORDA_INI } else if i == nu { PAPEL_BORDA_FIM } else { PAPEL_INT_V }).collect();
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

    let mut g = Geom {
        l,
        h,
        d,
        z_base: c.z_base,
        a: a_cortina,
        u,
        n,
        sigma,
        s_mid,
        us,
        vs,
        cu,
        cv,
        origem_u,
        origem_v,
        travada_u,
        travada_v,
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
        pecas_esq: Vec::new(),
        cantos: Vec::new(),
        paineis: Vec::new(),
    };

    // Segmentos nominais: cada linha de U corre na vertical (um por fileira) e cada linha de V na horizontal (um por coluna). Um segmento fica INATIVO
    // (sem montante) quando foi removido ou quando as duas células vizinhas são da mesma região fundida: dentro de um painel não há perfil.
    let regiao_de = &fus.regiao_de;
    // Removidos explicitamente (inclui as bordas): índice da linha final e segmento.
    let removidos_u: BTreeSet<(usize, usize)> = fus.aceitos.iter().filter(|a| a.0 == EIXO_U).map(|a| (a.1, a.2)).collect();
    let removidos_v: BTreeSet<(usize, usize)> = fus.aceitos.iter().filter(|a| a.0 == EIXO_V).map(|a| (a.1, a.2)).collect();
    for i in 0..=nu {
        for k in 0..nv {
            let ina = removidos_u.contains(&(i, k)) || (i > 0 && i < nu && regiao_de[(i - 1) * nv + k] == regiao_de[i * nv + k]);
            let montante = if ina { None } else { g.mont_u[i] };
            g.segmentos.push(Segmento {
                eixo: EIXO_U,
                linha: i as u32,
                k: k as u32,
                de: g.vs[k],
                ate: g.vs[k + 1],
                papel: g.papel_u[i],
                montante: montante.map(|x| x.tipo).unwrap_or(ID_AUSENTE),
                removido: ina,
            });
        }
    }
    for j in 0..=nv {
        for k in 0..nu {
            let ina = removidos_v.contains(&(j, k)) || (j > 0 && j < nv && regiao_de[k * nv + j - 1] == regiao_de[k * nv + j]);
            let montante = if ina { None } else { g.mont_v[j] };
            g.segmentos.push(Segmento {
                eixo: EIXO_V,
                linha: j as u32,
                k: k as u32,
                de: g.us[k],
                ate: g.us[k + 1],
                papel: g.papel_v[j],
                montante: montante.map(|x| x.tipo).unwrap_or(ID_AUSENTE),
                removido: ina,
            });
        }
    }

    // Painel por REGIÃO: a sobrescrita vale para a região inteira (a da célula de menor (j, i) que tenha uma). Região de uma célula = a célula.
    let mut pan_cel: Vec<Option<u32>> = vec![None; nu * nv];
    for (i, j, o) in &celulas_fin.adotadas {
        pan_cel[i * nv + j] = Some(o.painel);
    }
    for reg in &fus.regioes {
        let mut sobre = None;
        for j in reg.j0..=reg.j1 {
            for i in reg.i0..=reg.i1 {
                if sobre.is_none() {
                    sobre = pan_cel[i * nv + j];
                }
            }
        }
        let painel = match sobre {
            Some(pid) => painel_de(sec, pid)?,
            None => g.painel_padrao,
        };
        // Margem só onde a borda da região tem montante ativo (segmento removido de borda não desconta nada).
        let lados = [
            (reg.j0..=reg.j1).any(|j| g.seg_com_montante(EIXO_U, reg.i0, j)),
            (reg.j0..=reg.j1).any(|j| g.seg_com_montante(EIXO_U, reg.i1 + 1, j)),
            (reg.i0..=reg.i1).any(|i| g.seg_com_montante(EIXO_V, reg.j0, i)),
            (reg.i0..=reg.i1).any(|i| g.seg_com_montante(EIXO_V, reg.j1 + 1, i)),
        ];
        let (fs0, fs1) = (
            if lados[0] { g.cu[reg.i0] + g.largura_u(reg.i0) / 2.0 } else { g.us[reg.i0] },
            if lados[1] { g.cu[reg.i1 + 1] - g.largura_u(reg.i1 + 1) / 2.0 } else { g.us[reg.i1 + 1] },
        );
        let (fz0, fz1) = (
            if lados[2] { g.cv[reg.j0] + g.largura_v(reg.j0) / 2.0 } else { g.vs[reg.j0] },
            if lados[3] { g.cv[reg.j1 + 1] - g.largura_v(reg.j1 + 1) / 2.0 } else { g.vs[reg.j1 + 1] },
        );
        let p = PainelPeca { i: reg.canon.0 as u32, j: reg.canon.1 as u32, p: painel, s0: fs0, s1: fs1, z0: fz0, z1: fz1, lados };
        let menor = p.largura_livre().min(p.altura_livre());
        let mut flags = 0;
        if menor < min_cell - EPS_CONTAGEM {
            flags |= CELULA_PEQUENA;
            let (meio_s, meio_z) = ((g.us[reg.i0] + g.us[reg.i1 + 1]) / 2.0, (g.vs[reg.j0] + g.vs[reg.j1 + 1]) / 2.0);
            let q = g.mundo(meio_s, 0.0, meio_z);
            r.avisos.push(AvisoC { codigo: AVISO_CORTINA_CELULA_PEQUENA, i: reg.canon.0 as u32, j: reg.canon.1 as u32, medido: menor, limite: min_cell, p: q });
        }
        let canonica = (reg.canon.0 * nv + reg.canon.1) as u32;
        let multi = if (reg.i1 - reg.i0 + 1) * (reg.j1 - reg.j0 + 1) > 1 { CELULA_REGIAO_MULTIPLA } else { 0 };
        for j in reg.j0..=reg.j1 {
            for i in reg.i0..=reg.i1 {
                // Bit 1: a célula recebeu uma sobrescrita de painel adotada; bit 2: a região tem mais de uma célula.
                let adotada = if pan_cel[i * nv + j].is_some() { CELULA_SOBRESCRITA } else { 0 };
                g.celulas.push(Celula { i: i as u32, j: j as u32, s0: g.us[i], s1: g.us[i + 1], z0: g.vs[j], z1: g.vs[j + 1], painel: painel.tipo, flags: flags | adotada | multi, regiao: canonica });
            }
        }
        g.paineis.push(p);
    }
    g.celulas.sort_by_key(|x| (x.i, x.j));

    // Montantes de canto que esta cortina emite (ADR §6.5): um prisma de altura total por ponta com canto, o da cortina de menor id.
    for p in pontas.iter().flatten() {
        if let Some(cn) = p.canto.as_ref().filter(|x| x.emite) {
            if let Some(mt) = montante_de(sec, cn.montante)? {
                g.cantos.push(PecaCanto { m: mt, poligono: cn.poligono.clone(), z0: c.z_base, z1: c.z_base + h });
            }
        }
    }

    // Montantes por segmento. O contínuo corre de linha a linha (centro a centro); o quebrado para na face do contínuo. Segmento inativo não tem peça.
    // A ponta do quebrado é a envoltória do contínuo vizinho (fase 3): plano para `rect`/`round`, como antes; perfil exato para L e trapézio. Peça cuja
    // ponta varia com a profundidade vai a `pecas_esq` (esquadria); as demais são prismas com `de`/`ate` constantes.
    let vertical_continua = t.prioridade == PRIORIDADE_VERTICAL;
    for i in 0..=nu {
        let Some(mt) = g.mont_u[i] else { continue };
        let (ymin, ymax) = faixa_y(&mt);
        for k in 0..nv {
            if g.segmentos[i * nv + k].removido {
                continue;
            }
            // Sem face (segmento de borda removido, ou sem montante no nó), a ponta vai à aresta: a borda não recorta nada ali.
            let (f0, f1) = (g.face_v(k, i), g.face_v(k + 1, i));
            let (lo, hi) = if vertical_continua {
                (faixa_plana(g.vs[k]), faixa_plana(g.vs[k + 1]))
            } else {
                (limite_vizinho(g.mont_v[k].as_ref(), f0, g.cv[k], -g.sigma, true, g.vs[k]), limite_vizinho(g.mont_v[k + 1].as_ref(), f1, g.cv[k + 1], -g.sigma, false, g.vs[k + 1]))
            };
            if varia(&lo, ymin, ymax) || varia(&hi, ymin, ymax) {
                g.pecas_esq.push(PecaEsq { eixo: EIXO_U, linha: i as u32, k: k as u32, papel: g.papel_u[i], m: mt, pos: g.cu[i], lo, hi, continuo: vertical_continua });
                continue;
            }
            let ym = (ymin + ymax) / 2.0;
            let (de, ate) = (valor_em(&lo, ym), valor_em(&hi, ym));
            if ate - de > TOL_POS {
                g.pecas.push(PecaMont { eixo: EIXO_U, linha: i as u32, k: k as u32, papel: g.papel_u[i], m: mt, pos: g.cu[i], de, ate, continuo: vertical_continua });
            }
        }
    }
    let base_v = (nu + 1) * nv;
    for j in 0..=nv {
        let Some(mt) = g.mont_v[j] else { continue };
        let (ymin, ymax) = faixa_y(&mt);
        for k in 0..nu {
            if g.segmentos[base_v + j * nu + k].removido {
                continue;
            }
            let (f0, f1) = (g.face_u(k, j), g.face_u(k + 1, j));
            let (lo, hi) = if !vertical_continua {
                (faixa_plana(g.us[k]), faixa_plana(g.us[k + 1]))
            } else {
                // Coordenada t = pos + σ·x do vizinho: o início encosta no máximo, o fim no mínimo.
                (limite_vizinho(g.mont_u[k].as_ref(), f0, g.cu[k], g.sigma, true, g.us[k]), limite_vizinho(g.mont_u[k + 1].as_ref(), f1, g.cu[k + 1], g.sigma, false, g.us[k + 1]))
            };
            if varia(&lo, ymin, ymax) || varia(&hi, ymin, ymax) {
                g.pecas_esq.push(PecaEsq { eixo: EIXO_V, linha: j as u32, k: k as u32, papel: g.papel_v[j], m: mt, pos: g.cv[j], lo, hi, continuo: !vertical_continua });
                continue;
            }
            let ym = (ymin + ymax) / 2.0;
            let (de, ate) = (valor_em(&lo, ym), valor_em(&hi, ym));
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
    // Fase 2: órfãs (célula, linha e segmento) e remoções recusadas por região não retangular.
    let orfaos = fin_u.orfaos.iter().chain(fin_v.orfaos.iter()).chain(celulas_fin.orfaos.iter()).chain(orf_seg.iter());
    for o in orfaos {
        r.avisos.push(aviso_orfao(&g, o));
    }
    for rc in &fus.recusados {
        let (cs, cz) = ((g.us[rc.i] + g.us[rc.i + 1]) / 2.0, (g.vs[rc.j] + g.vs[rc.j + 1]) / 2.0);
        r.avisos.push(AvisoC { codigo: AVISO_CORTINA_CELULA_NAO_RETANGULAR, i: rc.i as u32, j: rc.j as u32, medido: rc.medido, limite: rc.limite, p: g.mundo(cs, 0.0, cz) });
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

/// Aviso de uma sobrescrita órfã (fase 2, §4.4 passo 5). A posição (`medido` = s, `limite` = z, em m) é a aproximada, e `p` o ponto no mundo.
fn aviso_orfao(g: &Geom, o: &Orfao) -> AvisoC {
    let p = g.mundo(o.s, 0.0, o.z);
    match o.alvo {
        Alvo::Celula { i, j } => AvisoC { codigo: AVISO_CORTINA_OVERRIDE_ORFAO_CELULA, i, j, medido: o.s, limite: o.z, p },
        Alvo::Linha { eixo, indice } => {
            let (i, j) = if eixo == EIXO_U { (indice, ID_AUSENTE) } else { (ID_AUSENTE, indice) };
            AvisoC { codigo: AVISO_CORTINA_OVERRIDE_ORFAO_LINHA, i, j, medido: o.s, limite: o.z, p }
        }
        Alvo::Segmento { linha, k, .. } => AvisoC { codigo: AVISO_CORTINA_OVERRIDE_ORFAO_SEGMENTO, i: linha, j: k, medido: o.s, limite: o.z, p },
    }
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
    pub(crate) const M_L: u32 = 3; // L 80 × 120 mm, abas de 10 mm (face interna, como o TS)
    pub(crate) const M_R12: u32 = 4; // retangular 50 × 120 mm (profundidade do sistema)
    pub(crate) const M_TRAP: u32 = 5; // trapézio 80 / 40 × 120 mm
    pub(crate) const M_CANTO: u32 = 6; // canto: tubo de chapa 60 × 120 mm, chapa de 4 mm
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
        s.montantes.insert(M_L, MontanteTipoLinha { forma: FORMA_L, largura: 0.08, profundidade: 0.12, espessura: 0.01, largura2: 0.0, deslocamento: 0.0, posicao: 0, material: 13 });
        s.montantes.insert(M_R12, MontanteTipoLinha { forma: FORMA_RETANGULAR, largura: 0.05, profundidade: 0.12, espessura: 0.0, largura2: 0.0, deslocamento: 0.0, posicao: 0, material: 11 });
        s.montantes.insert(M_TRAP, MontanteTipoLinha { forma: FORMA_TRAPEZIO, largura: 0.08, profundidade: 0.12, espessura: 0.0, largura2: 0.04, deslocamento: 0.0, posicao: 0, material: 14 });
        s.montantes.insert(M_CANTO, MontanteTipoLinha { forma: FORMA_CORNER, largura: 0.06, profundidade: 0.12, espessura: 0.004, largura2: 0.0, deslocamento: 0.0, posicao: 0, material: 15 });
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
        assert_eq!(g.celulas[0], Celula { i: 0, j: 0, s0: 0.0, s1: 1.5, z0: 0.0, z1: 1.0, painel: P_VIDRO, flags: 0, regiao: 0 });
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
        assert_eq!(resolver(&c, 0).err(), Some(ENTRADA), "L sem espessura da aba");
        let mut c = cena_simples(&e, 4.0, 3.0);
        c.cortina.montantes.get_mut(&M_RET).expect("m").forma = 5;
        assert_eq!(resolver(&c, 0).err(), Some(ENTRADA), "forma fora do domínio");
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

/// Testes da fase 2 (sobrescritas): a resolução ponta a ponta com regiões, linhas extras e travadas, montantes por linha e órfãs (ADR 0056 §4.4, §5.2).
#[cfg(test)]
mod testes_f2 {
    use super::*;
    use crate::cortina_pecas::testes::*;
    use crate::secoes_cortina::*;

    fn resolve(c: &Cena) -> CortinaR {
        resolver(c, 0).expect("resolver").remove(0)
    }

    fn igual(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-9, "{a} != {b}");
    }

    /// Segmento removido da cortina 1 na grade gerada de `n` células (linha `linha` do eixo, segmento `k` de `nk`).
    fn remover(c: &mut Cena, id: u32, eixo: u8, linha: u32, n: u32, k: u32, nk: u32) {
        let mid = (k as f64 + 0.5) / nk as f64;
        c.cortina.segmentos_removidos.insert(id, SegmentoRemovidoLinha { cortina: 1, eixo, extra: false, linha, pos_norm: linha as f64 / n as f64, n, k, nk, mid });
    }

    fn painel_sobre(c: &mut Cena, id: u32, i: u32, j: u32, nu: u32, nv: u32, painel: u32) {
        let (s, z) = ((i as f64 + 0.5) / nu as f64, (j as f64 + 0.5) / nv as f64);
        c.cortina.celulas_sobrescritas.insert(id, CelulaSobrescritaLinha { cortina: 1, i, j, s, z, nu, nv, painel });
    }

    #[test]
    fn remover_um_segmento_funde_as_duas_celulas_num_painel_so_e_tira_o_montante_entre_elas() {
        // Duas colunas (linha U 1 no meio) e uma fileira. Sem remoção: 2 painéis.
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 4.0, 3.0);
        assert_eq!(resolve(&c).g.expect("g").paineis.len(), 2);
        remover(&mut c, 1, EIXO_U, 1, 2, 0, 1);
        let g = resolve(&c).g.expect("g");
        assert_eq!(g.paineis.len(), 1, "uma região só");
        let p = g.paineis[0];
        assert_eq!((p.i, p.j), (0, 0), "o CellKey canônico é a célula de menor (j, i)");
        // Livre: de 0,05 (borda de início) a 3,95 (borda de fim) por 0,05 a 2,95.
        igual(p.s0, 0.05);
        igual(p.s1, 3.95);
        igual(p.z1 - p.z0, 2.9);
        assert!(g.celulas.iter().all(|x| x.regiao == 0), "as duas células apontam para a região");
        let seg = g.segmentos.iter().find(|s| s.eixo == EIXO_U && s.linha == 1 && s.k == 0).expect("segmento");
        assert!(seg.removido);
        assert_eq!(seg.montante, ID_AUSENTE);
        assert!(g.pecas.iter().all(|x| !(x.eixo == EIXO_U && x.linha == 1)), "sem peça na linha removida");
    }

    #[test]
    fn remocao_que_deixa_regiao_em_l_e_recusada_com_aviso_10_e_o_segmento_continua() {
        // Grade 2 x 2: remover U1 seg 0 (une (0,0)+(1,0)) vale; V1 seg 1 (une (1,0)+(1,1)) faria um L e é recusada.
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        let mut c = cena_simples(&e, 4.0, 4.0);
        remover(&mut c, 1, EIXO_U, 1, 2, 0, 2);
        remover(&mut c, 2, EIXO_V, 1, 2, 1, 2);
        let r = resolve(&c);
        let g = r.g.as_ref().expect("g");
        assert_eq!(g.paineis.len(), 3, "a região 2 x 1 da esquerda, (0,1) e (1,1)");
        let recusa: Vec<&AvisoC> = r.avisos.iter().filter(|a| a.codigo == AVISO_CORTINA_CELULA_NAO_RETANGULAR).collect();
        assert_eq!(recusa.len(), 1);
        assert_eq!((recusa[0].i, recusa[0].j), (1, 0));
        igual(recusa[0].medido, 3.0);
        igual(recusa[0].limite, 4.0);
        // A remoção recusada não tira o montante do segmento V1 seg 1.
        let seg = g.segmentos.iter().find(|s| s.eixo == EIXO_V && s.linha == 1 && s.k == 1).expect("segmento");
        assert!(!seg.removido);
        assert_ne!(seg.montante, ID_AUSENTE);
    }

    #[test]
    fn sobrescrita_de_painel_numa_regiao_vale_para_a_regiao_inteira() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 4.0, 3.0);
        remover(&mut c, 1, EIXO_U, 1, 2, 0, 1);
        // Sobrescrita na célula (1,0), a da direita da região: a região inteira vira sólida.
        painel_sobre(&mut c, 5, 1, 0, 2, 1, P_SOLIDO);
        let g = resolve(&c).g.expect("g");
        assert_eq!(g.paineis.len(), 1);
        assert_eq!(g.paineis[0].p.kind, PAINEL_SOLIDO);
        assert!(g.celulas.iter().all(|x| x.painel == P_SOLIDO));
    }

    #[test]
    fn sobrescrita_de_celula_com_mesma_topologia_adota_o_indice_e_a_duplicada_vira_aviso_7() {
        let e = Espec::novo(EixoEfetivo::numero(3), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 6.0, 3.0);
        // Duas sobrescritas na célula (0,0): a 6 (ponto a 1,02 m, a 0,02 do centro) vence a 5 (ponto a 0,6 m, a 0,4 do centro), que vira órfã.
        c.cortina.celulas_sobrescritas.insert(5, CelulaSobrescritaLinha { cortina: 1, i: 0, j: 0, s: 0.1, z: 0.5, nu: 3, nv: 1, painel: P_SOLIDO });
        c.cortina.celulas_sobrescritas.insert(6, CelulaSobrescritaLinha { cortina: 1, i: 0, j: 0, s: 0.17, z: 0.5, nu: 3, nv: 1, painel: P_VAZIO });
        let r = resolve(&c);
        let g = r.g.expect("g");
        let p0 = g.paineis.iter().find(|p| (p.i, p.j) == (0, 0)).expect("p");
        assert_eq!(p0.p.kind, PAINEL_VAZIO);
        let orfaos: Vec<&AvisoC> = r.avisos.iter().filter(|a| a.codigo == AVISO_CORTINA_OVERRIDE_ORFAO_CELULA).collect();
        assert_eq!(orfaos.len(), 1);
        assert_eq!((orfaos[0].i, orfaos[0].j), (0, 0));
    }

    #[test]
    fn linha_extra_travada_fora_do_vao_vira_aviso_8_e_nao_entra_na_grade() {
        let e = Espec::novo(EixoEfetivo::numero(1), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 4.0, 3.0);
        c.cortina.extras.insert(7, LinhaExtraLinha { cortina: 1, eixo: EIXO_U, pos: 5.0, travada: true, comp: 4.0, montante: ID_AUSENTE });
        let r = resolve(&c);
        assert_eq!(r.g.as_ref().expect("g").us.len(), 2, "sem interior");
        let a: Vec<&AvisoC> = r.avisos.iter().filter(|x| x.codigo == AVISO_CORTINA_OVERRIDE_ORFAO_LINHA).collect();
        assert_eq!(a.len(), 1);
        assert_eq!((a[0].i, a[0].j), (7, ID_AUSENTE), "a extra leva o id no lugar do índice");
    }

    #[test]
    fn linha_extra_destravada_acompanha_o_comprimento_e_pode_ter_montante_proprio() {
        let e = Espec::novo(EixoEfetivo::numero(1), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 4.0, 3.0);
        c.cortina.extras.insert(7, LinhaExtraLinha { cortina: 1, eixo: EIXO_U, pos: 2.0, travada: false, comp: 4.0, montante: M_RED });
        let g = resolve(&c).g.expect("g");
        igual(g.us[1], 2.0);
        assert_eq!(g.mont_u[1].expect("montante próprio").forma, FORMA_REDONDA);
        assert_eq!(g.origem_u[1], ORIGEM_EXTRA);
        // Parede esticada para 8 m: a linha fica na mesma fração, em 4 m.
        let c = com_cortina(c, 1, 8.0, 3.0);
        igual(resolve(&c).g.expect("g").us[1], 4.0);
        // Travada não acompanha: fica em 2 m.
        let mut t = c;
        t.cortina.extras.get_mut(&7).expect("extra").travada = true;
        igual(resolve(&t).g.expect("g").us[1], 2.0);
    }

    #[test]
    fn linha_gerada_sobrescrita_e_movida_e_sem_montante() {
        let e = Espec::novo(EixoEfetivo::numero(3), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 6.0, 3.0);
        // Linha 1 (gerada em 2,0): movida para 2,5 m, travada. Linha 2 (em 4,0): sem montante.
        c.cortina.linhas_sobrescritas.insert(20, LinhaSobrescritaLinha { cortina: 1, eixo: EIXO_U, linha: 1, pos_norm: 1.0 / 3.0, n: 3, travada: true, pos: 2.5, comp: 6.0, modo: 0, montante: 0 });
        c.cortina.linhas_sobrescritas.insert(21, LinhaSobrescritaLinha { cortina: 1, eixo: EIXO_U, linha: 2, pos_norm: 2.0 / 3.0, n: 3, travada: false, pos: f64::NAN, comp: 6.0, modo: 1, montante: 0 });
        let g = resolve(&c).g.expect("g");
        igual(g.us[1], 2.5);
        igual(g.us[2], 4.0);
        assert_eq!(g.mont_u[2], None);
        assert!(g.pecas.iter().all(|p| !(p.eixo == EIXO_U && p.linha == 2)), "sem peça na linha sem montante");
        assert!(g.pecas.iter().any(|p| p.eixo == EIXO_U && p.linha == 1), "a linha 1 continua com montante");
    }

    #[test]
    fn sobrescritas_de_uma_cortina_nao_vazam_para_outra() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 4.0, 3.0);
        c = com_cortina(c, 2, 4.0, 3.0);
        remover(&mut c, 1, EIXO_U, 1, 2, 0, 1);
        let rs = resolver(&c, 0).expect("r");
        let (a, b) = (rs[0].g.as_ref().expect("1"), rs[1].g.as_ref().expect("2"));
        assert_eq!(a.paineis.len(), 1, "a cortina 1 tem o segmento removido");
        assert_eq!(b.paineis.len(), 2, "a cortina 2 não tem");
    }

    #[test]
    fn remocao_de_borda_vale_so_sem_montante_e_referencia_quebrada_e_entrada() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let mut c = cena_simples(&e, 4.0, 3.0);
        remover(&mut c, 1, EIXO_U, 0, 2, 0, 1);
        let g = resolver(&c, 0).expect("borda removida").remove(0).g.expect("g");
        let seg = g.segmentos.iter().find(|s| s.eixo == EIXO_U && s.linha == 0).expect("segmento");
        assert!(seg.removido && seg.montante == ID_AUSENTE, "a borda sem montante");
        assert_eq!(g.paineis.len(), 2, "remover a borda não funde células");
        assert!(g.pecas.iter().all(|p| !(p.eixo == EIXO_U && p.linha == 0)), "sem peça na borda removida");
        let mut c = cena_simples(&e, 4.0, 3.0);
        c.cortina.extras.insert(3, LinhaExtraLinha { cortina: 1, eixo: EIXO_U, pos: 1.0, travada: true, comp: 4.0, montante: 99 });
        assert_eq!(resolver(&c, 0).err(), Some(ENTRADA), "montante da extra inexistente");
    }
}

#[cfg(test)]
mod testes_f3 {
    use super::testes::*;
    use super::*;
    use crate::cortina_malha::{secao, solido, volume_malha};
    use std::collections::HashMap;

    fn igual(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-9, "{a} != {b}");
    }

    /// Malha fechada e orientada (cada aresta orientada aparece uma vez, e a inversa também), com soldagem a 1 µm.
    fn fechada(v: &[[f64; 3]], t: &[[u32; 3]]) -> bool {
        let q = |x: f64| (x * 1e6).round() as i64;
        let mut ids: HashMap<[i64; 3], u32> = HashMap::new();
        let id: Vec<u32> = v
            .iter()
            .map(|p| {
                let n = ids.len() as u32;
                *ids.entry([q(p[0]), q(p[1]), q(p[2])]).or_insert(n)
            })
            .collect();
        let mut dir: HashMap<(u32, u32), u32> = HashMap::new();
        for t in t {
            for k in 0..3 {
                *dir.entry((id[t[k] as usize], id[t[(k + 1) % 3] as usize])).or_insert(0) += 1;
            }
        }
        dir.iter().all(|(&(a, b), &n)| n == 1 && dir.get(&(b, a)) == Some(&1))
    }

    /// Cortina de 2 m × 2 m em grade 2 × 2, com a ordem de montantes `mont` (int_v, int_h, borda_ini, borda_fim, borda_base, borda_topo).
    fn cortina_2x2(mont: [u32; 6], prioridade: u8) -> Geom {
        let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        e.mont = mont;
        e.prioridade = prioridade;
        resolver(&cena_simples(&e, 2.0, 2.0), 0).expect("r").remove(0).g.expect("g")
    }

    fn vertical(g: &Geom, linha: u32, k: u32) -> &PecaMont {
        g.pecas.iter().find(|p| p.eixo == EIXO_U && p.linha == linha && p.k == k).expect("vertical")
    }

    fn horizontal(g: &Geom, linha: u32, k: u32) -> &PecaMont {
        g.pecas.iter().find(|p| p.eixo == EIXO_V && p.linha == linha && p.k == k).expect("horizontal")
    }

    #[test]
    fn perfis_novos_validam_como_o_modelo_e_devolvem_entrada() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        // Cena: M_RET com largura 0,05 e profundidade 0,10. L: espessura < 0,05; canto: 2t < 0,05; trapézio: face interna > 0.
        let com = |forma: u8, esp: f64, wb: f64| {
            let mut c = cena_simples(&e, 4.0, 3.0);
            let m = c.cortina.montantes.get_mut(&M_RET).expect("m");
            m.forma = forma;
            m.espessura = esp;
            m.largura2 = wb;
            resolver(&c, 0).map(|_| ())
        };
        assert_eq!(com(FORMA_L, 0.05, 0.0).err(), Some(ENTRADA), "L com t = min(w, d)");
        assert_eq!(com(FORMA_L, 0.0, 0.0).err(), Some(ENTRADA), "L sem espessura");
        assert!(com(FORMA_L, 0.04, 0.0).is_ok(), "L válido");
        assert_eq!(com(FORMA_CORNER, 0.025, 0.0).err(), Some(ENTRADA), "canto com 2t = min(w, d)");
        assert!(com(FORMA_CORNER, 0.02, 0.0).is_ok(), "canto válido");
        assert_eq!(com(FORMA_TRAPEZIO, 0.0, 0.0).err(), Some(ENTRADA), "trapézio sem face interna");
        assert!(com(FORMA_TRAPEZIO, 0.0, 0.03).is_ok(), "trapézio válido");
    }

    #[test]
    fn quatro_intersecoes_com_prioridade_vertical_e_horizontal() {
        // Grade 2 × 2 de 2 m: cu = [0,025; 1; 1,975] e cv iguais. Com prioridade vertical, as verticais (de borda e interiores) correm de 0 a 2 m e as
        // horizontais param na face de cada vertical: borda/borda (0,0), borda/interior (linha 1 com a vertical de borda), interior/borda (linha 0 com a
        // interior) e cruz (1,1).
        let g = cortina_2x2([M_RET; 6], PRIORIDADE_VERTICAL);
        for p in g.pecas.iter().filter(|p| p.eixo == EIXO_U) {
            // Contínua por segmento: o segmento k vai de k a k + 1 metro, de ponta a ponta.
            igual(p.de, p.k as f64);
            igual(p.ate, p.k as f64 + 1.0);
            assert!(p.continuo);
        }
        igual(horizontal(&g, 0, 0).de, 0.05); // borda/borda: a face da vertical de borda (0,025 + 0,025)
        igual(horizontal(&g, 1, 0).de, 0.05); // borda/interior
        igual(horizontal(&g, 0, 0).ate, 0.975); // interior/borda: a face da vertical interior (1 − 0,025)
        igual(horizontal(&g, 1, 0).ate, 0.975); // cruz (horizontal interior com vertical interior)
        igual(horizontal(&g, 1, 1).de, 1.025);
        igual(horizontal(&g, 1, 1).ate, 1.95);
        for p in g.pecas.iter().filter(|p| p.eixo == EIXO_V) {
            assert!(!p.continuo);
        }
        // Com prioridade horizontal, as horizontais correm inteiras e as verticais param nas faces delas.
        let g = cortina_2x2([M_RET; 6], PRIORIDADE_HORIZONTAL);
        for p in g.pecas.iter().filter(|p| p.eixo == EIXO_V) {
            igual(p.de, p.k as f64);
            igual(p.ate, p.k as f64 + 1.0);
            assert!(p.continuo);
        }
        igual(vertical(&g, 0, 0).de, 0.05); // borda/borda: a face da horizontal de base (0,025 + 0,025)
        igual(vertical(&g, 1, 0).de, 0.05); // interior/borda
        igual(vertical(&g, 0, 0).ate, 0.975);
        igual(vertical(&g, 1, 0).ate, 0.975); // cruz
        igual(vertical(&g, 1, 1).de, 1.025);
        igual(vertical(&g, 1, 1).ate, 1.95);
        assert_eq!(g.pecas.len(), 12, "3 linhas × 2 segmentos nos dois eixos, sem remoção");
        assert!(g.pecas_esq.is_empty(), "retângulos não geram esquadria");
    }

    #[test]
    fn borda_horizontal_contra_l_continuo_tem_esquadria_com_volume_analitico() {
        // Interior vertical em L (aba na face interna, y ∈ [−0,06; −0,05]). As horizontais à direita dele encostam na envoltória:
        // lo(y) = 1,04 na aba e 0,97 na alma; hi = 1,95 (borda de fim, plana). Volume = 0,05·[0,01·(1,95 − 1,04) + 0,11·(1,95 − 0,97)].
        let g = cortina_2x2([M_L, M_R12, M_R12, M_R12, M_R12, M_R12], PRIORIDADE_VERTICAL);
        let mitradas: Vec<&PecaEsq> = g.pecas_esq.iter().filter(|p| p.eixo == EIXO_V && p.k == 1).collect();
        // Base, interior (linha 1) e topo: as três horizontais que saem do L pela direita.
        assert_eq!(mitradas.len(), 3, "uma por linha horizontal que encosta no L");
        let esperado = 0.05 * (0.01 * (1.95 - 1.04) + 0.11 * (1.95 - 0.97));
        for p in &mitradas {
            let tris = solido(&secao(&p.m, 2), &p.lo, &p.hi);
            let vol = volume_malha(&tris);
            assert!((vol - esperado).abs() < 1e-9, "linha {}: {vol} vs {esperado}", p.linha);
            let v: Vec<[f64; 3]> = tris.iter().flat_map(|t| t.iter().copied()).collect();
            let t: Vec<[u32; 3]> = (0..tris.len() as u32).map(|k| [3 * k, 3 * k + 1, 3 * k + 2]).collect();
            assert!(fechada(&v, &t), "esquadria aberta na linha {}", p.linha);
        }
        // A horizontal da base de 0 a 0,96 encosta no L pela esquerda, onde o mínimo de x é −0,04 em toda profundidade: é prisma.
        igual(horizontal(&g, 0, 0).ate, 0.96);
    }

    #[test]
    fn borda_contra_trapezio_continuo_tem_esquadria_linear_com_volume_analitico() {
        // Trapézio contínuo: a envoltória à direita é a semilargura, linear de wb/2 (y = −0,06) a w/2 (y = +0,06). Volume de uma horizontal 50 × 120 de 1,0
        // a 1,95: h · [(1,95 − 1,0)·d − d·(w + wb)/4] = 0,05 · [0,95·0,12 − 0,12·0,03].
        let g = cortina_2x2([M_TRAP, M_R12, M_R12, M_R12, M_R12, M_R12], PRIORIDADE_VERTICAL);
        let mitradas: Vec<&PecaEsq> = g.pecas_esq.iter().filter(|p| p.eixo == EIXO_V && p.k == 1).collect();
        assert_eq!(mitradas.len(), 3);
        let esperado = 0.05 * (0.95 * 0.12 - 0.12 * 0.03);
        for p in &mitradas {
            let vol = volume_malha(&solido(&secao(&p.m, 2), &p.lo, &p.hi));
            assert!((vol - esperado).abs() < 1e-9, "{vol} vs {esperado}");
        }
    }

    #[test]
    fn canto_contra_horizontal_nao_gera_esquadria() {
        // O canto é um tubo com a mesma face externa em todas as profundidades: a envoltória é constante e a peça é prisma.
        let g = cortina_2x2([M_CANTO, M_R12, M_R12, M_R12, M_R12, M_R12], PRIORIDADE_VERTICAL);
        assert!(g.pecas_esq.is_empty());
        igual(horizontal(&g, 0, 1).de, 1.03); // a face do canto de 60 mm: 1 + 0,03
    }

    #[test]
    fn invertida_nao_muda_o_volume_de_perfil_simetrico() {
        // A invertida gira cada perfil 180° no próprio eixo (a mesma peça vista do outro lado). Perfil simétrico em x (trapézio, canto, retângulo) dá o
        // mesmo volume total; o L não é simétrico e muda o lado da alma em relação às horizontais (convenção a confirmar com o dono).
        let vol = |inv: bool, prio: u8| {
            let mut e = Espec::novo(EixoEfetivo::numero(3), EixoEfetivo::numero(2));
            e.mont = [M_TRAP, M_R12, M_CANTO, M_CANTO, M_TRAP, M_R12];
            e.prioridade = prio;
            let mut c = cena_simples(&e, 3.0, 2.0);
            c.cortina.cortinas.get_mut(&1).expect("c").invertida = inv;
            let g = resolver(&c, 0).expect("r").remove(0).g.expect("g");
            let pr: f64 = g.pecas.iter().map(|p| p.comprimento() * p.m.area_secao()).sum();
            let esq: f64 = g.pecas_esq.iter().map(|p| volume_malha(&solido(&secao(&p.m, 2), &p.lo, &p.hi))).sum();
            pr + esq
        };
        for prio in [PRIORIDADE_VERTICAL, PRIORIDADE_HORIZONTAL] {
            let (a, b) = (vol(false, prio), vol(true, prio));
            assert!((a - b).abs() < 1e-9, "prioridade {prio}: {a} vs {b}");
        }
        // Convenção do L invertido: a alma passa para o lado de t mínimo. A horizontal da direita (k = 1) deixa de ter esquadria e a da esquerda (k = 0) ganha.
        let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        e.mont = [M_L, M_R12, M_R12, M_R12, M_R12, M_R12];
        let mut c = cena_simples(&e, 2.0, 2.0);
        c.cortina.cortinas.get_mut(&1).expect("c").invertida = true;
        let g = resolver(&c, 0).expect("r").remove(0).g.expect("g");
        assert!(g.pecas_esq.iter().all(|p| p.k == 0), "só a esquerda ganha esquadria");
        assert_eq!(g.pecas_esq.len(), 3);
    }
}
