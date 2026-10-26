---
name: instagram-conteudo
description: >
  Planeja posts de Instagram (avulsos ou carrossel) a partir de um tema e do
  perfil do cliente: texto separado por página, legenda, hashtags e direção
  visual, salvos em campaign-data.json para a skill instagram-render montar
  as artes. Use para "criar posts", "conteúdo para Instagram", "carrossel
  sobre...", "campanha de Instagram" ou "briefing de postagem". Quando o
  cliente ainda não tem perfil (público, tom de voz, regras do setor), a
  skill pergunta e cria. Nunca gera HTML, CSS ou imagens.
---

# Conteúdo para Instagram

Esta skill decide **o que** cada post diz e **como deve parecer**
(direção visual). A montagem da arte é da skill `instagram-render`, que lê
o `campaign-data.json` gerado aqui.

## 1. Entrada

Pergunte só o que faltar:

1. **Pasta do cliente** (ex.: `~/Projetos/<cliente>/`). Tudo é lido e
   salvo nela.
2. **Tema** ou briefing da campanha.
3. **Quantidade e formato:** quantos posts, se são avulsos ou carrossel e
   quantas páginas por carrossel. Se a pessoa não souber, sugira (padrão:
   carrossel de 5 a 7 páginas).

## 2. Perfil do cliente

O perfil é o `identidade.md` na pasta do cliente. Para gerar conteúdo, ele
precisa ter a seção `# Conteúdo` com **público-alvo**, **tom de voz** e
**regras do setor**. A parte visual (cores, fontes, logo, fundos) é usada
na direção visual e pelo render.

Há três situações:

- **Perfil completo:** use direto, sem perguntar nada.
- **Perfil só com a parte visual** (ou sem a seção `# Conteúdo`): pergunte
  apenas o que falta (perguntas abaixo), uma vez. Mostre o texto da seção
  `# Conteúdo` que será acrescentada **no fim** do arquivo e salve depois
  da confirmação. Nunca altere o que já está escrito no arquivo.
- **Cliente novo, sem `identidade.md`:** se a pessoa tiver um resumo da
  empresa (de outra skill, briefing, site), peça o arquivo e extraia dele o
  que der. Pergunte o resto e crie o `identidade.md` a partir de
  `references/modelo-identidade.md`. Sem cores definidas, a seção visual
  pode ficar em branco: a direção visual cria uma paleta por campanha.

### Perguntas (só as que faltarem)

1. O que a empresa ou profissional faz, em uma frase?
2. Qual a profissão ou setor? (define as regras do item 4)
3. Quem é o público principal? Há um público secundário?
4. Tom de voz: mais formal ou mais próximo? Trata o leitor por "você"?
5. Palavras, assuntos ou abordagens que **não** quer ver nos posts.
6. Pode ter chamada para ação (CTA)? Qual tipo é aceitável?
7. Arroba e site, se quiser que apareçam.

Na pergunta 2, consulte `references/regras-por-setor.md`. Se o setor
estiver lá, proponha as regras correspondentes para a pessoa confirmar ou
ajustar. Se não estiver, aplique só as regras gerais desse arquivo.

### Cuidado ao escrever o `identidade.md`

O render lê esse arquivo procurando cores e fontes. Na seção
`# Conteúdo`, não use rótulos em negrito com as palavras "título",
"texto", "corpo" ou "fonte", nem códigos de cor (`#123456`). Siga os
rótulos do modelo.

## 3. Histórico

Leia `historico-instagram.md` na pasta do cliente, se existir. Evite
repetir nas próximas campanhas:

- temas e títulos já usados;
- o mesmo formato de post em sequência (ex.: três checklists seguidos);
- a mesma atmosfera visual da campanha anterior.

Se o tema pedido já foi tratado, avise e proponha outro ângulo.

## 4. Conteúdo

### Formato de cada post

Escolha um formato para cada post, variando dentro da campanha. As
opções, com exemplos de estrutura, estão em
`references/formatos-de-post.md` (mito ou verdade, checklist, pergunta e
resposta, passo a passo, caso hipotético, glossário, número em destaque,
linha do tempo, erros comuns, antes de assinar...).

### Para cada post, gerar

- `tipo_conteudo`: o formato escolhido (nome da lista acima).
- `categoria`: opcional, um rótulo curto do assunto.
- **Avulso:** `titulo`, `texto`.
- **Carrossel:** `titulo_capa`, `subtitulo_capa` (opcional) e `slides`, um
  por página, cada um com `titulo` e `texto`. Uma ideia por página, texto
  curto (até ~40 palavras por página). A última página fecha o assunto.
