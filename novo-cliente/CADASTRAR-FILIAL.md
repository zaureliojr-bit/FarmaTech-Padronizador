# Cadastrar uma filial nova

**Pelo painel, na aba Filiais.** Preencha o formulário, salve, e a tela
diz os dois passos que faltam na Cloudflare — e confere se você os fez
antes de deixar ligar a filial.

Este documento descreve o caminho manual, pelo console do D1. Ele
continua valendo para entender o que acontece por baixo, para corrigir um
cadastro torto e para quando a tela não estiver disponível.

## Por que dois passos continuam manuais

Criar o banco D1 e ligar o binding exigem a API da Cloudflare com um
token de conta. O token capaz de mexer em binding de worker é capaz de
**reescrever o próprio worker** — guardá-lo dentro dele é guardar, dentro
da casa, a chave que abre a casa. Dois cliques por cliente novo custam
menos que isso.

O que a tela faz, e vale mais do que automatizar: **confere**. Ela
pergunta ao worker se o banco existe, se está ligado, se tem as tabelas,
e — o mais importante — se ele não é o banco da farmácia original. Essa
última é a que impede o erro caro: um binding apontando para o banco
errado faria a filial nova mostrar os pedidos da primeira.

---

## O caminho manual, passo a passo

Seis passos. Nenhum deles cria site novo nem copia arquivo: a filial nova
entra como linha de banco, e o site e o painel passam a atendê-la.

> **Antes de começar**, escolha o *apelido* dela — o `slug`. Só letra
> minúscula, número e hífen. Ele vai no endereço da vitrine
> (`/loja/<slug>`), no nome do banco e no prefixo dos arquivos. Trocar
> depois é trabalhoso, então vale pensar dez segundos agora.

---

## 1. A farmácia, no cadastro

Console do D1, banco `farmatech-pedidos-db`. Troque os valores e rode:

```sql
INSERT INTO lojas (
    slug, nome, razao_social, cnpj,
    logradouro, numero, complemento, bairro, cidade, uf, cep,
    latitude, longitude,
    whatsapp, telefone,
    farmaceutico, crf, rotulo_responsavel, autorizacao, licenca_ms,
    raio_entrega_km, frete_gratis_acima, fuso, ativo
) VALUES (
    'farma-centro',
    'Farmácia do Centro',
    'Farmácia do Centro Ltda',
    '11.222.333/0001-44',
    'Avenida Getúlio Vargas', '1500', '', 'Centro',
    'Cuiabá', 'MT', '78005-370',
    -15.601411, -56.097892,
    '5565999887766', '+5565999887766',
    'Dr. João Pereira', '998877', 'Farmacêutico responsável',
    'Processo 00000.000000/2024-11', 'MS 1.23456-7',
    8, 0, 'America/Cuiaba', 0
);
```

Repare no `0` do fim: **`ativo = 0`**. A filial entra desligada, e nada
no site nem no painel a enxerga enquanto o cadastro não estiver completo.
Ligar é o último passo.

O `rotulo_responsavel` é como a pessoa se identifica — "Farmacêutico
responsável", "Farmacêutica responsável". Não é deduzido do nome, de
propósito: o resultado dessa dedução fica impresso no rodapé de todas as
páginas, ao lado do CRF dela.

O `fuso` importa se a filial for de outro estado: o indicador de
Aberto/Fechado usa o relógio **da loja**, não o de quem está olhando.

## 2. O horário

Uma linha por dia. Domingo é `0`, como no cadastro da Mais Barato:

```sql
INSERT INTO lojas_horario (slug, dia, abre, fecha) VALUES
    ('farma-centro', 0, '09:00', '13:00'),
    ('farma-centro', 1, '07:00', '22:00'),
    ('farma-centro', 2, '07:00', '22:00'),
    ('farma-centro', 3, '07:00', '22:00'),
    ('farma-centro', 4, '07:00', '22:00'),
    ('farma-centro', 5, '07:00', '22:00'),
    ('farma-centro', 6, '08:00', '20:00');
```

Fecha para almoço? São duas linhas no mesmo dia — a chave primária
inclui a hora de abertura justamente para isso:

```sql
INSERT INTO lojas_horario (slug, dia, abre, fecha) VALUES
    ('farma-centro', 1, '08:00', '12:00'),
    ('farma-centro', 1, '14:00', '19:00');
```

## 3. O banco de dados dela

**Este passo não é opcional.** Cada farmácia tem o banco dela: é o que
faz o pedido de uma não estar ao alcance do código que atende a outra —
não por disciplina de quem escreve a consulta, mas porque a conexão é
outra.

1. Cloudflare → **D1** → *Create database* → nome: `farmatech-farma-centro`
2. Abra o **Console** dele e rode o `pedidos-proxy/schema.sql`
   (é o schema de operação: pedidos, clientes, banners, promoções,
   encartes, buscas). **Não** rode o `schema-lojas` nem o
   `schema-acesso` aqui — o cadastro de lojas é um só, e fica no banco
   principal.

## 4. Ligar o banco ao worker

Workers → **farmatech-pedidos-proxy** → Settings → **Bindings** → Add →
**D1 database**:

- **Variable name:** `DB_FARMA_CENTRO`
- **D1 database:** `farmatech-farma-centro`

O nome da variável é livre, mas tem de bater com o que você vai gravar no
passo seguinte. A convenção é `DB_` + o slug em maiúsculas, com hífen
virando sublinhado.

Depois de adicionar o binding, **Deploy**.

## 5. O acesso da filial

De volta ao console do banco principal:

```sql
INSERT INTO lojas_acesso (slug, banco, prefixo_r2)
VALUES ('farma-centro', 'DB_FARMA_CENTRO', 'farma-centro');
```

- `banco` é o nome da variável do passo 4, escrito à mão e não deduzido
  do slug: deduzir faria uma loja renomeada apontar silenciosamente para
  outro banco.
- `prefixo_r2` é a pasta dos arquivos dela no R2 (banners e encartes).
  Use o próprio slug.

Senha **não** se cadastra por aqui. Ela entra pelo painel, na aba
Filiais, que calcula o hash e o sal — senha digitada em console de banco
fica no histórico do navegador e no log de quem administra.

## 6. Ligar a filial

Confira pela aba **Filiais** do painel: a linha dela deve mostrar o nome
do banco, e **não** "falta o banco próprio". Então:

```sql
UPDATE lojas SET ativo = 1 WHERE slug = 'farma-centro';
```

E, ainda na aba Filiais, cadastre a senha dela.

---

## Conferir se ficou de pé

```
https://farmatech-pedidos-proxy.zaureliojr.workers.dev/loja?slug=farma-centro
```

Deve responder com os dados e os horários dela. E a vitrine:

```
https://drogaria-site.pages.dev/loja/farma-centro
```

No painel, entre com a sua chave de dono, abra Filiais e clique em
**Operar nesta**. A fila, os banners, as promoções e os encartes que
aparecerem são os dela — vazios, porque o banco é novo. Se aparecer
qualquer coisa da Mais Barato, pare: o binding está apontando para o
banco errado.

---

## O que ainda falta para a filial funcionar inteira

O catálogo de produtos **ainda é um só**, compartilhado — o
`produtos.json` que o padronizador publica. Preço e estoque da filial
nova serão os da Mais Barato até a fila de extração passar a ser por
loja, que é o que ficou pendente da Fase 3 e é trabalho da Fase 4.

Para uma filial da mesma rede, com a mesma tabela de preços, isso pode
até ser o comportamento desejado. Para uma farmácia de outro dono, não é
— e vale saber disso antes de vender.
