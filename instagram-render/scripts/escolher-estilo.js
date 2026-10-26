const path = require('path');
const fs = require('fs');

const AJUDA = `Uso: node scripts/escolher-estilo.js <pasta-do-cliente> [--campanha <pasta>]

Monta a tela de escolha de cores e fontes a partir de páginas reais da
campanha (padrão: a pasta mais recente em <cliente>/campanhas/ com html/).
Salva em <campanha>/html/escolher-estilo.html. Abra no navegador, escolha
paleta e fontes, e informe a escolha mostrada no rodapé da página.

Catálogo de paletas e fontes: templates/estilos.json desta skill.`;

function parseArgs(argv) {
  const args = { cliente: null, campanha: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(AJUDA); process.exit(0); }
    if (a === '--campanha' && argv[i + 1]) args.campanha = argv[++i];
    else if (!a.startsWith('--') && !args.cliente) args.cliente = a;
  }
  if (!args.cliente) { console.log(AJUDA); process.exit(1); }
  return args;
}

const ARGS = parseArgs(process.argv);
const { paletteFromCampaign, computeStyle, fontStack } = require('./render.js');

const SKILL_DIR = path.join(__dirname, '..');
const CLIENTE = path.resolve(ARGS.cliente);

function erro(msg) {
  console.error(`\n✗ ERRO: ${msg}\n`);
  process.exit(1);
}

function campanhaMaisRecente() {
  const base = path.join(CLIENTE, 'campanhas');
  if (!fs.existsSync(base)) return null;
  return fs.readdirSync(base)
    .map((d) => path.join(base, d))
    .filter((p) => fs.existsSync(path.join(p, 'html')))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

function lerSlide(arquivo) {
  const html = fs.readFileSync(arquivo, 'utf-8');
  const main = html.match(/<main class="art"[\s\S]*?<\/main>/);
  const style = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!main || !style) return null;
  const attr = (n) => (main[0].match(new RegExp(`data-${n}="([^"]*)"`)) || [])[1];
  return { arquivo: path.basename(arquivo), main: main[0], style: style[1], tema: attr('tema'), papel: attr('papel') };
}

// uma capa escura, uma capa clara e duas páginas internas (clara e escura)
function escolherAmostras(slides) {
  const pega = (fn) => slides.find((s) => fn(s) && !escolhidas.includes(s));
  const escolhidas = [];
  for (const fn of [
    (s) => s.papel === 'capa' && s.tema === 'escuro',
    (s) => s.papel === 'conteudo' && s.tema === 'claro',
    (s) => s.papel === 'conteudo' && s.tema === 'escuro',
    (s) => s.papel === 'capa' && s.tema === 'claro'
  ]) {
    const s = pega(fn);
    if (s) escolhidas.push(s);
  }
  return escolhidas.length ? escolhidas : slides.slice(0, 4);
}

function varsDaPaleta(cores) {
  const res = paletteFromCampaign(cores);
  if (!res) return null;
  const p = res.paleta;
  const out = {};
  for (const tema of ['claro', 'escuro']) {
    const s = computeStyle(p, tema);
    out[tema] = {
      '--cor-primaria': p.primaria,
      '--cor-secundaria': p.secundaria,
      '--cor-accent': p.destaque || p.secundaria,
      '--cor-fundo-claro': p.fundo_claro,
      '--cor-fundo-escuro': p.fundo_escuro,
      '--cor-texto-claro': p.texto_claro,
      '--cor-texto-escuro': p.texto_escuro,
      '--cor-titulo': s.titulo,
      '--cor-apoio': s.apoio,
      '--cor-destaque': s.destaque,
      '--cor-barra': s.barra,
      '--cor-textura': s.textura,
      '--logo-filter': tema === 'claro' ? 'brightness(0) saturate(100%)' : 'none'
    };
  }
  return { vars: out, amostra: [p.fundo_escuro, p.secundaria, p.destaque || p.secundaria, p.fundo_claro, p.texto_suave] };
}