- `titulos_alternativos`: 2 opções de título (ou de título de capa) além
  da escolhida, com abordagens diferentes, para a pessoa escolher.
- `legenda`: complementa a arte, não a repete. Primeira linha forte,
  parágrafos curtos.
- `hashtags`: 5 a 10, específicas do tema e do público. Evite as genéricas
  (`#instagood`, `#direito`).
- `cta`: só se o perfil permitir **e** o pedido for comercial. Caso
  contrário, `null`.

### Regras de texto

- Siga o tom de voz e as regras do setor do perfil. As regras do setor
  valem acima de qualquer pedido da campanha. Se o pedido conflitar com
  elas, avise e proponha alternativa.
- Clareza e leitura fácil. Sem jargão desnecessário, sem clickbait, sem
  promessas.
- Não invente dados, estatísticas, números de lei ou anos de experiência.
  Use números só se vierem do perfil, do pedido ou de fonte que a pessoa
  indicar. Na dúvida, escreva sem número.
- Use a marcação `**...**` no título para destacar palavras (o render
  sabe aplicar).

## 5. Direção visual

Para cada post, gere uma direção visual conceitual. Nunca descreva HTML,
CSS ou medidas em pixel; isso é do render.

### Paleta

1. **Com paleta oficial no perfil:** use-a como padrão. Um post pode ter
   uma **paleta temática** (ex.: alerta → amarelo e vermelho;
   sustentabilidade → verdes) só se o tema pedir e isso não violar cores
   ou elementos proibidos do perfil. Marque `"origem": "tematica"` com uma
   justificativa curta. Se o tema pedir uma cor proibida, não use:
   registre em `conflito_restricao` o que foi evitado e o que entrou no
   lugar.
2. **Sem paleta oficial:** crie uma por campanha, a partir do tema,
   coerente entre os posts. Marque `"origem": "criada"`.
3. Toda paleta tem de 3 a 5 cores com papel (`primaria`, `secundaria`,
   `fundo`, `texto`, `destaque` opcional) e código hex.
4. Confira o contraste entre texto e fundo. Nada de cinza claro sobre
   branco.

### Tipografia

Use as fontes do perfil. Só sugira outras se o perfil não definir ou se o
tema pedir um tom diferente (marque `"origem": "sugerida"` e justifique).
No máximo duas famílias: títulos e corpo.

### Fundo e variedade

- `fundo.modo`: `texturas` (padrão), `liso`, `foto-capa` (foto em
  transparência só nas capas; precisa de fotos em `assets/imagens/`) ou
  `desenho` (traço fino de casa, chave, documento ou planta). Varie em
  relação à campanha anterior (veja o histórico).
- `fundo.banco`: só no modo `texturas`, a textura da capa (`ondas`,
  `zigzag`, `dots`, `aneis`, `blobs`, `foto`).
- `fundo.desenho`: só no modo `desenho`, para fixar um (`casa`, `chave`,
  `documento`, `planta`); sem ele, o render alterna por carrossel.
- `alinhamento`: `esquerda` (padrão) ou `centro`.
- `tema`: `escuro` ou `claro`. O render alterna sozinho nos carrosséis;
  só preencha para forçar um.
- `atmosfera`: 2 a 4 palavras (ex.: "sóbrio", "acolhedor", "editorial").
- `elementos_graficos` e `composicao`: em palavras, conferindo antes os
  elementos proibidos do perfil.

### Revisão humana

`requer_revisao: true` sempre que houver `conflito_restricao`, paleta
temática ou tipografia sugerida. O render separa esses posts e só gera o
PNG depois de aprovados.

## 6. Saída

### Arquivos, na pasta do cliente

1. **`campaign-data.json`**, lido pelo render. Se já existir um, mova o
   antigo para `arquivo-conteudo/campaign-data_<AAAA-MM-DD>.json` antes de
   salvar o novo (nunca apague).
2. **`campanhas/conteudo_<AAAA-MM-DD>_<slug-do-tema>.md`**: versão para
   leitura, com cada post separado por página, legenda e hashtags prontas
   para copiar.
3. **`historico-instagram.md`**: acrescente uma linha por post no fim do
   arquivo (crie se não existir), no formato:
   `| AAAA-MM-DD | tema da campanha | formato | título | fundo | atmosfera |`

