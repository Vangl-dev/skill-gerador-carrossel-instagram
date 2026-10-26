# instagram-conteudo

Skill que planeja posts de Instagram (avulsos ou carrossel) a partir de um
tema e do perfil do cliente: texto separado por página, legenda, hashtags
e direção visual. O resultado vai para `campaign-data.json`, que a skill
`instagram-render` transforma em artes. As instruções para a IA estão em
`SKILL.md`.

## Como funciona

1. Você diz a pasta do cliente, o tema e quantos posts quer.
2. A skill lê o perfil (`identidade.md`) da pasta. Se faltar público, tom
   de voz ou regras do setor, ela pergunta uma vez e completa o arquivo.
   Cliente novo: ela faz as perguntas ou usa um resumo que você enviar.
3. Gera os posts variando o formato (mito ou verdade, checklist, passo a
   passo...) e evitando repetir o que já está em `historico-instagram.md`.
4. Mostra o texto por página com legenda, hashtags e títulos alternativos.
   Depois da sua aprovação, siga para a `instagram-render`.

## Uso sem IA

A escrita é feita pela IA. Sem ela, dá para preencher o
`campaign-data.json` à mão a partir do exemplo e rodar a `instagram-render`.

## Arquivos na pasta do cliente

```
<cliente>/
    identidade.md               perfil: visual + seção "Conteúdo"
    campaign-data.json          campanha atual (lida pelo render)
    historico-instagram.md      um registro por post já criado
    arquivo-conteudo/           campanhas anteriores (nada é apagado)
    campanhas/
        conteudo_<data>_<tema>.md   texto pronto para copiar
```

## Arquivos da skill

- `SKILL.md`: instruções para a IA.
- `references/modelo-identidade.md`: modelo do perfil do cliente.
- `references/regras-por-setor.md`: regras de publicidade por profissão
  (advocacia/OAB, medicina, odontologia, psicologia...).
- `references/formatos-de-post.md`: formatos de post para variar o conteúdo.
- `exemplo/escritorio-exemplo/`: cliente fictício com perfil e campanha
  prontos, para testar o render.