// fotos do cliente, na ordem em que o render as usa
function fotosDoCliente(htmlDir) {
  const exts = ['.jpg', '.jpeg', '.webp'];
  const dirs = ['imagens', 'fundos', ''].map((d) => path.join(CLIENTE, 'assets', d));
  const out = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).sort()) {
      if (exts.includes(path.extname(f).toLowerCase()) && !/logo/i.test(f)) {
        out.push(path.relative(htmlDir, path.join(d, f)).split(path.sep).join('/'));
      }
    }
  }
  return out;
}

const escapeHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function main() {
  const campanha = ARGS.campanha ? path.resolve(ARGS.campanha) : campanhaMaisRecente();
  if (!campanha) erro(`Nenhuma campanha com html/ em ${path.join(CLIENTE, 'campanhas')}. Rode o render antes.`);
  const htmlDir = path.join(campanha, 'html');
  const slides = fs.readdirSync(htmlDir)
    .filter((f) => /\.html$/.test(f) && f !== 'index.html' && f !== 'escolher-estilo.html')
    .sort()
    .map((f) => lerSlide(path.join(htmlDir, f)))
    .filter(Boolean);
  if (!slides.length) erro(`Nenhuma página gerada em ${htmlDir}.`);
  const amostras = escolherAmostras(slides);

  const catalogo = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'templates', 'estilos.json'), 'utf-8'));

  // "atual" = o que está no campaign-data.json do cliente
  let atualCores = null;
  let atualFontes = null;
  const dataFile = path.join(CLIENTE, 'campaign-data.json');
  if (fs.existsSync(dataFile)) {
    const dv = (JSON.parse(fs.readFileSync(dataFile, 'utf-8')).posts || [])[0]?.direcao_visual || {};
    atualCores = dv.paleta?.cores || dv.paleta || null;
    if (dv.tipografia) {
      atualFontes = {
        titulos: dv.tipografia.titulos || dv.tipografia.fonte_titulo,
        corpo: dv.tipografia.corpo || dv.tipografia.fonte_texto || dv.tipografia.fonte_corpo
      };
    }
  }

  const paletas = [];
  if (atualCores) {
    const v = varsDaPaleta(atualCores);
    if (v) paletas.push({ id: 'atual', nome: 'Atual', descricao: 'A paleta usada hoje.', ...v });
  }
  for (const p of catalogo.paletas) {
    const v = varsDaPaleta(p.cores);
    if (v) paletas.push({ id: p.id, nome: p.nome, descricao: p.descricao, ...v });
  }

  const fontes = [];
  if (atualFontes && atualFontes.titulos) {
    fontes.push({ id: 'atual', nome: `Atual (${atualFontes.titulos} + ${atualFontes.corpo})`, descricao: 'As fontes usadas hoje.', ...atualFontes });
  }
  fontes.push(...catalogo.fontes);
  for (const f of fontes) {
    f.vars = { '--fonte-titulo': fontStack(f.titulos, true), '--fonte-corpo': fontStack(f.corpo, false), '--peso-titulo': String(f.peso_titulo || 700) };
  }

  const familias = [...new Set(fontes.flatMap((f) => [f.titulos, f.corpo]).filter(Boolean))];
  const links = familias
    .map((n) => `<link href="https://fonts.googleapis.com/css2?family=${n.replace(/ /g, '+')}:wght@400;500;600;700&display=swap" rel="stylesheet">`)
    .join('\n');

  const fundos = catalogo.fundos || [];
  const alinhamentos = catalogo.alinhamentos || [];
  const fotos = fotosDoCliente(htmlDir);
  const dados = {
    paletas: paletas.map(({ id, nome, vars }) => ({ id, nome, vars })),
    fontes: fontes.map(({ id, nome, vars }) => ({ id, nome, vars })),
    fundos: fundos.map(({ id, nome }) => ({ id, nome })),
    alinhamentos: alinhamentos.map(({ id, nome }) => ({ id, nome })),
    fotos,
    desenhos: ['casa', 'chave', 'documento', 'planta']
  };

  const cartoesSimples = (lista, grupo) => lista.map((o) => `
    <button class="opcao" data-grupo="${grupo}" data-id="${o.id}">
      <strong>${escapeHtml(o.nome)}</strong>
      <small>${escapeHtml(o.descricao)}${o.id === 'foto-capa' && !fotos.length ? ' (sem fotos em assets/: a capa fica lisa)' : ''}</small>
    </button>`).join('');

  const cartoesPaleta = paletas.map((p) => `
    <button class="opcao" data-grupo="paleta" data-id="${p.id}">
      <span class="amostras">${p.amostra.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      <strong>${escapeHtml(p.nome)}</strong>
      <small>${escapeHtml(p.descricao)}</small>
    </button>`).join('');

  const cartoesFonte = fontes.map((f) => `
    <button class="opcao" data-grupo="fonte" data-id="${f.id}">
      <span class="aa" style="font-family:${escapeHtml(f.vars['--fonte-titulo'])};font-weight:${f.vars['--peso-titulo']}">Matrícula</span>
      <span class="corpo" style="font-family:${escapeHtml(f.vars['--fonte-corpo'])}">O registro do título no cartório.</span>
      <strong>${escapeHtml(f.nome)}</strong>
      <small>${escapeHtml(f.descricao)}</small>
    </button>`).join('');

  const telas = amostras.map((s) => `
    <figure class="amostra"><div class="moldura">${s.main}</div><figcaption>${escapeHtml(s.arquivo.replace('.html', ''))} · ${escapeHtml(s.papel)} ${escapeHtml(s.tema)}</figcaption></figure>`).join('');

  const pagina = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Escolher estilo</title>
