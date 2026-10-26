const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SKILL_DIR = path.join(__dirname, '..');
const BUILTIN_TEMPLATE = path.join(SKILL_DIR, 'templates', 'post-variations.html');

const AJUDA = `Uso: node scripts/render.js <pasta-do-cliente> [opções]

Lê campaign-data.json (ou posts.json) e identidade.md da pasta do cliente e
gera as artes em <pasta-do-cliente>/campanhas/<nome>_<data>/.

  (sem opção)      fase 1: gera os HTML editáveis e a galeria de revisão
  --png            fase 2: exporta PNG dos HTML já revisados (não regera HTML)
  --todos, --all   as duas fases de uma vez
  --nome <texto>   nome da pasta da campanha (padrão: campo "projeto")
  --help           mostra esta ajuda`;

function parseArgs(argv) {
  const args = { project: null, png: false, html: false, nome: null, all: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(AJUDA); process.exit(0); }
    if (a === '--png') args.png = true;
    else if (a === '--html') args.html = true;
    else if (a === '--todos' || a === '--all') args.all = true;
    else if (a === '--nome' && argv[i + 1]) { args.nome = argv[++i]; args.nomeExplicito = true; }
    else if (!a.startsWith('--') && !args.project) args.project = a;
  }
  if (!args.png && !args.html) args.html = true; // default: fase HTML
  if (args.all) { args.html = true; args.png = true; }
  if (args.png && args.html && !args.all) { /* --html --png juntos = tudo */ }
  return args;
}

const CLI = parseArgs(process.argv);
const PROJECT_DIR = CLI.project || process.cwd();
const TEMPLATES_DIR = path.join(PROJECT_DIR, 'templates');
const ASSETS_DIR = path.join(PROJECT_DIR, 'assets');
const POSTS_FILE = path.join(PROJECT_DIR, 'posts.json');
const CAMPAIGN_FILE = path.join(PROJECT_DIR, 'campaign-data.json');
const IDENTIDADE_FILE = path.join(PROJECT_DIR, 'identidade.md');
const CAMPANHAS_DIR = path.join(PROJECT_DIR, 'campanhas');

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'projeto';
}

function resolveCampaignSlug(campaign) {
  if (CLI.nome && CLI.nomeExplicito) return slugify(CLI.nome);
  if (campaign && campaign.projeto) return slugify(campaign.projeto);
  if (CLI.nome) return slugify(CLI.nome);
  return slugify(path.basename(PROJECT_DIR));
}

function createCampaignDir(slug) {
  const date = new Date().toISOString().slice(0, 10);
  let name = `${slug}_${date}`;
  let dir = path.join(CAMPANHAS_DIR, name);
  let v = 2;
  while (fs.existsSync(dir)) {
    dir = path.join(CAMPANHAS_DIR, `${slug}_${date}_v${v++}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findCampaignDir(slug) {
  if (!fs.existsSync(CAMPANHAS_DIR)) return null;
  const date = new Date().toISOString().slice(0, 10);
  const exact = path.join(CAMPANHAS_DIR, `${slug}_${date}`);
  if (fs.existsSync(exact)) return exact;
  // mais recente com esse slug (qualquer data)
  const cands = fs.readdirSync(CAMPANHAS_DIR)
    .filter((d) => d === slug || d.startsWith(`${slug}_`))
    .map((d) => path.join(CAMPANHAS_DIR, d))
    .filter((p) => fs.statSync(p).isDirectory())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (cands.length) return cands[0];
  // senão, a mais recente de todas
  const all = fs.readdirSync(CAMPANHAS_DIR)
    .map((d) => path.join(CAMPANHAS_DIR, d))
    .filter((p) => fs.statSync(p).isDirectory())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return all[0] || null;
}

// Resolvido após loadPosts() (precisa do campaign.projeto)
let CAMPAIGN_DIR = null;
let HTML_DIR = null;
let OUTPUT_DIR = null;
let PENDENTES_DIR = null;
let RELATORIO_PATH = null;
let MANIFEST_PATH = null;

function setupDirs(campaign) {
  const slug = resolveCampaignSlug(campaign);
  if (CLI.png && !CLI.html) {
    CAMPAIGN_DIR = findCampaignDir(slug);
    if (!CAMPAIGN_DIR) {
      error(`Nenhuma pasta de campanha encontrada em ${CAMPANHAS_DIR} (slug: ${slug}).\n  Rode a fase HTML primeiro: node scripts/render.js ${PROJECT_DIR}`);
    }
    console.log(`Usando campanha existente: ${path.relative(PROJECT_DIR, CAMPAIGN_DIR)}`);
  } else {
    CAMPAIGN_DIR = createCampaignDir(slug);
    console.log(`Pasta de campanha: ${path.relative(PROJECT_DIR, CAMPAIGN_DIR)}`);
  }
  HTML_DIR = path.join(CAMPAIGN_DIR, 'html');
  OUTPUT_DIR = path.join(CAMPAIGN_DIR, 'output');
  PENDENTES_DIR = path.join(CAMPAIGN_DIR, 'pendentes');
  RELATORIO_PATH = path.join(CAMPAIGN_DIR, 'relatorio.md');
  MANIFEST_PATH = path.join(CAMPAIGN_DIR, 'manifest.json');
  [HTML_DIR, OUTPUT_DIR, PENDENTES_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.webp'];

const BANK = ['ondas', 'zigzag', 'dots', 'aneis', 'blobs', 'foto'];
const DESENHOS = ['casa', 'chave', 'documento', 'planta'];
const LEGACY_THEME_TEMPLATES = ['post-dark.html', 'post-light.html', 'post-variations.html'];

// paleta neutra, usada só quando nem identidade.md nem campaign-data.json definem cores
const DEFAULT_PALETTE = {
  primaria: '#1E2A3A',
  secundaria: '#4A7FA7',
  destaque: null,
  fundo_claro: '#F4F4F2',
  fundo_escuro: '#1E2A3A',
  texto_claro: '#FFFFFF',
  texto_escuro: '#1E2A3A',
  texto_suave: '#6B7280'
};

/* ------------------------------------------------------------------ */
/* utilidades básicas                                                  */
/* ------------------------------------------------------------------ */

function error(message) {
  console.error(`\n✗ ERRO: ${message}\n`);
  process.exit(1);
}

function warn(message, warnings) {
  console.warn(`  ⚠ ${message}`);
  if (warnings) warnings.push(message);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeKeepNewlines(value) {
  return escapeHtml(value);
}

function padNumber(num, size = 3) {
  return String(num).padStart(size, '0');
}

function relFrom(fromDir, absPath) {
  return path.relative(fromDir, absPath).split(path.sep).join('/');
}

/* ------------------------------------------------------------------ */
/* cor / contraste                                                      */
/* ------------------------------------------------------------------ */

function hexToRgb(hex) {
  const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const lin = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function contrast(hexA, hexB) {
  const a = luminance(hexA);
  const b = luminance(hexB);
  if (a == null || b == null) return null;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

function mixHex(hexA, hexB, weightA) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const w = weightA;
  return rgbToHex(a.r * w + b.r * (1 - w), a.g * w + b.g * (1 - w), a.b * w + b.b * (1 - w));
}

function darker(hexA, hexB) {
  return (luminance(hexA) ?? 1) <= (luminance(hexB) ?? 1) ? hexA : hexB;
}

/** primeira cor da lista com contraste mínimo vs fundo, ou null */
function pickColor(candidates, bg, minRatio) {
  for (const c of candidates) {
    if (!c) continue;
    const ratio = contrast(c, bg);
    if (ratio != null && ratio >= minRatio) return c;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* paleta                                                               */
/* ------------------------------------------------------------------ */

function isDark(hex) {
  const l = luminance(hex);
  return l != null && l < 0.35;
}

function normalizePalette(raw, source) {
  const p = { ...DEFAULT_PALETTE };
  if (raw) {
    const get = (...keys) => {
      for (const k of keys) {
        const v = raw[k] ?? raw[k.toLowerCase()];
        if (v && /^#?[0-9a-f]{6}$/i.test(String(v))) return String(v).startsWith('#') ? String(v) : `#${v}`;
      }
      return null;
    };
    p.primaria = get('cor_primaria', 'primaria', 'primaria_hex', 'cor_primaria') || p.primaria;
    p.secundaria = get('cor_secundaria', 'secundaria', 'accent', 'cor_accent', 'destaque') || p.secundaria;
    p.destaque = get('cor_accent', 'accent', 'destaque', 'cor_destaque') || p.destaque;
    const fundoClaro = get('fundo_claro', 'fundo_branco', 'branco', 'fundo');
    const fundoEscuro = get('fundo_escuro', 'fundo_escuro_hex');
    const textoPrincipal = get('texto_principal', 'texto');
    p.texto_claro = get('texto_claro', 'texto_branco') || null;
    p.texto_escuro = get('texto_escuro', 'texto_preto') || null;
    p.texto_suave = get('texto_suave', 'texto_secundario') || null;

    if (textoPrincipal) {
      if (isDark(textoPrincipal)) p.texto_escuro = p.texto_escuro || textoPrincipal;
      else p.texto_claro = p.texto_claro || textoPrincipal;
    }
    if (fundoClaro) p.fundo_claro = fundoClaro;
    if (fundoEscuro) p.fundo_escuro = fundoEscuro;
    else if (isDark(p.primaria)) p.fundo_escuro = p.primaria;
    if (p.texto_claro == null) p.texto_claro = DEFAULT_PALETTE.texto_claro;
    if (p.texto_escuro == null) p.texto_escuro = isDark(p.primaria) ? p.primaria : DEFAULT_PALETTE.texto_escuro;
    if (p.texto_suave == null) p.texto_suave = DEFAULT_PALETTE.texto_suave;
    if (p.destaque == null) p.destaque = DEFAULT_PALETTE.destaque;
  }

  // coerência: fundo_claro deve ser claro, fundo_escuro deve ser escuro
  if ((luminance(p.fundo_claro) ?? 1) < (luminance(p.fundo_escuro) ?? 0)) {
    const t = p.fundo_claro;
    p.fundo_claro = p.fundo_escuro;
    p.fundo_escuro = t;
  }
  if (!isDark(p.fundo_escuro)) p.fundo_escuro = darker(p.primaria, '#101828');
  if (isDark(p.fundo_claro)) p.fundo_claro = '#F7F5F1';

  return { paleta: p, origem: source };
}

