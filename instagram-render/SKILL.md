---
name: instagram-render
description: >
  Utilize esta skill sempre que existir um arquivo campaign-data.json (ou,
  em projetos legados, posts.json) contendo conteúdo estruturado e
  direção visual para Instagram, e o objetivo for gerar HTML editável
  para revisão manual e, depois da aprovação, as artes finais em PNG.
  Acione também quando o pedido envolver "revisar antes de publicar",
  "editar a arte antes de exportar" ou "salvar os posts na pasta da
  campanha/cliente". Normalmente vem depois da skill instagram-conteudo,
  que gera o campaign-data.json.
---

# Instagram Renderer

## Objetivo

Esta skill é exclusivamente um renderizador.

Sua responsabilidade é transformar `campaign-data.json` em:

1. **HTML editável**, para revisão e ajuste manual antes da publicação.
2. **PNG final**, gerado somente depois que o HTML foi aprovado (ou não
   sinalizado como pendente de revisão).

Ela nunca cria conteúdo.

Ela nunca toma decisões criativas novas — ela aplica a direção visual
que já veio pronta em `campaign-data.json`.

Ela nunca modifica identidade visual.

Ela apenas interpreta os arquivos existentes e produz o resultado final.

---

# Entrada

Solicite apenas:

**Qual é a pasta do cliente?** (a mesma usada pela skill
`instagram-conteudo`)

Exemplo:

```
~/Projetos/<cliente>/
```

Após receber a pasta, localizar automaticamente:

```
identidade.md         (opcional, mas recomendado)
campaign-data.json          (fonte principal)
posts.json             (fallback legado, ver "Compatibilidade" abaixo)
assets/
templates/
```

Caso nenhum arquivo obrigatório de conteúdo exista (`campaign-data.json` nem
`posts.json`), interromper e informar exatamente qual recurso está
faltando.

### Compatibilidade com `posts.json` (legado)

Se só existir `posts.json` (sem direção visual embutida, formato da
skill `instagram-content` antiga), renderizar usando exclusivamente a
paleta/tipografia/template padrão definidos em `identidade.md`, como
antes. Nenhum post terá `requer_revisao` automático nesse modo, salvo se
o usuário pedir revisão manual explicitamente.

Se `posts.json` (ou o post) indicar `direcao_visual.template_sugerido`
apontando para um template customizado em `templates/`, entra no modo
legado de placeholders (ver Fluxo, passo 2). Fundos de imagem vêm da
seção `Fundo*` de `identidade.md` (arquivos em `assets/`; nomes com
`logo` são ignorados como fundo).

---

# Pasta de saída por cliente/campanha

Todo o resultado de uma renderização deve ficar isolado em uma pasta
própria dentro de `campanhas/`, nunca solto na raiz do projeto.

Nome da pasta:

```
campanhas/<slug-do-projeto>_<AAAA-MM-DD>/
```

- `slug-do-projeto`: derivado do campo `projeto` em `campaign-data.json`
  (minúsculas, sem acento, espaços viram hífen). Se não houver
  `campaign-data.json` (modo legado), usar o nome da pasta do projeto.