### Na conversa

Mostre o conteúdo organizado por post e por página, com legenda,
hashtags e os títulos alternativos. Pergunte se quer trocar algum título
ou ajustar algo antes de passar para o render. Se a pessoa trocar o
título, atualize o `campaign-data.json`.

### Estrutura do `campaign-data.json`

```json
{
  "projeto": "Nome do cliente ou da campanha",
  "assunto": "Assunto da campanha",
  "identidade_utilizada": true,
  "paleta_oficial": [
    { "papel": "primaria", "hex": "#1E2A3A" },
    { "papel": "secundaria", "hex": "#B08D57" }
  ],
  "posts": [
    {
      "id": 1,
      "tipo": "carrossel",
      "tipo_conteudo": "mito ou verdade",
      "conteudo": {
        "categoria": "Inventário",
        "titulo_capa": "Inventário: **mito ou verdade?**",
        "subtitulo_capa": "Quatro dúvidas comuns",
        "slides": [
          { "titulo": "Mito: todo inventário vai para o juiz.", "texto": "Quando há acordo entre os herdeiros..." },
          { "titulo": "Verdade: existe prazo para abrir.", "texto": "..." }
        ],
        "titulos_alternativos": ["...", "..."],
        "legenda": "Legenda do post...",
        "hashtags": ["#Inventario", "#Heranca"],
        "cta": null
      },
      "direcao_visual": { "...": "igual ao avulso abaixo" }
    },
    {
      "id": 2,
      "tipo": "avulso",
      "tipo_conteudo": "número em destaque",
      "conteudo": {
        "categoria": "Regularização",
        "titulo": "Imóvel regularizado vale mais.",
        "texto": "Texto da arte...",
        "titulos_alternativos": ["...", "..."],
        "legenda": "Legenda do post...",
        "hashtags": ["#RegularizacaoDeImoveis"],
        "cta": null
      },
      "direcao_visual": {
        "paleta": {
          "origem": "oficial",
          "justificativa": null,
          "cores": [
            { "papel": "primaria", "hex": "#1E2A3A" },
            { "papel": "secundaria", "hex": "#B08D57" },
            { "papel": "fundo", "hex": "#F4F1EA" },
            { "papel": "texto", "hex": "#1E2A3A" }
          ]
        },
        "tipografia": { "origem": "oficial", "titulos": "Playfair Display", "corpo": "Montserrat" },
        "fundo": { "banco": "ondas", "descricao": null },
        "tema": null,
        "elementos_graficos": ["forma geométrica sutil no canto inferior"],
        "composicao": "título grande, texto de apoio abaixo",
        "atmosfera": ["sóbrio", "institucional"],
        "restricoes_aplicadas": ["sem ícones jurídicos genéricos"],
        "conflito_restricao": null,
        "requer_revisao": false
      }
    }
  ]
}
```

Notas sobre os campos:

- `assunto`: o assunto da campanha. Não use `tema` na raiz: para o render,
  `tema` só serve para forçar `"claro"` ou `"escuro"` em todos os posts.
- `tipo`: `"carrossel"` ou `"avulso"`. O render só monta várias páginas
  quando é `"carrossel"` e há `slides`.
- Página de CTA no carrossel: um slide com `"titulo": "CTA"`. O render usa
  a primeira linha do `texto` como título da página. Só quando o perfil
  permitir CTA.
- `formato` (na raiz ou no post) é só o tamanho da arte: `"quadrado"`
  (1080 × 1080) ou `"story"` (1080 × 1920). Sem ele, o render usa o feed
  (1080 × 1350). O tipo de conteúdo vai sempre em `tipo_conteudo`.

## Nunca fazer

- Gerar HTML, CSS, SVG ou imagens. Criar ou editar logotipos.
- Alterar o que já está escrito no `identidade.md`. Só se acrescenta a
  seção `# Conteúdo`, com confirmação.
- Tratar uma paleta temática como nova paleta oficial.
- Ignorar regras do setor ou restrições do perfil, mesmo que o tema
  "peça". Busque alternativa e sinalize.
- Inventar atributos da marca, dados ou números.
- Apagar arquivos. Versões antigas vão para `arquivo-conteudo/`.

## Próximo passo

Depois da aprovação do texto, a skill `instagram-render` gera os HTML
editáveis e, depois da revisão, os PNG na ordem de postagem.