function paletteFromCampaign(paleta) {
  if (!paleta || typeof paleta !== 'object') return null;
  // também aceita lista [{papel, hex}]
  if (Array.isArray(paleta)) {
    const map = {};
    for (const item of paleta) {
      if (item && item.papel && item.hex) map[`cor_${item.papel}`] = item.hex;
      // papéis com nome próprio (fundo_escuro, texto_suave, destaque...) valem direto
      if (item && item.papel && item.hex && !map[item.papel]) map[item.papel] = item.hex;
      if (item && item.papel === 'fundo') map.fundo_claro = item.hex;
      if (item && item.papel === 'texto') map.texto_principal = item.hex;
    }
    return normalizePalette(map, 'campaign-data');
  }
  // formato da skill instagram-conteudo: { origem, justificativa, cores: [{papel, hex}] }
  if (Array.isArray(paleta.cores)) return paletteFromCampaign(paleta.cores);
  const raw = {};
  for (const [k, v] of Object.entries(paleta)) raw[k.toLowerCase()] = v;
  // sem nenhuma cor válida: deixa a identidade.md decidir
  if (!Object.values(raw).some((v) => /^#?[0-9a-f]{6}$/i.test(String(v)))) return null;
  return normalizePalette(raw, 'campaign-data');
}

function paletteFromIdentidade(md) {
  const entries = []; // { label, hex }
  let ctx = '';
  let plain = '';

  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      ctx = heading[1].trim();
      plain = '';
      continue;
    }

    if (line === '```' || line === '~~~') continue;

    // **Rótulo:** ... #HEX
    const boldHex = line.match(/\*\*([^*]+)\*\*[^\n#]*?(#[0-9A-Fa-f]{6})/);
    if (boldHex) {
      entries.push({ label: `${ctx} ${boldHex[1].trim()}`.trim(), hex: boldHex[2] });
      continue;
    }

    // #HEX sozinho (bloco de código): rótulo = contexto atual
    const soloHex = line.match(/^(#[0-9A-Fa-f]{6})$/);
    if (soloHex) {
      entries.push({ label: `${ctx} ${plain}`.trim(), hex: soloHex[1] });
      continue;
    }

    if (!line || line.startsWith('#') || line.startsWith('-') || line.startsWith('*') || line.startsWith('|')) continue;

    // linha de texto simples vira contexto (ex.: "Azul Marinho" sob "## Primárias")
    plain = line;
  }

  if (entries.length === 0) return null;

  const find = (matchers) => {
    for (const e of entries) {
      if (matchers.some((re) => re.test(e.label))) return e.hex;
    }
    return null;
  };

  const raw = {
    cor_primaria: find([/prim[aá]ri/i, /azul/i, /marinho/i, /navy/i, /grafite/i]),
    cor_secundaria: find([/secund[aá]ri(?!.*fundo)/i, /dourad/i, /gold/i, /antracit/i, /accent/i, /acento/i]),
    cor_accent: find([/accent/i, /acento/i, /destaque/i, /dourad/i]),
    fundo_claro: find([/fundo\s*claro/i, /off\s*white/i, /creme/i, /bege/i]),
    fundo_escuro: find([/fundo\s*escuro/i]),
    texto_claro: find([/texto\s*claro/i, /white/i, /branco/i]),
    texto_escuro: find([/texto\s*escuro/i, /texto\s*principal/i, /preto/i]),
    texto_suave: find([/texto\s*suave/i, /texto\s*secund/i, /cinza/i, /gray/i, /grey/i])
  };

  const clean = Object.fromEntries(Object.entries(raw).filter(([, v]) => v));
  if (Object.keys(clean).length === 0) return null;
  return normalizePalette(clean, 'identidade');
}

function fontsFromIdentidade(md) {
  const out = { titulo: null, corpo: null };
  let section = '';
  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const bold = line.match(/\*\*([^*]+)\*\*:?\s*([^*\n]+)/);
    if (bold) {
      const label = bold[1].toLowerCase();
      const value = bold[2].split(',')[0].replace(/`/g, '').trim();
      if (/^#/.test(value)) continue;
      const isColorLabel = /principal|suave|secund|claro|escuro|branco|preto|fundo|^cor|accent|acento/i.test(label);
      if (/t[ií]tul/.test(label) && !isColorLabel && !out.titulo) out.titulo = value;
      if (/(corpo|texto|fonte)/.test(label) && !isColorLabel && !out.corpo) out.corpo = value;
      continue;
    }
    const bullet = line.match(/^[-*]\s+([A-Z][A-Za-zÀ-ÿ]+(?: [A-Z][A-Za-zÀ-ÿ]+)*)\s*$/);
    if (bullet) {
      const value = bullet[1].trim();
      if (/t[ií]tul/i.test(section) && !out.titulo) out.titulo = value;
      if (/corpo|texto/i.test(section) && !out.corpo) out.corpo = value;
    }
  }
  return out;
}

function fontsFromCampaign(tipografia) {
  if (!tipografia || typeof tipografia !== 'object') return null;
  const get = (...keys) => {
    for (const k of keys) if (tipografia[k]) return String(tipografia[k]).split(',')[0].trim();
    return null;
  };
  const titulo = get('fonte_titulo', 'titulos', 'titulo');
  const corpo = get('fonte_corpo', 'fonte_texto', 'corpo', 'texto');
  if (!titulo && !corpo) return null;
  return { titulo, corpo };
}

const SERIF_RE = /playfair|cinzel|georgia|garamond|cormorant|merriweather|lora|crimson|times|serif/i;

function fontStack(name, isTitulo) {
  const fallback = SERIF_RE.test(name || '') || (!name && isTitulo)
    ? "Georgia, 'Times New Roman', serif"
    : "Arial, Helvetica, sans-serif";
  const safe = (name || (isTitulo ? 'Playfair Display' : 'Montserrat')).replace(/['";]/g, '').trim();
  return `'${safe}', ${fallback}`;
}

function fontsUrl(...names) {
  let unique = [...new Set(names.filter(Boolean).map((n) => n.replace(/[^A-Za-z0-9 ]/g, '').trim()))];
  if (unique.length === 0) unique = ['Playfair Display', 'Montserrat'];
  return unique.map((n) => `family=${n.replace(/ /g, '+')}:wght@400;500;600;700`).join('&');
}

/* ------------------------------------------------------------------ */
/* identidade: assets declarados                                       */
/* ------------------------------------------------------------------ */

function parseIdentidade() {
  const assets = { backgrounds: [], logos: [], fotos: [], fontes: { titulo: null, corpo: null } };
  if (!fs.existsSync(IDENTIDADE_FILE)) return assets;

  const content = fs.readFileSync(IDENTIDADE_FILE, 'utf-8');
  const lines = content.split('\n');

  let currentSection = null;

  for (const line of lines) {
    if (line.match(/^#{1,3}\s+.*fundo/i) && !line.match(/uso das cores|fundo claro|fundo escuro/i)) {
      currentSection = 'backgrounds';
      continue;
    }
    if (line.match(/^#{1,3}\s+logos?/i)) {
      currentSection = 'logos';
      continue;
    }
    if (line.match(/^#{1,3}\s+(imagens|fotos|imagem)/i)) {
      currentSection = 'fotos';
      continue;
    }
    if (line.match(/^#{1,3}\s+/) && currentSection) {
      currentSection = null;
      continue;
    }

    if (!currentSection) continue;
    const fileMatch = line.match(/`([^`]+\.(?:png|jpe?g|webp))`/i) || line.match(/^\s*[-*]\s+([^.\n]+\.(?:png|jpe?g|webp))\s*$/i);
    if (!fileMatch) continue;
    const file = fileMatch[1].trim();

    if (currentSection === 'backgrounds') {
      const hasLogoMatch = line.match(/hasLogo=(true|false)/);
      assets.backgrounds.push({ file, hasLogo: hasLogoMatch ? hasLogoMatch[1] === 'true' : false });
    } else if (currentSection === 'logos') {
      assets.logos.push(file);
    } else if (currentSection === 'fotos') {
      if (!/logo/i.test(file)) assets.fotos.push(file);
    }
  }

  assets.fontes = fontsFromIdentidade(content);
  return assets;
}

function findFileAnywhere(name, dirs) {
  for (const dir of dirs) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function discoverPhotos(identFotos) {
  const searchDirs = [
    path.join(ASSETS_DIR, 'imagens'),
    path.join(ASSETS_DIR, 'fundos'),
    ASSETS_DIR,
    PROJECT_DIR
  ].filter((d) => fs.existsSync(d));

  const photos = [];
  const seen = new Set();

  const add = (abs) => {
    if (!abs || seen.has(abs)) return;
    if (/logo/i.test(path.basename(abs))) return;
    if (!IMAGE_EXTENSIONS.includes(path.extname(abs).toLowerCase())) return;
    seen.add(abs);
    photos.push(abs);
  };

  // fotos declaradas na identidade primeiro
  for (const name of identFotos || []) add(findFileAnywhere(name, searchDirs));

  // depois fotos reais (.jpg/.jpeg/.webp) em assets/
  for (const dir of [path.join(ASSETS_DIR, 'imagens'), path.join(ASSETS_DIR, 'fundos'), ASSETS_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (PHOTO_EXTENSIONS.includes(path.extname(f).toLowerCase())) add(path.join(dir, f));
    }
  }

  return photos;
}

function discoverAssets() {
  const ident = parseIdentidade();

  let imageFiles = [];
  if (fs.existsSync(ASSETS_DIR)) {
    imageFiles = fs.readdirSync(ASSETS_DIR).filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));
  }

  const backgrounds = ident.backgrounds.filter((bg) => {
    if (!imageFiles.includes(bg.file)) {
      console.warn(`⚠ Fundo declarado em identidade.md não encontrado: ${bg.file}`);
      return false;
    }
    if (/logo/i.test(bg.file)) return false;
    return true;
  });

  const logos = ident.logos.filter((logo) => {
    if (!imageFiles.includes(logo)) {
      console.warn(`⚠ Logo declarado em identidade.md não encontrado: ${logo}`);
      return false;
    }
    return true;
  });

  // logo padrão da skill: assets/logo.png
  const logoPadrao = path.join(ASSETS_DIR, 'logo.png');
  const logoPreferido = fs.existsSync(logoPadrao) ? logoPadrao : (logos[0] ? path.join(ASSETS_DIR, logos[0]) : null);

  const photos = discoverPhotos(ident.fotos);

  return { backgrounds, logos, logoPreferido, photos, fontes: ident.fontes };
}

/* ------------------------------------------------------------------ */
/* conteúdo                                                             */
/* ------------------------------------------------------------------ */

function normHashtags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value).split(/[\s,]+/).filter((t) => t.startsWith('#'));
}

function expandPosts(campaign) {
  const out = [];
  const posts = Array.isArray(campaign.posts) ? campaign.posts : [];

  for (const post of posts) {
    const dv = post.direcao_visual || {};
    const conteudo = post.conteudo && typeof post.conteudo === 'object' ? post.conteudo : post;
    const tipo = String(post.tipo || '').toLowerCase();

    if (tipo === 'carrossel' && Array.isArray(conteudo.slides)) {
      const slides = [];

      if (conteudo.titulo_capa) {
        slides.push({
          titulo: conteudo.titulo_capa,
          texto: conteudo.subtitulo_capa || '',
          isCapa: true,
          isCTA: false
        });
      }
      for (const s of conteudo.slides) {
        const t = String(s.titulo || '').trim();
        const isCTA = /^cta$/i.test(t);
        let titulo = s.titulo;
        let texto = s.texto || '';
        // sentinel "CTA": usa a primeira linha do texto como título e o resto como apoio
        if (isCTA) {
          const linhas = String(texto).split(/\n+/).map((l) => l.trim()).filter(Boolean);
          if (linhas.length > 0) {
            titulo = linhas[0];
            texto = linhas.slice(1).join('\n');
          } else {
            titulo = '';
          }
        }
        slides.push({
          titulo,
          texto,
          isCapa: false,
          isCTA
        });
      }

      const total = slides.length;
      slides.forEach((s, i) => {
        out.push({
          id: post.id * 100 + i + 1,
          isCarousel: true,
          slideIndexInPost: i,
          slideTotal: total,
          isCapa: s.isCapa,
          isCTA: s.isCTA,
          papel: i === 0 ? 'capa' : (i === total - 1 ? 'fechamento' : 'conteudo'),
          titulo: s.titulo || '',
          categoria: post.categoria || conteudo.categoria || '',
          texto: s.texto || '',
          legenda: conteudo.legenda || '',
          hashtags: normHashtags(conteudo.hashtags),
          cta: null,
          direcao_visual: dv,
          formato: post.formato || campaign.formato || null,
          resolucao: post.resolucao || campaign.resolucao || null,
          tema_campanha: campaign.tema || null
        });
      });
    } else {
      out.push({
        id: post.id,
        isCarousel: false,
        slideIndexInPost: 0,
        slideTotal: 1,
        isCapa: false,
        isCTA: false,
        papel: 'capa',
        titulo: post.titulo ?? conteudo.titulo ?? '',
        categoria: post.categoria ?? conteudo.categoria ?? '',
        texto: post.texto ?? conteudo.texto ?? '',
        legenda: post.legenda ?? conteudo.legenda ?? '',
        hashtags: normHashtags(post.hashtags ?? conteudo.hashtags),
        cta: post.cta ?? conteudo.cta ?? null,
        direcao_visual: dv,
        formato: post.formato || campaign.formato || null,
        resolucao: post.resolucao || campaign.resolucao || null,
        tema_campanha: campaign.tema || null
      });
    }
  }

  return out;
}

function loadPosts() {
  if (fs.existsSync(CAMPAIGN_FILE)) {
    console.log('Lendo de campaign-data.json...');
    const campaign = JSON.parse(fs.readFileSync(CAMPAIGN_FILE, 'utf-8'));
    return { posts: expandPosts(campaign), campaign };
  }

  if (fs.existsSync(POSTS_FILE)) {
    console.log('Lendo de posts.json (modo legado)...');
    const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
    return { posts: expandPosts({ posts }), campaign: {} };
  }

  error(`Nenhum arquivo de conteúdo encontrado (campaign-data.json ou posts.json) em: ${PROJECT_DIR}`);
}

function validateProjectStructure() {
  if (!fs.existsSync(PROJECT_DIR)) {
    error(`Pasta do projeto não encontrada: ${PROJECT_DIR}`);
  }
  if (!fs.existsSync(CAMPAIGN_FILE) && !fs.existsSync(POSTS_FILE)) {
    error(`Nenhum arquivo de conteúdo encontrado em: ${PROJECT_DIR}\n  Esperado: campaign-data.json ou posts.json`);
  }
  if (!fs.existsSync(IDENTIDADE_FILE)) {
    console.warn('⚠ identidade.md não encontrado — usando paleta padrão/da campanha.');
  }
  if (!fs.existsSync(TEMPLATES_DIR)) {
    console.warn('⚠ templates/ não encontrado — usando o template embutido da skill (post-variations.html).');
  }
  if (!fs.existsSync(ASSETS_DIR)) {
    console.warn('⚠ assets/ não encontrado — as artes serão geradas sem logo.');
  }
}

/* ------------------------------------------------------------------ */
/* resolução, tema, tamanho                                             */
/* ------------------------------------------------------------------ */

function resolveResolution(campaign, post) {
  const explicit = post.resolucao || campaign.resolucao;
  if (explicit) {
    if (typeof explicit === 'string') {
      const m = explicit.match(/(\d+)\s*[x×]\s*(\d+)/i);
      if (m) return { largura: +m[1], altura: +m[2] };
    } else if (typeof explicit === 'object' && explicit.largura && explicit.altura) {
      return { largura: +explicit.largura, altura: +explicit.altura };
    }
  }
  const formato = String(post.formato || campaign.formato || 'feed').toLowerCase();
  if (formato.includes('quad') || formato === '1:1') return { largura: 1080, altura: 1080 };
  if (formato.includes('story') || formato === '9:16') return { largura: 1080, altura: 1920 };
  return { largura: 1080, altura: 1350 }; // padrão feed 4:5
}

function chooseTheme(post, globalIndex, temaHint) {
  const dv = post.direcao_visual || {};
  // só "claro"/"escuro" forçam o tema; outro texto (ex.: assunto da campanha) é ignorado
  const explicit = [dv.tema, post.tema_campanha]
    .map((t) => String(t || '').trim().toLowerCase())
    .find((t) => /^(clar|escur)/.test(t));
  if (explicit) return explicit.startsWith('clar') ? 'claro' : 'escuro';
  if (dv.alternar_tema === false) return temaHint || 'escuro';

  const base = temaHint || 'escuro';
  if (post.isCarousel) {
    return globalIndex % 2 === 0 ? base : (base === 'escuro' ? 'claro' : 'escuro');
  }
  return base;
}

function tamanhoOf(tituloRaw, texto, cta) {
  const titleLen = String(tituloRaw || '').replace(/<[^>]*>/g, '').length;
  const apoioLen = String(texto || '').length + String(cta || '').length;
  const lines = String(tituloRaw || '').split(/\n|<br\s*\/?>/i).length;

  let size;
  if (titleLen > 150 || apoioLen > 480 || lines >= 5) size = 'longo';
  else if (titleLen <= 70 && apoioLen <= 160 && lines <= 3) size = 'curto';
  else size = 'medio';

  if (size === 'curto' && lines >= 4) size = 'medio';
  if (size === 'medio' && (titleLen > 200 || apoioLen > 700)) size = 'longo';
  return size;
}

/* ------------------------------------------------------------------ */
/* seleção de fundo                                                     */
/* ------------------------------------------------------------------ */

function pickFromBank(bank, lastId, usage, explicit) {
  if (explicit && bank.includes(explicit) && explicit !== lastId) {
    usage[explicit] = (usage[explicit] || 0) + 1;
    return explicit;
  }
  let candidates = bank.filter((id) => id !== lastId);
  if (candidates.length === 0) candidates = [...bank];
  const min = Math.min(...candidates.map((id) => usage[id] || 0));
  const least = candidates.filter((id) => (usage[id] || 0) === min);
  const chosen = least[Math.floor(Math.random() * least.length)];
  usage[chosen] = (usage[chosen] || 0) + 1;
  return chosen;
}

/* ------------------------------------------------------------------ */
/* título com linha em destaque                                         */
/* ------------------------------------------------------------------ */

function formatTitle(raw) {
  const source = String(raw ?? '');
  const marcado = source.match(/\*\*([^*]+)\*\*/);
  const lines = source
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .split(/\n|<br\s*\/?>/i)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { html: '', lineCount: 0 };

  const decorated = lines.map((line, i) => {
    const escaped = escapeHtml(line);
    const isMarked = marcado && line.includes(marcado[1].trim());
    const isLast = i === lines.length - 1;
    if (lines.length === 1) return escaped; // título de uma linha: sem destaque
    if (isMarked || isLast) return `<span class="destaque">${escaped}</span>`;
    return escaped;
  });

  return { html: decorated.join('<br>'), lineCount: lines.length };
}

/* ------------------------------------------------------------------ */
/* templates                                                            */
/* ------------------------------------------------------------------ */

function discoverTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR)
    .filter((file) => file.endsWith('.html'))
    .map((file) => ({ name: file, path: path.join(TEMPLATES_DIR, file) }));
}

function loadTemplate(templatePath) {
  if (!fs.existsSync(templatePath)) error(`Template não encontrado: ${templatePath}`);
  return fs.readFileSync(templatePath, 'utf-8');
}

function resolveTemplate(post, templates) {
  const suggested = post.direcao_visual && post.direcao_visual.template_sugerido;
  const temaHintSuggested = suggested && /light|claro/i.test(suggested) ? 'claro' : 'escuro';

  if (suggested && suggested !== 'cta-final.html') {
    const found = templates.find((t) => t.name === suggested);
    if (found && !LEGACY_THEME_TEMPLATES.includes(suggested)) {
      return { path: found.path, mode: 'legacy', temaHint: temaHintSuggested, name: suggested };
    }
    // post-dark/post-light/post-variations → banco de variações (só dica de tema)
    const projectBank = templates.find((t) => t.name === 'post-variations.html');
    return {
      path: projectBank ? projectBank.path : BUILTIN_TEMPLATE,
      mode: 'bank',
      temaHint: temaHintSuggested,
      name: projectBank ? projectBank.name : 'post-variations.html (skill)'
    };
  }

  if (suggested === 'cta-final.html') {
    const found = templates.find((t) => t.name === 'cta-final.html');
    if (found) return { path: found.path, mode: 'cta', temaHint: 'escuro', name: 'cta-final.html' };
  }

  const projectBank = templates.find((t) => t.name === 'post-variations.html');
  return {
    path: projectBank ? projectBank.path : BUILTIN_TEMPLATE,
    mode: 'bank',
    temaHint: 'escuro',
    name: projectBank ? projectBank.name : 'post-variations.html (skill)'
  };
}

/* ------------------------------------------------------------------ */
/* estilo (cores por tema)                                              */
/* ------------------------------------------------------------------ */

function computeStyle(pal, tema) {
  const bg = tema === 'escuro' ? pal.fundo_escuro : pal.fundo_claro;
  const titulo = tema === 'escuro' ? pal.texto_claro : pal.texto_escuro;

  // linha em destaque: cor da marca com contraste vs fundo e, entre as
  // válidas, a que mais se diferencia da cor do título
  const candsDestaque = [pal.secundaria, pal.destaque, pal.texto_suave]
    .filter(Boolean)
    .filter((c) => (contrast(c, bg) ?? 0) >= 3);
  let destaque = null;
  if (candsDestaque.length) {
    destaque = candsDestaque.reduce(
      (best, c) => ((contrast(c, titulo) ?? 0) > (contrast(best, titulo) ?? 0) ? c : best),
      candsDestaque[0]
    );
  } else {
    const mixWith = darker(pal.primaria, pal.fundo_escuro);
    destaque = pickColor([mixHex(pal.secundaria, mixWith, 0.55)], bg, 3)
      || (tema === 'escuro' ? pal.texto_claro : pal.texto_escuro);
  }

  const barra = pickColor([pal.secundaria, pal.destaque, pal.texto_suave], bg, 1.5) || destaque;

  const texturaCands = tema === 'escuro'
    ? [pal.secundaria, pal.texto_suave, pal.destaque, pal.texto_claro]
    : [pal.secundaria, pal.primaria, pal.texto_escuro];
  const textura = pickColor(texturaCands, bg, 1.5)
    || (tema === 'escuro' ? pal.texto_claro : pal.texto_escuro);

  const apoio = tema === 'escuro'
    ? (pickColor([pal.texto_suave], bg, 4.5) || pal.texto_claro)
    : (pickColor([pal.texto_suave], bg, 4.5) || pal.texto_escuro);

  return { bg, titulo, apoio, destaque, barra, textura };
}

/* ------------------------------------------------------------------ */
/* geração de HTML                                                      */
/* ------------------------------------------------------------------ */

function logoTagFor(htmlDir, logoAbs, tema) {
  if (!logoAbs || !fs.existsSync(logoAbs)) return '';
  const rel = relFrom(htmlDir, logoAbs);
  return `<img class="logo" src="${rel}" alt="">`;
}

function applyReplacements(template, replacements) {
  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(key, value);
  }
  return html;
}

