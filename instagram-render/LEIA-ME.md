# instagram-render

Transforma o `campaign-data.json` de um cliente (gerado pela skill
`instagram-conteudo`) em artes de Instagram: primeiro HTML editável, para
corrigir texto e conferir no navegador, depois PNG na ordem de postagem.
As instruções para a IA estão em `SKILL.md`.

## Instalar (uma vez)

```bash
npm install
npx playwright install chromium
```

## Uso sem IA

```bash
# 1. gera os HTML e a galeria de revisão
node scripts/render.js ~/Projetos/<cliente>

# 2. abra campanhas/<campanha>/html/index.html, revise e edite os HTML

# 3. exporta os PNG dos HTML revisados (não sobrescreve suas edições)
node scripts/render.js ~/Projetos/<cliente> --png
```

Para variar cores e fontes, depois do passo 1:

```bash
node scripts/escolher-estilo.js ~/Projetos/<cliente>
# abra campanhas/<campanha>/html/escolher-estilo.html e escolha
```

As opções ficam em `templates/estilos.json` (acrescente paletas e fontes lá).

`node scripts/render.js --help` mostra todas as opções.

## Pasta do cliente

```
<cliente>/
    identidade.md          cores, fontes, logo e fundos (e, opcional, a seção de conteúdo)
    campaign-data.json     conteúdo + direção visual (ou posts.json, formato antigo)
    assets/                logo.png, fotos (.jpg/.webp) e fundos
    templates/             opcional: templates próprios do cliente
        fechamento.html    imagem de fechamento, gerada em toda campanha com as cores dela
    campanhas/             criada pelo render, uma pasta por campanha
        <nome>_<AAAA-MM-DD>/
            html/          HTML editáveis + index.html (galeria)
            pendentes/     posts marcados com requer_revisao
            output/        PNG finais
            relatorio.md
```

## Formatos

| Formato | Resolução | Como pedir |
|---|---|---|
| Feed (padrão) | 1080 × 1350 | — |
| Quadrado | 1080 × 1080 | `"formato": "quadrado"` |
| Story | 1080 × 1920 | `"formato": "story"` |

## Arquivos

- `SKILL.md`: instruções para a IA.
- `scripts/render.js`: gera HTML, galeria e PNG.
- `scripts/escolher-estilo.js`: tela de escolha de cores e fontes.
- `templates/post-variations.html`: template padrão com o banco de fundos.
- `templates/estilos.json`: catálogo de paletas e pares de fontes.
