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

Oito passos. Sete são linha de banco e clique na Cloudflare — nenhum
deles cria site novo nem copia arquivo: a filial entra como linha, e o
site e o painel passam a atendê-la. O oitavo é o único que acontece na
loja, no PC onde o Farmax roda.

> **Antes de começar**, escolha o *apelido* dela — o `slug`. Só letra
> minúscula, número e hífen. Ele vai no endereço da vitrine
> (`/loja/<slug>`), **no domínio dela**
> (`<slug>.drogalink.com.br`), no nome do banco e no prefixo dos
> arquivos. Trocar depois é trabalhoso — e, depois que a farmácia
> imprimir o endereço no saco de remédio, é trabalhoso para ela
> também. Vale pensar dez segundos agora.

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

   > **Minúsculo, e não é o nome do passo 4.** São dois nomes
   > diferentes para a mesma coisa, e é aqui que se tropeça: o campo
   > *Name* do D1 só aceita minúscula, número, hífen e sublinhado, e
   > recusa `DB_FARMA_CENTRO` com um "Not valid" em vermelho.
   > `DB_FARMA_CENTRO` é o nome da VARIÁVEL do binding, no passo 4, onde
   > a maiúscula é obrigatória. Aqui vai `farmatech-` + o apelido da
   > filial.
2. Abra o **Console** dele e rode **os sete**, nesta ordem:

   | arquivo | o que ele liga |
   |---|---|
   | `pedidos-proxy/schema-colar.sql` | pedidos, clientes, banners, promoções, encartes, buscas |
   | `pedidos-proxy/schema-estoque-colar.sql` | a aba **Estoque**: ruptura, excesso e giro |
   | `pedidos-proxy/schema-reativacao-colar.sql` | a aba **Reativação** e a fila do agente de envio |
   | `pedidos-proxy/schema-cupons-colar.sql` | a aba **Cupons** e o campo de cupom no carrinho |
   | `pedidos-proxy/schema-funil-colar.sql` | o gráfico **Do visitante ao pedido**, nos Relatórios |
   | `pedidos-proxy/schema-campanhas-colar.sql` | a aba **Marketing**: o que anunciar e o que cada campanha vendeu |
   | `pedidos-proxy/schema-promo-quantidade-colar.sql` | as ofertas "leve 3 pague 2" e "3 por R$ 10" na aba Promoções |
   | `pedidos-proxy/schema-cupom-raio-colar.sql` | o campo **"Só até X km"** do cupom — "entrega grátis até 3 km" |
   | `pedidos-proxy/schema-banner-entrada-colar.sql` | o **aviso de entrada**: o banner que também aparece por cima da vitrine |

   Use sempre os arquivos terminados em **`-colar`**: o console do D1
   não aceita comentário nenhum, nem `--` nem `/* */`, e os `-colar`
   são os mesmos schemas sem eles.

   Os oito últimos são fáceis de esquecer porque a loja funciona sem
   eles — vende, recebe pedido, tudo normal. O que acontece é que as
   abas Estoque, Reativação, Cupons e Marketing abrem vazias, o funil
   dos Relatórios também, a oferta de quantidade não salva, o cupom com
   raio é recusado com instrução e o aviso de entrada não liga; e vazio
   não se distingue de "esta farmácia não tem ruptura" nem de "ninguém
   entrou no site". Rode os oito de uma vez.

   **Não** rode o `schema-lojas` nem o `schema-acesso` aqui — o cadastro
   de lojas é um só, e fica no banco principal.

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

## 7. O domínio dela

É o que se vende: a farmácia ganha um endereço com o nome dela, e o
cliente dela nunca vê o nome da plataforma.

Pages → **drogaria-site** → Custom domains → *Set up a domain*:

```
farma-centro.drogalink.com.br
```

Como o `drogalink.com.br` está na mesma conta Cloudflare, o DNS é criado
sozinho e o certificado sai em alguns minutos.

**Um por filial, à mão.** A Pages não aceita domínio curinga
(`*.drogalink.com.br`) — conferido na documentação. A alternativa seria
pôr um Worker na frente do site, cobrado por requisição, para economizar
dois cliques por cliente; não paga.