function leftoverPlaceholders(html) {
  const m = html.match(/\{\{[A-Za-z0-9_]+\}\}/g);
  return m ? [...new Set(m)] : [];
}

function generateBankHTML({ template, post, tema, fundo, papel, tamanho, palette, fontes, res, fotoAbs, desenho, alinhamento, logoAbs, selo, htmlDir }) {
  const style = computeStyle(palette, tema);
  const title = formatTitle(post.titulo);
  const logoFilter = tema === 'claro' ? 'brightness(0) saturate(100%)' : 'none';

  const replacements = {
    '{{TEMA}}': tema,
    '{{FUNDO}}': fundo,
    '{{PAPEL}}': papel,
    '{{TAMANHO}}': tamanho,
    '{{ALINHAMENTO}}': alinhamento || 'esquerda',
    '{{DESENHO}}': desenho || '',
    '{{SELO}}': selo ? escapeHtml(selo) : '',
    '{{LARGURA}}': String(res.largura),
    '{{ALTURA}}': String(res.altura),
    '{{CATEGORY}}': escapeHtml(String(post.categoria || '').toUpperCase()),
    '{{TITLE}}': title.html,
    '{{DESCRIPTION}}': escapeKeepNewlines(post.texto || ''),
    '{{CTA}}': post.cta ? escapeKeepNewlines(post.cta) : '',
    '{{CAPTION}}': escapeHtml(post.legenda || ''),
    '{{HASHTAGS_TEXT}}': escapeHtml(post.hashtags.join(' ')),
    '{{LOGO}}': logoTagFor(htmlDir, logoAbs, tema),
    '{{FOTO_URL}}': fotoAbs ? `url('${relFrom(htmlDir, fotoAbs)}')` : 'none',
    '{{FONTES_URL}}': fontsUrl(fontes.titulo, fontes.corpo),
    '{{FONTE_TITULO}}': fontStack(fontes.titulo, true),
    '{{FONTE_CORPO}}': fontStack(fontes.corpo, false),
    // fontes de título com um peso só (ex.: DM Serif Display) pedem peso_titulo: 400
    '{{PESO_TITULO}}': String((post.direcao_visual && post.direcao_visual.tipografia && post.direcao_visual.tipografia.peso_titulo) || 700),
    '{{COR_PRIMARIA}}': palette.primaria,
    '{{COR_SECUNDARIA}}': palette.secundaria,
    '{{COR_ACCENT}}': palette.destaque || palette.secundaria,
    '{{COR_FUNDO_CLARO}}': palette.fundo_claro,
    '{{COR_FUNDO_ESCURO}}': palette.fundo_escuro,
    '{{COR_TEXTO_CLARO}}': palette.texto_claro,
    '{{COR_TEXTO_ESCURO}}': palette.texto_escuro,
    '{{COR_TITULO}}': style.titulo,
    '{{COR_APOIO}}': style.apoio,
    '{{COR_DESTAQUE}}': style.destaque,
    '{{COR_BARRA}}': style.barra,
    '{{COR_TEXTURA}}': style.textura,
    '{{LOGO_FILTER}}': logoFilter
  };

  return { html: applyReplacements(template, replacements), style };
}