- `AAAA-MM-DD`: data da renderização.
- Se o usuário informar um nome de campanha específico (ex.: "campanha
  de outubro", "lançamento site"), usar `--nome "<nome>"` na CLI ou
  esse nome no lugar do slug do projeto.
- Se já existir uma pasta com o mesmo nome no mesmo dia, incrementar um
  sufixo (`_v2`, `_v3`...) em vez de sobrescrever.

## CLI

Os comandos rodam a partir da pasta desta skill. Na primeira vez, instalar
as dependências com `npm install` e `npx playwright install chromium`.

```bash
# fase 1 — gera HTML + galeria + manifesto, para (aguarda revisão)
node scripts/render.js <pasta-do-cliente>

# fase 2 — exporta PNG dos HTML revisados (usa manifest.json)
node scripts/render.js <pasta-do-cliente> --png

# tudo de uma vez (sem etapa de revisão intermediária)
node scripts/render.js <pasta-do-cliente> --all

# nome de campanha customizado
node scripts/render.js <pasta-do-cliente> --nome "campanha-outubro"
```

Flags: `--html` (só HTML, default), `--png` (só PNG), `--all` (ambos),
`--nome <texto>` (slug da pasta de campanha).

## Estrutura gerada

Nomenclatura:

- Carrossel: `post-06_slide-09` = post 6, slide 9 daquele carrossel
  (o slide recomeça em 01 a cada post; HTML e PNG).
- Post avulso: `post-03` (id do post, 2 dígitos).
- Fechamento: `fechamento`.
- Assim a ordem alfabética da pasta já agrupa tudo por post.

```
Projeto/

    identidade.md
    campaign-data.json  (ou posts.json)
    assets/
    templates/

    campanhas/
        <slug-do-projeto>_<AAAA-MM-DD>/

            html/
                post-01_slide-01.html
                post-01_slide-02.html
                post-02.html
                fechamento.html
                index.html        (galeria de revisão)

            output/
                post-01_slide-01.png
                post-01_slide-02.png
                post-02.png
                fechamento.png

            pendentes/
                post-03_slide-01.html  (posts com requer_revisao = true)

            relatorio.md
```

---

# Fluxo

Para cada objeto presente em `campaign-data.json` (ou `posts.json` no modo
legado):

1. Ler `conteudo` e `direcao_visual` do post.

2. Escolher o template.

   Padrão: o banco de variações `post-variations.html` (template da skill,
   ou cópia em `templates/post-variations.html` se existir no projeto).

   - `template_sugerido` = `post-dark.html` / `post-light.html` /
     `post-variations.html`: apenas dica de tema (escuro/claro); o banco
     continua sendo usado.
   - `template_sugerido` = outro `.html` existente em `templates/`
     (ex.: `<cliente>-default.html`): modo legado — placeholders clássicos
     (`{{TITLE}}`, `{{BODY}}`, `{{BACKGROUND}}`, `{{TEXT}}`, `{{ACCENT}}`,
     `{{FOOTER}}`, `{{HASHTAGS}}`, `{{LOGO}}`, `{{LOGO_FILTER}}`...).
   - `template_sugerido` = `cta-final.html`: template de encerramento.

3. Selecionar o fundo (somente modo banco).

   `direcao_visual.fundo.modo` define o tipo: `texturas` (padrão, regras
   abaixo), `liso` (só a cor), `foto-capa` (foto de `assets/imagens/` em
   tons de cinza, tingida pela paleta, só nas capas; internas lisas) ou
   `desenho` (`casa`, `chave`, `documento`, `planta`, um por carrossel,
   ou o fixado em `fundo.desenho`). `direcao_visual.alinhamento`:
   `esquerda` ou `centro`.

   No modo `texturas`:

   Banco: `ondas`, `zigzag`, `dots`, `aneis`, `blobs`, `foto`
   (`foto` sai do banco se não houver fotos em `assets/`).

   Regras:
   - nunca repetir o fundo do slide anterior no mesmo carrossel;
   - preferir o menos usado até aqui;
   - honrar `direcao_visual.fundo.banco` (ou `.id`), exceto se
     repetiria o anterior (aí alerta e escolhe outro);
   - papéis: 1º slide/avulso = `capa`, último = `fechamento`,
     meio = `conteudo` (intensidade de textura/foto varia por papel).

4. Preencher **apenas as variáveis CSS que o template já define**
   (ex.: `--cor-primaria`, `--cor-fundo`, `--fonte-titulo`) com os
   valores vindos de `direcao_visual.paleta` e
   `direcao_visual.tipografia`. Isso não é criar CSS novo — é
   parametrizar variáveis já existentes no template. Se o template não
   expõe uma variável para algo que a direção visual pede, ignorar esse
   ajuste e registrar no relatório (nunca escrever uma regra CSS nova
   para compensar).

5. Inserir no HTML:
   - título, texto, legenda, hashtags, CTA (somente se existir);
   - logo (via `assets/logo.png`, nunca caminho absoluto);
   - imagem/fundo, conforme `direcao_visual.fundo` (modo banco) ou
     `identidade.md` + `assets/` (modo legado).

6. Tema (modo banco): alterna por carrossel (`escuro`, `claro`, ...)
   começando em `escuro`; avulsos ficam `escuro`. Overrides:
   `direcao_visual.tema` ou `campaign.tema`; `alternar_tema: false`
   fixa o tema. `template_sugerido` `post-light.html` só define o
   tema base quando não há override.

7. Se `direcao_visual.requer_revisao` for `true`:
   - salvar o HTML em `pendentes/` em vez de `html/`;
   - adicionar um selo visível "REVISÃO PENDENTE" no próprio HTML
     (discreto, fora da área de exportação final, ex.: uma faixa fixa
     no topo);
   - **não gerar PNG** para esse post nesta etapa.

8. Se `requer_revisao` for `false` (ou ausente):
   - salvar normalmente em `html/`.

8a. **Fechamento (obrigatório em toda campanha):** depois dos slides,
   gerar `html/fechamento.html` a partir de `templates/fechamento.html`
   do projeto do cliente, com as cores e fontes da campanha (mesmas
   variáveis `{{COR_*}}`, `{{FONTE_*}}`, `{{LOGO}}` do banco). O render
   faz isso sozinho; o PNG sai como `output/fechamento.png` e é a última
   imagem de cada carrossel. Se o projeto não tiver
   `templates/fechamento.html`, avisar no relatório e perguntar ao
   usuário antes de seguir. O texto do fechamento pertence ao template
   do cliente.

9. Gerar `html/index.html`: uma galeria simples listando miniaturas/links
   para todos os HTML de `html/` (e, separadamente, os de `pendentes/`),
   para o usuário revisar tudo em lote no navegador antes de aprovar.

10. **Parar aqui e aguardar revisão do usuário.** Informar que os HTML
    estão prontos em `campanhas/<pasta>/html/` (e o que está pendente
    em `campanhas/<pasta>/pendentes/`) e perguntar se pode prosseguir
    para a exportação em PNG, ou se o usuário quer editar algo antes.

10a. **Escolha de cores e fontes (quando o usuário quiser variar):**
    `node scripts/escolher-estilo.js <pasta-do-cliente>` gera
    `html/escolher-estilo.html`, com páginas reais da campanha e o
    catálogo de `templates/estilos.json`. O usuário escolhe e informa a
    escolha (rodapé da página). Aplicar a paleta (`cores`) e as fontes
    escolhidas em `direcao_visual` de todos os posts do
    `campaign-data.json`, com `"origem": "escolhida"`, e regerar o HTML
    (passo 1 em diante). A escolha do usuário é a aprovação: não marcar
    `requer_revisao`. Esta é a única edição permitida no
    `campaign-data.json`, e só por pedido do usuário.

11. Somente após confirmação do usuário: rodar a fase PNG
    (`node scripts/render.js <pasta-do-cliente> --png`), que abre cada HTML de `html/`
    com Playwright, captura screenshot e salva em `output/`. O
    manifesto `manifest.json` (gerado na fase HTML) lista os slides e
    resoluções — a fase PNG **não regenera HTML** (edições manuais são
    preservadas).

12. Ao final, gerar/atualizar `relatorio.md` na pasta da campanha
    (ver seção Relatório).

---

# Revisão e edição manual

Esta é a principal mudança de fluxo em relação à versão anterior: nada
vai direto para PNG.

- O HTML gerado é a **versão editável da arte**. Ele deve abrir
  normalmente em qualquer navegador, ter `overflow:auto` e preservar a
  estrutura completa da página, para que o usuário possa:
  - abrir em um editor de código e ajustar texto/cores diretamente no
    HTML;
  - abrir no navegador, usar as ferramentas de desenvolvedor para
    ajustes finos e depois copiar o HTML ajustado de volta para o
    arquivo, se desejar.
- Depois de qualquer edição manual no HTML, basta rodar novamente a
  etapa de captura (passo 11) sobre os arquivos já editados — a skill
  não deve sobrescrever HTML que o usuário já revisou, a menos que
  explicitamente solicitado ("regerar tudo do zero").
- Posts em `pendentes/` só saem de lá quando o usuário aprovar
  manualmente (ex.: "aprovar post 3", "mover pendentes para html/"). A
  skill nunca aprova sozinha.

## Sobre exportar para Canva/Inkscape

- **Inkscape (SVG):** quando o template tiver uma versão `.svg`
  equivalente (opcional, ver `templates/<nome>.svg`), a skill pode
  preencher essa versão SVG com o mesmo conteúdo/variáveis e salvá-la
  junto ao HTML em `html/00X.svg`. SVG abre nativamente no Inkscape,
  Illustrator e Figma como objetos editáveis (texto, formas, cores).
  Isso só funciha se o template SVG existir — a skill nunca converte
  HTML/CSS em SVG automaticamente, pois efeitos como sombras e
  gradientes complexos não convertem de forma confiável.
- **Canva:** não existe forma confiável de gerar um arquivo `.canva`
  editável sem usar a API oficial da Canva (Canva Connect API), que
  exige credenciais e integração própria — fora do escopo desta skill
  baseada em arquivos locais. Se o cliente precisar editar no Canva,
  a alternativa prática é: exportar o PNG em alta resolução e importar
  como imagem de fundo no Canva, ou usar o SVG (quando disponível) via
  "Importar arquivo".

---

# Templates

Os templates são reutilizáveis.

Nunca modificá-los.

Nunca sobrescrevê-los.

Nunca criar novos templates.

Nunca salvar HTML soltos fora de `campanhas/<pasta>/html/` ou
`.../pendentes/`.

## Banco de fundos (template padrão)

O template padrão é `post-variations.html` (versão embutida da skill;
se o projeto tiver `templates/post-variations.html`, essa cópia tem
prioridade). Ele é autocontido (1080 × 1350 parametrizável via
`{{LARGURA}}`/`{{ALTURA}}`) e expõe:

- 6 variações de fundo em versões clara/escura: `ondas`, `zigzag`,
  `dots`, `aneis`, `blobs`, `foto`;
- papéis `capa` / `conteudo` / `fechamento` (intensidade da textura e
  do overlay da foto);
- tamanhos `curto` / `medio` / `longo` (escala tipográfica);
- título com última linha em destaque (marcação `**...**` também
  funciona; títulos de 1 linha não destacam);
- barra de acento antes do apoio, bloco CTA, logo no canto inferior
  esquerdo, selo de revisão (fora da área exportada).

Variáveis principais: `{{TEMA}}`, `{{FUNDO}}`, `{{PAPEL}}`,
`{{TAMANHO}}`, `{{TITLE}}`, `{{DESCRIPTION}}`, `{{CTA}}`, `{{LOGO}}`,
`{{FOTO_URL}}`, `{{COR_*}}`, `{{FONTE_*}}`, `{{LOGO_FILTER}}`,
`{{LARGURA}}`, `{{ALTURA}}`.

No modo legado (template customizado), `{{BACKGROUND}}` recebe um valor
(`--background: {{BACKGROUND}}` no CSS) ou uma declaração completa
(`background: ...;`), conforme o template.

---

# Renderização (PNG)

Renderizar utilizando Playwright, somente após a confirmação do passo 10.

Resolução (default **1080 × 1350**, feed 4:5):

| Tipo | Resolução |
|-------|-----------|
| Feed / padrão | 1080 × 1350 |
| Quadrado (`formato: quadrado` ou `1:1`) | 1080 × 1080 |
| Story (`formato: story` ou `9:16`) | 1080 × 1920 |

Override por post/campanha: `resolucao` (`"1080x1080"` ou
`{ largura, altura }`) ou `formato`. Se especificado em
`identidade.md`/`campaign-data.json`, esse valor tem prioridade sobre
o default.

Capturar apenas a área da arte. Sem redimensionamentos posteriores.

---

# Identidade Visual

Toda identidade visual pertence ao arquivo `identidade.md`.

Toda direção visual específica de cada post pertence a
`campaign-data.json` (`direcao_visual`).

Todos os recursos gráficos pertencem à pasta `assets/`.

O `identidade.md` também pode ter a seção `# Conteúdo` (público, tom de
voz, regras do setor), preenchida pela skill `instagram-conteudo`. Essa
seção não é usada aqui: o render só lê cores, fontes, logos e fundos.

Nunca:

- criar cores, fundos, bordas, sombras, gradientes ou ícones que não
  tenham vindo de `identidade.md` ou de `direcao_visual`;
- alterar espaçamentos definidos no template além do necessário para
  acomodar o conteúdo;
- alterar fontes fora do que `direcao_visual.tipografia` define;
- alterar logotipo.

Caso um recurso não exista (ex.: cor citada em `direcao_visual` mas
template não tem a variável correspondente): informar o erro/limite no
relatório. Nunca inventar um substituto.

---

# Logo

Utilizar exclusivamente `assets/logo.png` (ou a logo declarada em
`identidade.md`, se `assets/logo.png` não existir).

Nunca incorporar logotipos diretamente aos templates.

Nunca utilizar caminhos absolutos. Caminho relativo a partir da pasta
do HTML gerado.

O posicionamento (canto inferior esquerdo) e o filtro por tema
(`brightness(0)` no claro, `none` no escuro) pertencem ao template.

Caso o logotipo não exista: renderizar sem ele e informar no relatório.

---

# Texto

Inserir exatamente o conteúdo recebido em `conteudo`.

Nunca corrigir português, resumir, completar, reescrever, reorganizar,
alterar ordem, alterar hashtags ou alterar CTA.

O texto é considerado definitivo — qualquer alteração de texto acontece
por edição manual do usuário no HTML, não pela skill.

---

# Ajustes permitidos

São permitidos apenas ajustes de layout para acomodar o conteúdo:
reduzir fonte, aumentar altura útil, ajustar line-height, ajustar
margens, quebra automática, redistribuir blocos.

Nunca alterar o conteúdo para fazê-lo caber. O layout se adapta ao
conteúdo, nunca o contrário.

---

# CSS

O CSS pertence exclusivamente aos templates.

A skill nunca gera CSS novo — apenas preenche variáveis já existentes
no template com os valores vindos de `direcao_visual` (ver passo 4 do
Fluxo).

Nunca alterar permanentemente os templates. Os HTML gerados apenas
consomem os templates.

---

# Validação

Antes de gerar cada PNG, verificar:

✓ todo texto visível
✓ nenhum texto cortado (conteúdo dentro da arte)
✓ nenhuma imagem quebrada
✓ logotipo carregado (quando aplicável) e com contraste mínimo vs fundo
✓ resolução correta
✓ fontes carregadas
✓ arte completamente dentro da viewport
✓ nenhuma variável de `direcao_visual` ficou sem valor no template
✓ nenhum placeholder `{{...}}` residual no HTML
✓ fundos sem repetição consecutiva (modo banco)

Caso uma postagem apresente erro: registrar o erro e continuar com as
demais.

---

# Relatório

Ao finalizar cada etapa, informar de forma objetiva:

**Depois da geração de HTML (antes do PNG):**

```
HTML gerado em: campanhas/<pasta>/html/

✓ X posts prontos para revisão
⚠ X posts pendentes de revisão (motivo: conflito de restrição de cor / etc.) → campanhas/<pasta>/pendentes/

Abra campanhas/<pasta>/html/index.html para revisar tudo em lote.

Posso prosseguir para gerar os PNG finais, ou prefere revisar/editar antes?
```

**Depois da exportação em PNG:**

```
Renderização concluída.

Pasta: campanhas/<pasta>/

Arquivos gerados:
✓ X HTML
✓ X PNG

Ocorrências:
✓ Logo carregada  (ou ⚠ Logo não encontrada)
✓ Todas as imagens carregadas  (ou ⚠ Imagem ausente na postagem 3)
✓ Todas as variáveis de direção visual aplicadas  (ou ⚠ variável X ausente no template)
✓ Fundos sem repetição consecutiva

Pastas:
campanhas/<pasta>/html/
campanhas/<pasta>/output/
```

O `relatorio.md` gravado na raiz da campanha lista, por slide: arquivo,
fundo, tema, papel, tamanho e status — além das ocorrências e da
contagem HTML/PNG.

Não descrever cores, layout, tipografia, templates ou aparência em
prosa — os arquivos falam por si.

---

# Nunca fazer

Nunca criar conteúdo.

Nunca alterar textos, títulos, legendas, hashtags ou CTA.

Nunca criar ou remover CTA.

Nunca criar rodapés, slogans ou frases institucionais.

Nunca criar elementos gráficos que não vieram de `direcao_visual` ou
`identidade.md`.

Nunca substituir a logo.

Nunca utilizar imagens externas.

Nunca modificar identidade visual.

Nunca editar `campaign-data.json`, `posts.json` ou `identidade.md`.

Nunca alterar templates. Nunca criar templates novos.

Nunca utilizar caminhos absolutos. Nunca depender de recursos externos.

Nunca gerar PNG de um post sem passar pela etapa de revisão (passo 10).

Nunca sobrescrever um HTML já editado manualmente pelo usuário, salvo
pedido explícito.

Nunca aprovar sozinha um post marcado como `requer_revisao`.

---

# Princípio

Esta skill é um renderizador determinístico com um ponto de checagem
humana no meio do caminho.

Todo o conteúdo pertence a `campaign-data.json`. Toda a identidade visual
pertence a `identidade.md`. Toda a direção visual específica de cada
post pertence a `direcao_visual`. Toda a aparência final pertence aos
templates.

A única responsabilidade desta skill é produzir HTML editáveis, permitir
revisão humana antes de exportar, e então gerar os PNG finais —
preservando integralmente o conteúdo e a identidade visual definidos
anteriormente, e organizando tudo em uma pasta própria por
cliente/campanha.