Para isso funcionar, o projeto precisa saber qual é o domínio da
plataforma. Uma vez só, não por filial — Pages → Settings → **Variables
and Secrets**:

- **`DOMINIO_PLATAFORMA`** = `drogalink.com.br`

Sem essa variável o padrão já é `drogalink.com.br`, mas deixe-a escrita:
o dia em que a marca mudar, é o único lugar a mexer.

O que responde no domínio dela:

| Endereço | Página |
|---|---|
| `farma-centro.drogalink.com.br/` | a vitrine **dela** |
| `.../produto/dipirona-7891106000888` | o preço **dela** |
| `.../carrinho.html`, encarte, CSS | iguais |

E as páginas dela são canônicas de si mesmas. Apontar a canônica para a
plataforma empurraria para o nosso domínio tudo que a farmácia construir
no Google — o contrário de dar um endereço a ela.

Quando ela quiser o domínio próprio (`farmaciadocentro.com.br`), é o
mesmo passo com outro nome: o site já está pronto para receber.

---

## 8. O PC da farmácia: o extrator

É o último passo e o único que acontece fora da Cloudflare — na máquina
onde o Farmax roda. Tudo acima é inútil sem ele: sem extração não há
catálogo, e sem catálogo a vitrine abre vazia.

Leve a pasta `firebird-extrator/instalador/` num pen drive, com o
`extrator.exe` já gerado dentro (ver `firebird-extrator/README.md` —
o `.exe` se gera uma vez, no seu PC, e serve para todas as lojas).

Dois cliques em `instalar.bat` e responda as perguntas. Três delas são
desta loja e não podem ser copiadas da anterior:

- **Número da filial** — o do Farmax dela (tabela `FILIAIS` no banco).
  Errado aqui, você publica o estoque de uma filial no site de outra.
- **`ESTOQUE_LOJA`** — o **apelido** da loja, o mesmo do endereço:
  `farma-centro`, de `farma-centro.drogalink.com.br`. Sem ele a
  fotografia de estoque entra sem dono.
- **Horário da tarefa** — de madrugada, para a extração não disputar o
  banco com o movimento do balcão.

As outras (endereço e chave dos workers) são as mesmas de sempre.

Antes de sair da loja, rode o `extrator.exe` uma vez na mão e leia o
log. A primeira linha diz a versão; o fim tem de falar de estoque. Se
disser que `ESTOQUE_URL` não está configurado, a aba Estoque do painel
dessa farmácia vai abrir vazia para sempre — e vazia não se distingue
de "não tem ruptura".

---

## Conferir se ficou de pé

```
https://farmatech-pedidos-proxy.zaureliojr.workers.dev/loja?slug=farma-centro
```

Deve responder com os dados e os horários dela. E a vitrine:

```
https://drogaria-site.pages.dev/loja/farma-centro
https://farma-centro.drogalink.com.br/
```

Os dois mostram a mesma vitrine. No segundo, o `rel=canonical` da página
tem de ser o endereço **dela** — se apontar para `drogaria-site.pages.dev`,
a variável `DOMINIO_PLATAFORMA` não está valendo.

No painel, entre com a sua chave de dono, abra Filiais e clique em
**Operar nesta**. A fila, os banners, as promoções e os encartes que
aparecerem são os dela — vazios, porque o banco é novo. Se aparecer
qualquer coisa da Mais Barato, pare: o binding está apontando para o
banco errado.

---

## O que ainda falta para a filial funcionar inteira

O catálogo dela já é **o dela**: a vitrine e a página de produto no
domínio da filial leem `produtos-farma-centro.json`, e o padronizador
publica nesse arquivo quando a extração é daquela loja. Enquanto esse
arquivo não existir, ela cai no `produtos.json` da casa — o que é o
comportamento desejado para uma filial da mesma rede, com a mesma tabela
de preços, e **não** é para uma farmácia de outro dono.

O que falta é a ponta de cima: **a fila de extração ainda é uma só**.
Quem roda o extrator no PC da farmácia publica no catálogo da loja
configurada no `.env` daquele PC. Ligar a fila à loja no banco é o que
ficou pendente da Fase 4 — e é o passo que exige mexer em cada PC.