function generateLegacyHTML({ template, post, tema, backgrounds, lastBg, usageBg, palette, fontes, res, logoAbs, selo, htmlDir }) {
  const style = computeStyle(palette, tema);
  const title = formatTitle(post.titulo);
  const logoFilter = tema === 'claro' ? 'brightness(0) saturate(100%)' : 'none';

  let backgroundValue = style.bg;
  let bgFile = null;
  if (backgrounds.length > 0) {
    const files = backgrounds.map((b) => b.file);
    bgFile = pickFromBank(files, lastBg, usageBg, null);
    const abs = path.join(ASSETS_DIR, bgFile);
    const rel = relFrom(htmlDir, abs);
    backgroundValue = `url('${rel}') center/cover`;
  }

  // template decide se {{BACKGROUND}} recebe um valor ou uma declaração completa
  const valueMode = /--background:\s*\{\{BACKGROUND\}\}/.test(template);
  const background = valueMode ? backgroundValue : `background: ${backgroundValue};`;

  const bodyLegacy = escapeKeepNewlines(post.texto || '').replace(/\n/g, '<br><br>');
  const footer = post.hashtags.length > 0 ? post.hashtags[post.hashtags.length - 1] : '';

  const replacements = {
    '{{TEMA}}': tema,
    '{{PAPEL}}': post.papel,
    '{{SELO}}': selo ? escapeHtml(selo) : '',
    '{{LARGURA}}': String(res.largura),
    '{{ALTURA}}': String(res.altura),
    '{{TITLE}}': title.html,
    '{{CATEGORY}}': escapeHtml(String(post.categoria || '').toUpperCase()),
    '{{DESCRIPTION}}': bodyLegacy,
    '{{BODY}}': bodyLegacy,
    '{{FOOTER}}': escapeHtml(footer),
    '{{HASHTAGS}}': post.hashtags.map((t) => `<span class="hashtag">${escapeHtml(t)}</span>`).join('\n      '),
    '{{HASHTAGS_TEXT}}': escapeHtml(post.hashtags.join(' ')),
    '{{CAPTION}}': escapeHtml(post.legenda || ''),
    '{{CTA}}': post.cta ? `<div class="cta-box"><p class="cta-text">${escapeHtml(post.cta).replace(/\n/g, '<br>')}</p></div>` : '',
    '{{LOGO}}': logoTagFor(htmlDir, logoAbs, tema),
    '{{BACKGROUND}}': background,
    '{{TEXT}}': style.titulo,
    '{{ACCENT}}': style.barra,
    '{{LOGO_FILTER}}': logoFilter,
    '{{FONTES_URL}}': fontsUrl(fontes.titulo, fontes.corpo),
    '{{FONTE_TITULO}}': fontStack(fontes.titulo, true),
    '{{FONTE_CORPO}}': fontStack(fontes.corpo, false),
    // fontes de título com um peso só (ex.: DM Serif Display) pedem peso_titulo: 400
    '{{PESO_TITULO}}': String((post.direcao_visual && post.direcao_visual.tipografia && post.direcao_visual.tipografia.peso_titulo) || 700),
    '{{COR_PRIMARIA}}': palette.primaria,
    '{{COR_SECUNDARIA}}': palette.secundaria,
    '{{COR_ACCENT}}': palette.destaque || palette.secundaria,
    '{{COR_FUNDO_CLARO}}': palette.fundo_claro,
    '{{COR_FUNDO_ESCURO}}': palette.fundo_escuro,
    '{{COR_TEXTO_CLARO}}': palette.texto_claro,
    '{{COR_TEXTO_ESCURO}}': palette.texto_escuro,
    '{{COR_TITULO}}': style.titulo,
    '{{COR_APOIO}}': style.apoio,
    '{{COR_DESTAQUE}}': style.destaque,
    '{{COR_BARRA}}': style.barra,
    '{{COR_TEXTURA}}': style.textura,
    '{{FOTO_URL}}': 'none',
    '{{FUNDO}}': 'ondas',
    '{{TAMANHO}}': 'medio'
  };

  return {
    html: applyReplacements(template, replacements),
    style,
    bgFile
  };
}

