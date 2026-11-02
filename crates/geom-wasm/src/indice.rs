//! Índice espacial por grade uniforme (decisão 0046, Fase 0).
//!
//! Um `Indice` cobre um conjunto de caixas (as paredes de um nível, em ordem crescente de id) e
//! responde "quais caixas cruzam esta caixa" sem varrer tudo.
//!
//! - **Tamanho da célula**: mediana de `max(largura, altura)` das caixas, nunca menor que
//!   `extensão_total / 4095` (a grade tem no máximo 4096 x 4096 células) nem que 1e-6.
//! - **Armazenamento**: lista ordenada `(chave_da_célula, índice_do_item)`, com
//!   `chave = (linha << 32) | coluna`. Uma consulta faz uma busca binária por linha de células.
//! - **Caixas grandes**: item que cobriria mais de [`MAX_CELULAS_POR_ITEM`] células não entra na
//!   grade; fica numa lista `grandes` que toda consulta inclui (evita explosão de memória).
//! - **Determinismo**: nenhuma estrutura de hash; ordenações com chave total; os resultados saem
//!   ordenados por índice do item (= id crescente) e sem duplicatas.
//! - **Exatidão**: a grade só gera candidatos; todo resultado passa pelo teste exato de cruzamento
//!   (fronteira inclusiva). Como `floor` é monótono, quem cruza a consulta sempre divide uma
//!   célula com ela, então nenhum acerto é perdido.

/// Caixa alinhada aos eixos.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Caixa {
    pub minx: f64,
    pub miny: f64,
    pub maxx: f64,
    pub maxy: f64,
}

impl Caixa {
    /// Cruzamento com fronteira inclusiva (caixas que apenas se tocam contam).
    #[inline]
    pub fn cruza(&self, o: &Caixa) -> bool {
        self.minx <= o.maxx && o.minx <= self.maxx && self.miny <= o.maxy && o.miny <= self.maxy
    }

    pub fn expandida(&self, d: f64) -> Caixa {
        Caixa { minx: self.minx - d, miny: self.miny - d, maxx: self.maxx + d, maxy: self.maxy + d }
    }
}

/// Itens que cobririam mais células que isso vão para a lista `grandes`.
pub const MAX_CELULAS_POR_ITEM: u64 = 64;
/// Máximo de células por eixo.
const MAX_CELULAS_POR_EIXO: f64 = 4096.0;

pub struct Indice {
    caixas: Vec<Caixa>,
    ox: f64,
    oy: f64,
    celula: f64,
    ncx: i64,
    ncy: i64,
    /// maior |coordenada| (para folgas relativas)
    escala: f64,
    /// `(chave, item)` ordenado.
    entradas: Vec<(u64, u32)>,
    grandes: Vec<u32>,
}

impl Indice {
    /// Constrói o índice sobre `caixas` (a posição na lista é o "item" devolvido nas consultas).
    /// Todas as coordenadas devem ser finitas (a cena garante).
    pub fn construir(caixas: Vec<Caixa>) -> Indice {
        let n = caixas.len();
        let mut ix = Indice {
            caixas,
            ox: 0.0,
            oy: 0.0,
            celula: 1.0,
            ncx: 1,
            ncy: 1,
            escala: 0.0,
            entradas: Vec::new(),
            grandes: Vec::new(),
        };
        if n == 0 {
            return ix;
        }
        let (mut minx, mut miny, mut maxx, mut maxy) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
        let mut tamanhos: Vec<f64> = Vec::with_capacity(n);
        for c in &ix.caixas {
            minx = minx.min(c.minx);
            miny = miny.min(c.miny);
            maxx = maxx.max(c.maxx);
            maxy = maxy.max(c.maxy);
            tamanhos.push((c.maxx - c.minx).max(c.maxy - c.miny));
        }
        tamanhos.sort_by(|a, b| a.total_cmp(b));
        let mediana = tamanhos[n / 2];
        let extensao = (maxx - minx).max(maxy - miny);
        let celula = mediana.max(extensao / (MAX_CELULAS_POR_EIXO - 1.0)).max(1e-6);
        ix.ox = minx;
        ix.oy = miny;
        ix.celula = celula;
        ix.escala = minx.abs().max(miny.abs()).max(maxx.abs()).max(maxy.abs());
        ix.ncx = (((maxx - minx) / celula).floor() as i64).clamp(0, MAX_CELULAS_POR_EIXO as i64) + 1;
        ix.ncy = (((maxy - miny) / celula).floor() as i64).clamp(0, MAX_CELULAS_POR_EIXO as i64) + 1;

        let mut entradas: Vec<(u64, u32)> = Vec::new();
        for i in 0..n {
            let c = ix.caixas[i];
            let (cx0, cx1) = (ix.celula_x(c.minx), ix.celula_x(c.maxx));
            let (cy0, cy1) = (ix.celula_y(c.miny), ix.celula_y(c.maxy));
            let total = ((cx1 - cx0 + 1) as u64) * ((cy1 - cy0 + 1) as u64);
            if total > MAX_CELULAS_POR_ITEM {
                ix.grandes.push(i as u32);
                continue;
            }
            for cy in cy0..=cy1 {
                for cx in cx0..=cx1 {
                    entradas.push((chave(cx, cy), i as u32));
                }
            }
        }
        entradas.sort_unstable();
        ix.entradas = entradas;
        ix
    }

