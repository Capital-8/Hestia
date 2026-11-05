/**
 * Consentimento de cookies e Google Analytics (GA4) no site público.
 *
 * A medição nunca liga sozinha: o Consent Mode v2 começa com tudo negado e o
 * banner só libera `analytics_storage` depois do aceite explícito. Fora de
 * hestiabim.com — casca desktop (Tauri), dev local, testes — nada é carregado,
 * então o app instalado não manda dado nenhum para o Google.
 *
 * O site estático (repo hestia-web) tem a mesma lógica em `consent.js`; esta
 * cópia existe para o snippet sobreviver a um rebuild do app.
 */

const ID_GA = 'G-VRRV93S3QV';
const CHAVE_CONSENT = 'hestia:consent';
const HOSTS = ['www.hestiabim.com', 'hestiabim.com'];

type FuncaoGtag = (...args: unknown[]) => void;

function gtagAtual(): FuncaoGtag | null {
  const g = (window as unknown as { gtag?: FuncaoGtag }).gtag;
  return typeof g === 'function' ? g : null;
}

function lerEscolha(): string | null {
  try {
    return localStorage.getItem(CHAVE_CONSENT);
  } catch {
    return null;
  }
}

function gravarEscolha(valor: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(CHAVE_CONSENT, valor);
  } catch {
    // Modo privado: a escolha vale só para esta sessão.
  }
}

function aplicarEscolha(valor: string): void {
  const gtag = gtagAtual();
  if (!gtag) return;
  gtag('consent', 'update', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: valor === 'granted' ? 'granted' : 'denied',
  });
}

function montarBanner(): void {
  if (document.getElementById('hestia-consent')) return;

  const caixa = document.createElement('div');
  caixa.id = 'hestia-consent';
  caixa.setAttribute('role', 'region');
  caixa.setAttribute('aria-label', 'Preferências de cookies');
  caixa.style.cssText =
    'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;' +
    'max-width:430px;padding:16px 18px;border-radius:14px;' +
    'background:#0e0e11;color:#f4efe6;border:1px solid rgba(244,239,230,.16);' +
    'box-shadow:0 18px 50px rgba(0,0,0,.5);' +
    "font-family:'Inter Tight',system-ui,-apple-system,'Segoe UI',sans-serif;" +
    'font-size:13.5px;line-height:1.5;';

  const titulo = document.createElement('p');
  titulo.textContent = 'Cookies e medição';
  titulo.style.cssText = 'margin:0 0 6px;font-size:13px;font-weight:600;';

  const texto = document.createElement('p');
  texto.textContent =
    'Uso o Google Analytics para saber quantas pessoas usam o Hestia e quais recursos ajudam mais. Nada é medido sem o seu aceite.';
  texto.style.cssText = 'margin:0;color:#b9b2a7;';

  const acoes = document.createElement('div');
  acoes.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;';

  const recusar = document.createElement('button');
  recusar.type = 'button';
  recusar.textContent = 'Recusar';
  recusar.style.cssText =
    'font:inherit;font-size:13px;font-weight:500;padding:9px 16px;' +
    'border-radius:999px;cursor:pointer;background:transparent;color:#e8e2d7;' +
    'border:1px solid rgba(244,239,230,.24);';

  const aceitar = document.createElement('button');
  aceitar.type = 'button';
  aceitar.textContent = 'Aceitar';
  aceitar.style.cssText =
    'font:inherit;font-size:13px;font-weight:500;padding:9px 16px;' +
    'border-radius:999px;cursor:pointer;background:#ff6a3d;color:#14100e;' +
    'border:1px solid #ff6a3d;';

  recusar.addEventListener('click', () => {
    gravarEscolha('denied');
    aplicarEscolha('denied');
    caixa.remove();
  });

  aceitar.addEventListener('click', () => {
    gravarEscolha('granted');
    aplicarEscolha('granted');
    caixa.remove();
  });

  acoes.append(recusar, aceitar);
  caixa.append(titulo, texto, acoes);
  document.body.append(caixa);
}

function iniciar(): void {
  const escolha = lerEscolha();
  if (escolha === 'granted' || escolha === 'denied') {
    aplicarEscolha(escolha);
    return;
  }
  montarBanner();
}

/** Liga o GA4 (com consentimento) quando a página é o site público. */
export function instalarConsentimentoAnalytics(): void {
  if (!HOSTS.includes(location.hostname)) return;
  if (gtagAtual()) return;

  const gtag: FuncaoGtag = (...args) => {
    (window as unknown as { dataLayer: unknown[] }).dataLayer.push(args);
  };
  const janela = window as unknown as { dataLayer?: unknown[]; gtag: FuncaoGtag };
  janela.dataLayer = janela.dataLayer ?? [];
  janela.gtag = gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  });

  if (lerEscolha() === 'granted') {
    gtag('consent', 'update', { analytics_storage: 'granted' });
  }

  gtag('js', new Date());
  gtag('config', ID_GA);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ID_GA}`;
  document.head.append(script);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }

  (window as unknown as { hestiaConsent?: unknown }).hestiaConsent = {
    abrir: montarBanner,
    escolha: lerEscolha,
  };
}