/* ------------------------------------------------------------------ */
/* galeria e relatório                                                  */
/* ------------------------------------------------------------------ */

function writeGallery(items, res) {
  const scale = (260 / res.largura).toFixed(4);
  const card = (it) => `<div class="card">
      <div class="meta"><strong>${it.base}.html</strong> · ${it.fundo} · ${it.tema} · ${it.papel}${it.slideTotal > 1 ? ` · ${it.slideInPost}/${it.slideTotal}` : ''}</div>
      <a href="${it.base}.html" target="_blank">
        <iframe src="${it.base}.html" style="width:${res.largura}px;height:${res.altura}px;transform:scale(${scale});transform-origin:top left" scrolling="no"></iframe>
      </a>
    </div>`;

  const carousels = items.filter((it) => it.isCarousel);
  const singles = items.filter((it) => !it.isCarousel);

  // agrupa carrosséis por postId, preservando a ordem de aparição
  const groups = new Map();
  for (const it of carousels) {
    const key = it.postId ?? it.base;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const carouselSections = [...groups.entries()].map(([postId, slides], gi) => {
    const titulo = slides[0]?.postTitulo || `Carrossel ${postId}`;
    const cards = slides.map(card).join('\n');
    return `<section class="grupo">
  <h2>Carrossel ${postId} — ${escapeHtml(titulo)} <span class="badge">${slides.length} slides</span></h2>
  <div class="grid">${cards}</div>
</section>`;
  }).join('\n');

  const singlesSection = singles.length
    ? `<section class="grupo">
  <h2>Posts avulsos <span class="badge">${singles.length}</span></h2>
  <div class="grid">${singles.map(card).join('\n')}</div>
</section>`
    : '';

  const pend = items.filter((it) => it.pendente);
  const pendSection = pend.length
    ? `<h2>Pendentes de revisão</h2><ul>${pend.map((it) => `<li><a href="../pendentes/${it.base}.html">${it.base}.html</a></li>`).join('')}</ul>`
    : '';

  const resumo = carousels.length || singles.length
    ? `<p class="resumo">${groups.size} carrossel(is) · ${singles.length} avulso(s) · ${items.length} slide(s) no total</p>`
    : '';

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Revisão — slides</title>
<style>
body{margin:32px;background:#f1f1f4;color:#1b1b1f;font-family:system-ui,sans-serif}
h1{font-weight:700} h2{font-size:18px;margin:28px 0 12px;font-weight:650}
.badge{font-size:12px;font-weight:500;background:#e4e4e9;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle;color:#444}
.resumo{color:#555;font-size:14px;margin:4px 0 8px}
.grupo{margin-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}
.card{background:#fff;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
.meta{font-size:12px;margin-bottom:8px;color:#444}
a{color:#1b1b1f}
iframe{display:block;border:0;background:#e9e9e9}
</style></head><body>
<h1>Revisão de slides</h1>
${resumo}
${carouselSections}
${singlesSection}
${pendSection}
</body></html>`;

  fs.writeFileSync(path.join(HTML_DIR, 'index.html'), html, 'utf-8');
}

function writeRelatorio(items, warnings, res, outputCount) {
  const lines = [
    '# Relatório de renderização',
    '',
    `Data: ${new Date().toISOString().slice(0, 10)}`,
    `Resolução padrão da campanha: ${res.largura} × ${res.altura}`,
    '',
    '## Slides',
    '',
    '| Arquivo | Fundo | Tema | Papel | Tamanho | Status |',
    '|---------|-------|------|-------|---------|--------|'
  ];
  for (const it of items) {
    lines.push(`| ${it.base} | ${it.fundo} | ${it.tema} | ${it.papel} | ${it.tamanho} | ${it.pendente ? 'pendente' : 'ok'} |`);
  }
  lines.push('', '## Ocorrências', '');
  if (warnings.length === 0) lines.push('✓ Nenhuma ocorrência');
  else for (const w of warnings) lines.push(`- ⚠ ${w}`);
  lines.push('', '## Contagem', '', `✓ ${items.length} HTML`, `✓ ${outputCount} PNG`, '');
  fs.writeFileSync(RELATORIO_PATH || path.join(PROJECT_DIR, 'relatorio.md'), lines.join('\n'), 'utf-8');
}

/* ------------------------------------------------------------------ */
/* render principal                                                     */
/* ------------------------------------------------------------------ */

async function capturePngs(items, warnings) {
  if (!items.length) return 0;
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  let pngCount = 0;

  for (const it of items) {
    if (it.pendente) continue;
    const htmlPath = path.join(HTML_DIR, `${it.base}.html`);
    if (!fs.existsSync(htmlPath)) {
      warn(`${it.base}: HTML não encontrado em html/ — pulando PNG.`, warnings);
      continue;
    }
    const res = it.resObj || { largura: 1080, altura: 1350 };
    const pngPath = path.join(OUTPUT_DIR, `${it.base}.png`);
    const page = await context.newPage();
    await page.setViewportSize({ width: res.largura, height: res.altura });
    try {
      await page.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: 'load', timeout: 20000 });
      await page.evaluate(() => Promise.race([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        new Promise((r) => setTimeout(r, 4000))
      ]));

      const checks = await page.evaluate((bgHex) => {
        const art = document.querySelector('.art');
        const conteudo = document.querySelector('.conteudo');
        const result = { excede: 0, imagensQuebradas: [], logoContraste: null };
        if (art && conteudo) {
          const ar = art.getBoundingClientRect();
          let maxBottom = -Infinity;
          let minTop = Infinity;
          conteudo.querySelectorAll('.categoria, .titulo, .barra, .apoio, .cta').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.height > 0) {
              maxBottom = Math.max(maxBottom, r.bottom);
              minTop = Math.min(minTop, r.top);
            }
          });
          if (maxBottom > ar.bottom) result.excede = Math.round(maxBottom - ar.bottom);
          if (minTop < ar.top) result.excede = Math.max(result.excede, Math.round(ar.top - minTop));
        }
        document.querySelectorAll('img').forEach((img) => {
          if (!img.complete || img.naturalWidth === 0) result.imagensQuebradas.push(img.src);
        });
        const logo = document.querySelector('.logo');
        if (logo && logo.complete && logo.naturalWidth > 0 && bgHex) {
          try {
            const c = document.createElement('canvas');
            c.width = logo.naturalWidth;
            c.height = logo.naturalHeight;
            const ctx = c.getContext('2d');
            ctx.drawImage(logo, 0, 0);
            const data = ctx.getImageData(0, 0, c.width, c.height).data;
            let r = 0, g = 0, b = 0, n = 0;
            for (let p = 0; p < data.length; p += 4) {
              if (data[p + 3] > 128) { r += data[p]; g += data[p + 1]; b += data[p + 2]; n++; }
            }
            if (n > 0) {
              const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
              const logoLum = 0.2126 * lin(r / n) + 0.7152 * lin(g / n) + 0.0722 * lin(b / n);
              const m = bgHex.match(/#?([0-9a-f]{6})/i);
              if (m) {
                const nn = parseInt(m[1], 16);
                const br = { r: (nn >> 16) & 255, g: (nn >> 8) & 255, b: nn & 255 };
                const bgLum = 0.2126 * lin(br.r) + 0.7152 * lin(br.g) + 0.0722 * lin(br.b);
                const hi = Math.max(logoLum, bgLum), lo = Math.min(logoLum, bgLum);
                result.logoContraste = (hi + 0.05) / (lo + 0.05);
              }
            }
          } catch (e) { /* canvas pode ficar "tainted" em file:// — ignora */ }
        }
        return result;
      }, it.bgHex || null);

      if (checks.excede > 0) warn(`${it.base}: conteúdo excede a arte em ~${checks.excede}px — reduza o texto ou edite o HTML.`, warnings);
      if (checks.imagensQuebradas.length) warn(`${it.base}: imagem(ns) quebrada(s): ${checks.imagensQuebradas.join(', ')}`, warnings);
      if (checks.logoContraste != null && checks.logoContraste < 1.8) {
        warn(`${it.base}: contraste da logo com o fundo baixo (${checks.logoContraste.toFixed(2)}:1) — confira a versão da logo.`, warnings);
      }

      await page.screenshot({
        path: pngPath,
        type: 'png',
        clip: { x: 0, y: 0, width: res.largura, height: res.altura }
      });
      pngCount++;
      console.log(`  ✓ PNG: ${it.base}.png`);
    } catch (err) {
      warn(`${it.base}: falha na renderização — ${err.message}`, warnings);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  return pngCount;
}

async function render() {
  console.log('Iniciando renderização...\n');
  console.log(`Projeto: ${PROJECT_DIR}`);
  console.log(`Fases: ${[CLI.html && 'HTML', CLI.png && 'PNG'].filter(Boolean).join(' + ')}\n`);

  validateProjectStructure();

  const warnings = [];
  const { posts, campaign } = loadPosts();
  setupDirs(campaign);
  console.log(`Encontradas ${posts.length} postagens expandidas`);

  const assets = discoverAssets();
  console.log('\nAssets descobertos:');
  console.log(`  Logo: ${assets.logoPreferido ? path.basename(assets.logoPreferido) : 'nenhuma'}`);
  console.log(`  Fotos (fundo "foto"): ${assets.photos.length}`);
  assets.photos.forEach((p) => console.log(`    - ${path.basename(p)}`));
  console.log(`  Fundos de imagem (modo legado): ${assets.backgrounds.length}`);

  const templates = discoverTemplates();
  console.log(`\nTemplates do projeto: ${templates.length}`);
  templates.forEach((t) => console.log(`    - ${t.name}`));

  const identFonts = parseIdentidade().fontes;
  const campaignFonts = (() => {
    const first = posts[0] && posts[0].direcao_visual && posts[0].direcao_visual.tipografia;
    return fontsFromCampaign(first);
  })();

  const bank = assets.photos.length > 0 ? [...BANK] : BANK.filter((id) => id !== 'foto');
  if (!assets.photos.length) {
    warn('Nenhuma foto em assets/ — variação "foto" desativada nesta campanha.', warnings);
  }
  console.log(`\nBanco de fundos ativo: ${bank.join(', ')}`);

  const usageBg = {};
  let capasComFoto = 0;
  const usageLegacyBg = {};
  let lastBg = null;
  let lastLegacyBg = null;
  let htmlCount = 0;
  const reportItems = [];
  let campaignRes = null;
  const identMd = fs.existsSync(IDENTIDADE_FILE) ? fs.readFileSync(IDENTIDADE_FILE, 'utf-8') : '';

  /* ---------- fase HTML ---------- */
  if (CLI.html) {
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const dv = post.direcao_visual || {};
      const warningsSlide = [];

      const res = resolveResolution(campaign, post);
      if (!campaignRes) campaignRes = res;

      const tpl = resolveTemplate(post, templates);

      const palResult = paletteFromCampaign(dv.paleta)
        || paletteFromIdentidade(identMd)
        || normalizePalette(null, 'padrão');
      const palette = palResult.paleta;

      const dvFonts = fontsFromCampaign(dv.tipografia) || { titulo: null, corpo: null };
      const fontes = {
        titulo: dvFonts.titulo || identFonts.titulo || campaignFonts?.titulo || null,
        corpo: dvFonts.corpo || identFonts.corpo || campaignFonts?.corpo || null
      };

      const tema = chooseTheme(post, i, tpl.temaHint);
      const papel = post.papel;
      const tamanho = tamanhoOf(post.titulo, post.texto, post.cta);

      // post-06_slide-09 (carrossel) / post-03 (avulso): acha-se a arte pelo nº do post
      const base = post.isCarousel
        ? `post-${padNumber(Math.floor(post.id / 100), 2)}_slide-${padNumber(post.slideIndexInPost + 1, 2)}`
        : `post-${padNumber(post.id, 2)}`;
      const pendente = !!dv.requer_revisao;
      const targetDir = pendente ? PENDENTES_DIR : HTML_DIR;
      const htmlPath = path.join(targetDir, `${base}.html`);

      const templateRaw = loadTemplate(tpl.path);

      let fundoId = '—';
      let desenhoId = '';
      let fotoAbs = null;
      let html;
      let bgFile = null;

      if (tpl.mode === 'cta') {
        html = applyReplacements(templateRaw, {
          '{{CAPTION}}': escapeHtml(post.legenda || ''),
          '{{HASHTAGS_TEXT}}': escapeHtml(post.hashtags.join(' '))
        });
        fundoId = 'cta-final';
      } else if (tpl.mode === 'bank') {
        const explicitFundo = typeof dv.fundo === 'string' && BANK.includes(dv.fundo)
          ? dv.fundo
          : (dv.fundo && typeof dv.fundo === 'object' && (dv.fundo.banco || dv.fundo.id)) || null;

        // modo do fundo (direcao_visual.fundo.modo): texturas (padrão), liso, foto-capa, desenho
        const modo = (dv.fundo && typeof dv.fundo === 'object' && dv.fundo.modo) || 'texturas';
        const postOrigem = post.isCarousel ? Math.floor(post.id / 100) : post.id;
        desenhoId = (dv.fundo && dv.fundo.desenho) || DESENHOS[(Math.max(postOrigem, 1) - 1) % DESENHOS.length];

        if (modo === 'liso') {
          fundoId = 'liso';
        } else if (modo === 'foto-capa') {
          if (papel === 'capa' && assets.photos.length) {
            fundoId = 'foto';
            fotoAbs = assets.photos[capasComFoto++ % assets.photos.length];
          } else {
            if (papel === 'capa') warn('Modo "foto-capa" sem fotos em assets/ — capa lisa.', warningsSlide);
            fundoId = 'liso';
          }
        } else if (modo === 'desenho') {
          fundoId = 'desenho';
        } else {
          // o fundo pedido vale para a capa; as páginas seguintes alternam
          const pedido = post.slideIndexInPost === 0 ? explicitFundo : null;
          if (pedido && !bank.includes(pedido)) {
            warn(`Fundo "${pedido}" não existe no banco — usando seleção automática.`, warningsSlide);
          }
          fundoId = pickFromBank(bank, lastBg, usageBg, bank.includes(pedido) ? pedido : null);
          if (fundoId === 'foto') {
            fotoAbs = assets.photos[i % assets.photos.length];
          }
        }
        lastBg = fundoId;

        const generated = generateBankHTML({
          template: templateRaw,
          post,
          tema,
          fundo: fundoId,
          papel,
          tamanho,
          palette,
          fontes,
          res,
          fotoAbs,
          desenho: desenhoId,
          alinhamento: dv.alinhamento === 'centro' ? 'centro' : 'esquerda',
          logoAbs: assets.logoPreferido,
          selo: pendente ? 'REVISÃO PENDENTE' : '',
          htmlDir: targetDir
        });
        html = generated.html;
      } else {
        const generated = generateLegacyHTML({
          template: templateRaw,
          post,
          tema,
          backgrounds: assets.backgrounds,
          lastBg: lastLegacyBg,
          usageBg: usageLegacyBg,
          palette,
          fontes,
          res,
          logoAbs: assets.logoPreferido,
          selo: pendente ? 'REVISÃO PENDENTE' : '',
          htmlDir: targetDir
        });
        html = generated.html;
        bgFile = generated.bgFile;
        if (bgFile) lastLegacyBg = bgFile;
        fundoId = bgFile || 'sólido';
      }

      const leftovers = leftoverPlaceholders(html);
      if (leftovers.length) {
        warn(`Placeholders sem preencher em ${base}.html: ${leftovers.join(', ')}`, warningsSlide);
      }

      fs.writeFileSync(htmlPath, html, 'utf-8');
      htmlCount++;

      const style = computeStyle(palette, tema);
      reportItems.push({
        base,
        fundo: fundoId,
        tema,
        papel,
        tamanho,
        pendente,
        res: `${res.largura}x${res.altura}`,
        resObj: res,
        bgHex: style.bg,
        isCarousel: !!post.isCarousel,
        postId: post.isCarousel ? Math.floor(post.id / 100) : post.id,
        postTitulo: String(post.titulo || '').replace(/\n/g, ' ').slice(0, 120),
        slideInPost: post.isCarousel ? post.slideIndexInPost + 1 : 1,
        slideTotal: post.slideTotal || 1
      });

      console.log(`\nProcessando ${base}: ${String(post.titulo || '').replace(/\n/g, ' ')}`);
      console.log(`  Template: ${tpl.name} (${tpl.mode})`);
      console.log(`  Fundo: ${fundoId} | Tema: ${tema} | Papel: ${papel} | Tamanho: ${tamanho}`);
      console.log(`  Resolução: ${res.largura}×${res.altura}`);
      if (pendente) {
        console.log(`  ⚠ requer_revisao — salvo em pendentes/ (PNG não gerado)`);
      }
      for (const w of warningsSlide) console.log(`  ⚠ ${w}`);
      warnings.push(...warningsSlide);
    }

    // fechamento da campanha: templates/fechamento.html do projeto, nas cores da campanha
    const tplFechamento = templates.find((t) => t.name === 'fechamento.html');
    if (tplFechamento && posts.length) {
      const dv = posts[0].direcao_visual || {};
      const res = campaignRes || resolveResolution(campaign, posts[0]);
      const palette = (paletteFromCampaign(dv.paleta)
        || paletteFromIdentidade(identMd)
        || normalizePalette(null, 'padrão')).paleta;
      const dvFonts = fontsFromCampaign(dv.tipografia) || { titulo: null, corpo: null };
      const fontes = {
        titulo: dvFonts.titulo || identFonts.titulo || null,
        corpo: dvFonts.corpo || identFonts.corpo || null
      };
      const { html, style } = generateBankHTML({
        template: loadTemplate(tplFechamento.path),
        post: { ...posts[0], titulo: '', texto: '', cta: '', legenda: '', hashtags: [], categoria: '' },
        tema: 'escuro',
        fundo: 'liso',
        papel: 'fechamento',
        tamanho: 'curto',
        palette,
        fontes,
        res,
        logoAbs: assets.logoPreferido,
        selo: '',
        htmlDir: HTML_DIR
      });
      const leftovers = leftoverPlaceholders(html);
      if (leftovers.length) warn(`Placeholders sem preencher em fechamento.html: ${leftovers.join(', ')}`, warnings);
      fs.writeFileSync(path.join(HTML_DIR, 'fechamento.html'), html, 'utf-8');
      htmlCount++;
      reportItems.push({
        base: 'fechamento',
        fundo: 'liso',
        tema: 'escuro',
        papel: 'fechamento',
        tamanho: 'curto',
        pendente: false,
        res: `${res.largura}x${res.altura}`,
        resObj: res,
        bgHex: style.bg,
        isCarousel: false,
        postId: 0,
        postTitulo: 'Fechamento da campanha',
        slideInPost: 1,
        slideTotal: 1
      });
      console.log('\nProcessando fechamento: templates/fechamento.html');
    } else {
      warn('Projeto sem templates/fechamento.html — campanha sem imagem de fechamento.', warnings);
    }

    writeGallery(reportItems, campaignRes || { largura: 1080, altura: 1350 });

    // manifesto para a fase PNG
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
      data: new Date().toISOString(),
      res: campaignRes || { largura: 1080, altura: 1350 },
      items: reportItems.map(({ base, fundo, tema, papel, tamanho, pendente, res, resObj, bgHex, isCarousel, postId, postTitulo, slideInPost, slideTotal }) => ({
        base, fundo, tema, papel, tamanho, pendente, res, resObj, bgHex, isCarousel, postId, postTitulo, slideInPost, slideTotal
      }))
    }, null, 2), 'utf-8');

    console.log('\n' + '='.repeat(50));
    console.log('Fase HTML concluída.\n');
    console.log('Arquivos gerados:');
    console.log(`  ✓ ${htmlCount} HTML`);
    console.log(`  ✓ galeria: ${path.join(HTML_DIR, 'index.html')}`);
    console.log(`  ✓ manifesto: ${MANIFEST_PATH}`);
    if (reportItems.some((it) => it.pendente)) {
      console.log(`  ⚠ pendentes em: ${PENDENTES_DIR}`);
    }
    if (!CLI.png) {
      console.log('\nPróximo passo: revisar os HTML e depois exportar PNG:');
      console.log(`  node scripts/render.js ${PROJECT_DIR} --png`);
      writeRelatorio(reportItems, warnings, campaignRes || { largura: 1080, altura: 1350 }, 0);
      console.log(`  ✓ relatório: ${RELATORIO_PATH}`);
      if (warnings.length) {
        console.log(`\nOcorrências (${warnings.length}):`);
        warnings.forEach((w) => console.log(`  ⚠ ${w}`));
      }
      return;
    }
  }

  /* ---------- fase PNG ---------- */
  let itemsForPng = reportItems;
  if (!CLI.html && CLI.png) {
    // só --png: carrega manifesto
    if (!fs.existsSync(MANIFEST_PATH)) {
      error(`Manifesto não encontrado: ${MANIFEST_PATH}\n  Rode a fase HTML primeiro.`);
    }
    const man = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    itemsForPng = man.items;
    campaignRes = man.res;
    console.log(`\nManifesto: ${itemsForPng.length} slides para exportar`);
  }

  console.log('\nExportando PNG...');
  const pngWarnings = [];
  const pngCount = await capturePngs(itemsForPng, pngWarnings);
  warnings.push(...pngWarnings);
  pngWarnings.forEach((w) => console.log(`  ⚠ ${w}`));

  writeRelatorio(itemsForPng, warnings, campaignRes || { largura: 1080, altura: 1350 }, pngCount);

  console.log('\n' + '='.repeat(50));
  console.log('Renderização concluída.\n');
  console.log('Arquivos gerados:');
  if (CLI.html) console.log(`  ✓ ${htmlCount} HTML`);
  console.log(`  ✓ ${pngCount} PNG`);
  console.log(`  ✓ galeria: ${path.join(HTML_DIR, 'index.html')}`);
  console.log(`  ✓ relatório: ${RELATORIO_PATH}`);
  if (itemsForPng.some((it) => it.pendente)) {
    console.log(`  ⚠ pendentes em: ${PENDENTES_DIR}`);
  }
  if (warnings.length) {
    console.log(`\nOcorrências (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }
}

// usado por scripts/escolher-estilo.js para calcular as cores como no PNG
module.exports = { paletteFromCampaign, computeStyle, fontStack };

if (require.main === module) {
  render().catch((err) => {
    console.error('Erro durante renderização:', err);
    process.exit(1);
  });
}