    pub fn len(&self) -> usize {
        self.caixas.len()
    }

    pub fn is_empty(&self) -> bool {
        self.caixas.is_empty()
    }

    pub fn caixa(&self, i: usize) -> Option<&Caixa> {
        self.caixas.get(i)
    }

    /// Maior |coordenada| entre as caixas.
    pub fn escala(&self) -> f64 {
        self.escala
    }

    #[inline]
    fn celula_x(&self, x: f64) -> i64 {
        let v = ((x - self.ox) / self.celula).floor();
        // `as i64` satura (e NaN vira 0); depois limita à grade.
        (v as i64).clamp(0, self.ncx - 1)
    }

    #[inline]
    fn celula_y(&self, y: f64) -> i64 {
        let v = ((y - self.oy) / self.celula).floor();
        (v as i64).clamp(0, self.ncy - 1)
    }

    /// Itens cuja caixa cruza `q` (fronteira inclusiva), em ordem crescente de item, sem duplicatas.
    pub fn buscar(&self, q: &Caixa, saida: &mut Vec<u32>) {
        saida.clear();
        if self.caixas.is_empty() || q.minx > q.maxx || q.miny > q.maxy {
            return;
        }
        let (cx0, cx1) = (self.celula_x(q.minx), self.celula_x(q.maxx));
        let (cy0, cy1) = (self.celula_y(q.miny), self.celula_y(q.maxy));
        let linhas = (cy1 - cy0 + 1) as u64;
        let colunas = (cx1 - cx0 + 1) as u64;
        if linhas.saturating_mul(colunas) > self.entradas.len() as u64 + self.grandes.len() as u64 {
            // consulta cobre quase a grade inteira: varrer tudo é mais barato
            for (i, c) in self.caixas.iter().enumerate() {
                if c.cruza(q) {
                    saida.push(i as u32);
                }
            }
            return;
        }
        for cy in cy0..=cy1 {
            let de = chave(cx0, cy);
            let ate = chave(cx1, cy);
            let ini = self.entradas.partition_point(|&(k, _)| k < de);
            for &(k, item) in &self.entradas[ini..] {
                if k > ate {
                    break;
                }
                saida.push(item);
            }
        }
        saida.extend_from_slice(&self.grandes);
        saida.sort_unstable();
        saida.dedup();
        saida.retain(|&i| self.caixas.get(i as usize).is_some_and(|c| c.cruza(q)));
    }
}