${links}
<style>
${amostras[0].style}
</style>
<style>
:root { --tela-fundo: #F4F2EE; --tela-texto: #22201D; --tela-suave: #6A645C; --tela-borda: #DCD6CC; --tela-marca: #22201D; }
body { margin: 0; background: var(--tela-fundo); color: var(--tela-texto); font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; overflow: auto; }
.tela { max-width: 1400px; margin: 0 auto; padding: 24px 16px 120px; }
.tela h1 { font-size: 22px; margin: 0 0 4px; }
.tela h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .08em; color: var(--tela-suave); margin: 28px 0 10px; }
.tela p.sub { margin: 0; color: var(--tela-suave); }
.opcoes { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.opcao { text-align: left; background: #fff; border: 2px solid var(--tela-borda); border-radius: 10px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; font: inherit; color: inherit; }
.opcao:hover { border-color: var(--tela-suave); }
.opcao[aria-pressed="true"] { border-color: var(--tela-marca); box-shadow: 0 0 0 2px var(--tela-marca) inset; }
.opcao strong { font-size: 14px; }
.opcao small { color: var(--tela-suave); font-size: 12px; line-height: 1.35; }
.amostras { display: flex; height: 28px; border-radius: 6px; overflow: hidden; border: 1px solid var(--tela-borda); }
.amostras i { flex: 1; }
.aa { font-size: 26px; font-weight: 700; line-height: 1.1; }
.corpo { font-size: 13px; color: var(--tela-suave); }
.amostras-arte { display: flex; flex-wrap: wrap; gap: 16px; }
.amostra { margin: 0; --s: .3; }
.moldura { width: calc(1080px * var(--s)); height: calc(1350px * var(--s)); overflow: hidden; border-radius: 6px; box-shadow: 0 1px 6px rgba(0,0,0,.15); }
.moldura .art { transform: scale(var(--s)) !important; transform-origin: top left !important; margin: 0 !important; }
.amostra figcaption { font-size: 12px; color: var(--tela-suave); margin-top: 6px; }
.escolha { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top: 1px solid var(--tela-borda); padding: 12px 16px; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; }
.escolha code { background: var(--tela-fundo); padding: 6px 10px; border-radius: 6px; font-size: 14px; }
.escolha button { background: var(--tela-marca); color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; font: inherit; cursor: pointer; }
@media (max-width: 700px) { .amostra { --s: .28; } .amostras-arte { justify-content: center; } }
</style>
</head>
<body>
<div class="tela">
  <h1>Escolha cores e fontes</h1>
  <p class="sub">As páginas abaixo são da campanha real. Clique numa paleta e num par de fontes; a prévia muda na hora.</p>

  <h2>Prévia</h2>
  <div class="amostras-arte">${telas}</div>

  <h2>Paleta</h2>
  <div class="opcoes">${cartoesPaleta}</div>

  <h2>Fontes</h2>
  <div class="opcoes">${cartoesFonte}</div>

  <h2>Fundo</h2>
  <div class="opcoes">${cartoesSimples(fundos, 'fundo')}</div>

  <h2>Alinhamento</h2>
  <div class="opcoes">${cartoesSimples(alinhamentos, 'alinhamento')}</div>
</div>

<div class="escolha">
  <span>Sua escolha:</span>
  <code id="resumo"></code>
  <button id="copiar" type="button">Copiar</button>
</div>

<script>
const DADOS = ${JSON.stringify(dados)};
const estado = { paleta: DADOS.paletas[0] && DADOS.paletas[0].id, fonte: DADOS.fontes[0] && DADOS.fontes[0].id, fundo: 'texturas', alinhamento: 'esquerda' };
document.querySelectorAll('.moldura .art').forEach((art) => { art.dataset.fundoOrig = art.dataset.fundo; });
try {
  const salvo = JSON.parse(localStorage.getItem('escolher-estilo') || 'null');
  if (salvo) Object.assign(estado, salvo);
} catch (e) {}

function aplicar() {
  const pal = DADOS.paletas.find((p) => p.id === estado.paleta) || DADOS.paletas[0];
  const fon = DADOS.fontes.find((f) => f.id === estado.fonte) || DADOS.fontes[0];
  const fun = DADOS.fundos.find((f) => f.id === estado.fundo) || { id: 'texturas', nome: 'Texturas' };
  const ali = DADOS.alinhamentos.find((a) => a.id === estado.alinhamento) || { id: 'esquerda', nome: 'À esquerda' };
  let capas = 0;
  document.querySelectorAll('.moldura .art').forEach((art, idx) => {
    const vars = Object.assign({}, pal.vars[art.dataset.tema] || pal.vars.escuro, fon.vars);
    for (const [k, v] of Object.entries(vars)) art.style.setProperty(k, v);
    let fundo = art.dataset.fundoOrig;
    if (fun.id === 'liso') fundo = 'liso';
    if (fun.id === 'desenho') fundo = 'desenho';
    if (fun.id === 'foto-capa') {
      if (art.dataset.papel === 'capa' && DADOS.fotos.length) {
        fundo = 'foto';
        art.style.setProperty('--foto', "url('" + DADOS.fotos[capas++ % DADOS.fotos.length] + "')");
      } else fundo = 'liso';
    }
    art.dataset.fundo = fundo;
    art.dataset.desenho = DADOS.desenhos[idx % DADOS.desenhos.length];
    art.dataset.alinhamento = ali.id;
  });
  const atual = { paleta: pal.id, fonte: fon.id, fundo: fun.id, alinhamento: ali.id };
  document.querySelectorAll('.opcao').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.id === atual[b.dataset.grupo]));
  });
  document.getElementById('resumo').textContent = 'Paleta: ' + pal.nome + ' · Fontes: ' + fon.nome + ' · Fundo: ' + fun.nome + ' · ' + ali.nome;
  try { localStorage.setItem('escolher-estilo', JSON.stringify(estado)); } catch (e) {}
}

document.querySelectorAll('.opcao').forEach((b) => b.addEventListener('click', () => {
  estado[b.dataset.grupo] = b.dataset.id;
  aplicar();
}));
document.getElementById('copiar').addEventListener('click', () => {
  const t = document.getElementById('resumo').textContent;
  if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
});
aplicar();
</script>
</body>
</html>`;

  const destino = path.join(htmlDir, 'escolher-estilo.html');
  fs.writeFileSync(destino, pagina, 'utf-8');
  console.log(`Tela de escolha: ${destino}`);
  console.log(`Amostras: ${amostras.map((s) => s.arquivo).join(', ')}`);
  console.log(`${paletas.length} paletas, ${fontes.length} pares de fontes.`);
}

main();