#[inline]
fn chave(cx: i64, cy: i64) -> u64 {
    ((cy as u64) << 32) | (cx as u64)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::teste_util::Xorshift;

    fn caixa_aleatoria(r: &mut Xorshift, lado: f64, espaco: f64) -> Caixa {
        let x = r.intervalo(0.0, espaco);
        let y = r.intervalo(0.0, espaco);
        let w = r.intervalo(0.0, lado);
        let h = r.intervalo(0.0, lado);
        Caixa { minx: x, miny: y, maxx: x + w, maxy: y + h }
    }

    fn forca_bruta(caixas: &[Caixa], q: &Caixa) -> Vec<u32> {
        (0..caixas.len() as u32).filter(|&i| caixas[i as usize].cruza(q)).collect()
    }

    #[test]
    fn vazio_nao_devolve_nada() {
        let ix = Indice::construir(vec![]);
        let mut s = vec![1];
        ix.buscar(&Caixa { minx: -1.0, miny: -1.0, maxx: 1.0, maxy: 1.0 }, &mut s);
        assert!(s.is_empty());
    }

    #[test]
    fn fronteira_e_inclusiva() {
        let ix = Indice::construir(vec![Caixa { minx: 0.0, miny: 0.0, maxx: 1.0, maxy: 1.0 }]);
        let mut s = Vec::new();
        ix.buscar(&Caixa { minx: 1.0, miny: 1.0, maxx: 2.0, maxy: 2.0 }, &mut s);
        assert_eq!(s, vec![0]);
        ix.buscar(&Caixa { minx: 1.0000001, miny: 0.0, maxx: 2.0, maxy: 2.0 }, &mut s);
        assert!(s.is_empty());
    }

    #[test]
    fn busca_igual_a_forca_bruta_aleatoria() {
        let mut r = Xorshift::novo(12345);
        for rodada in 0..40 {
            let n = 1 + (r.proximo() % 400) as usize;
            let lado = [0.0, 0.3, 3.0, 40.0][rodada % 4];
            let caixas: Vec<Caixa> = (0..n).map(|_| caixa_aleatoria(&mut r, lado, 100.0)).collect();
            let ix = Indice::construir(caixas.clone());
            let mut s = Vec::new();
            for _ in 0..60 {
                let q = caixa_aleatoria(&mut r, 30.0, 120.0);
                ix.buscar(&q, &mut s);
                assert_eq!(s, forca_bruta(&caixas, &q));
            }
            // consulta fora da cena e consulta gigante
            let fora = Caixa { minx: 1e6, miny: 1e6, maxx: 1e6 + 1.0, maxy: 1e6 + 1.0 };
            ix.buscar(&fora, &mut s);
            assert_eq!(s, forca_bruta(&caixas, &fora));
            let tudo = Caixa { minx: -1e9, miny: -1e9, maxx: 1e9, maxy: 1e9 };
            ix.buscar(&tudo, &mut s);
            assert_eq!(s.len(), n);
        }
    }

    #[test]
    fn caixas_grandes_e_degeneradas() {
        let mut caixas = vec![Caixa { minx: 0.0, miny: 0.0, maxx: 1000.0, maxy: 1000.0 }];
        for i in 0..50 {
            let x = i as f64;
            caixas.push(Caixa { minx: x, miny: x, maxx: x, maxy: x });
        }
        let ix = Indice::construir(caixas.clone());
        let mut s = Vec::new();
        let q = Caixa { minx: 10.0, miny: 10.0, maxx: 10.0, maxy: 10.0 };
        ix.buscar(&q, &mut s);
        assert_eq!(s, forca_bruta(&caixas, &q));
        // todas iguais (extensão zero)
        let iguais = vec![Caixa { minx: 2.0, miny: 2.0, maxx: 2.0, maxy: 2.0 }; 10];
        let ix2 = Indice::construir(iguais);
        ix2.buscar(&q, &mut s);
        assert!(s.is_empty());
        ix2.buscar(&Caixa { minx: 2.0, miny: 2.0, maxx: 2.0, maxy: 2.0 }, &mut s);
        assert_eq!(s.len(), 10);
    }

    #[test]
    fn coordenadas_enormes_nao_estouram() {
        let caixas = vec![
            Caixa { minx: -1e12, miny: -1e12, maxx: -1e12 + 1.0, maxy: -1e12 + 1.0 },
            Caixa { minx: 1e12, miny: 1e12, maxx: 1e12 + 1.0, maxy: 1e12 + 1.0 },
        ];
        let ix = Indice::construir(caixas.clone());
        let mut s = Vec::new();
        ix.buscar(&caixas[1], &mut s);
        assert_eq!(s, vec![1]);
    }
}
