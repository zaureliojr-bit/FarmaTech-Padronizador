# Plataforma multiloja — um domínio, várias farmácias

Desenho do "Caminho B": sair de um site por farmácia para uma plataforma
onde a loja é **dado**, não implantação.

Escrito a partir do levantamento do `pedidos-proxy` atual (23 handlers,
8 tabelas) e do que o Farmatch faz hoje, medido em outubro de 2026.

---

## 1. O que decide o prazo

A parte que todo mundo imagina ser o trabalho — acrescentar `loja_id` nas
consultas — é a mais mecânica. O que decide o prazo são três coisas que
não aparecem num diagrama:

| | Por quê |
|---|---|
| **Três chaves primárias erradas** | `promocoes`, `clientes` e `pedidos` têm chave global. Duas lojas colidem. O SQLite não altera chave primária: é recriar tabela e migrar dado. |
| **Renderização no servidor** | Hoje somos estáticos. Sem servidor não há como a mesma rota responder com o preço de outra loja. |
| **Senha por loja** | Hoje é uma `PAINEL_KEY` global. Numa plataforma, isso significa que o dono da loja B vê o faturamento da loja A. |

As três são pré-requisito. Nenhuma é opcional, e nenhuma é cara — mas
pular qualquer uma dá um sistema que *parece* funcionar com uma loja e
vaza dado com duas.

---

## 2. A tabela `lojas`

É o registro central. Tudo que hoje está escrito no `index.html` vira
linha aqui.

```sql
CREATE TABLE IF NOT EXISTS lojas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    -- o que aparece na URL: /drogaria-mais-barato
    slug          TEXT NOT NULL UNIQUE,
    nome          TEXT NOT NULL,
    ativa         INTEGER NOT NULL DEFAULT 1,

    -- Identificação legal. NÃO é enfeite de rodapé: cada farmácia tem o
    -- seu CNPJ, o seu farmacêutico responsável e a sua autorização da
    -- ANVISA, e a página tem de mostrar a do dono daquela loja. Mostrar
    -- a errada não é bug de exibição, é problema de fiscalização.
    cnpj          TEXT NOT NULL,
    razao_social  TEXT NOT NULL,
    farmaceutico  TEXT NOT NULL,
    crf           TEXT NOT NULL,
    autorizacao   TEXT,                    -- processo ANVISA
    registro_ms   TEXT,

    -- Endereço e geo: alimentam o rodapé, o cálculo de frete e o
    -- JSON-LD de Pharmacy, que é o que faz cada loja ter entidade
    -- local própria no Google dentro do domínio compartilhado.
    endereco      TEXT NOT NULL,
    bairro        TEXT,
    cidade        TEXT NOT NULL,
    uf            TEXT NOT NULL,
    cep           TEXT NOT NULL,
    latitude      REAL,
    longitude     REAL,

    whatsapp      TEXT NOT NULL,           -- só dígitos, com 55
    telefone      TEXT,
    email         TEXT,

    -- Operação: o que hoje está fixo no script.js
    raio_entrega_km   REAL NOT NULL DEFAULT 8,
    frete_base        REAL NOT NULL DEFAULT 0,
    frete_por_km      REAL NOT NULL DEFAULT 0,
    frete_gratis_acima REAL,
    catalogo_url      TEXT NOT NULL,       -- produtos.json daquela loja
    logo_url          TEXT,
    cor_tema          TEXT DEFAULT '#26247B',

    criado_em     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lojas_slug ON lojas (slug) WHERE ativa = 1;

-- Horário por dia da semana, uma linha por dia. Em tabela separada
-- porque farmácia tem horário diferente em sábado, domingo e feriado, e
-- sete colunas numa linha só não cabem a loja que fecha no almoço.
CREATE TABLE IF NOT EXISTS lojas_horario (
    loja_id    INTEGER NOT NULL,
    dia        INTEGER NOT NULL,      -- 0=domingo … 6=sábado
    abre       TEXT,                  -- "08:00"; nulo = fechado
    fecha      TEXT,
    PRIMARY KEY (loja_id, dia),
    FOREIGN KEY (loja_id) REFERENCES lojas (id) ON DELETE CASCADE
);
```

Esse `lojas_horario` é o que vira `OpeningHoursSpecification` no JSON-LD
— o Farmatch tem os sete, um por dia.

---

## 3. O problema que não é coluna: as chaves primárias

Acrescentar `loja_id` resolve as consultas. **Não** resolve as colisões.
Olhando o schema de hoje:

```sql
CREATE TABLE promocoes (
    codigo  TEXT PRIMARY KEY,   -- ⚠️ colide
    ...
CREATE TABLE clientes (
    telefone TEXT PRIMARY KEY,  -- ⚠️ colide
    ...
CREATE TABLE pedidos (
    ref     TEXT PRIMARY KEY,   -- ⚠️ colide (improvável, mas colide)
```

O que acontece com duas lojas:

- **`promocoes`**: as duas colocam o produto `1234` em oferta. O
  `ON CONFLICT(codigo) DO UPDATE` da loja B **sobrescreve o preço da
  loja A**. Silenciosamente. É o pior dos três, porque muda preço de
  venda de outra empresa.
- **`clientes`**: o mesmo cliente compra nas duas. O
  `ON CONFLICT(telefone)` soma o gasto das duas lojas numa linha, e cada
  dona vê o total da outra no painel.
- **`pedidos`**: o `ref` é sorteado, então a chance é baixa — mas quando
  bater, o pedido de uma loja some.

Isso não é teoria. Rodando o `schema.sql` de hoje num SQLite e simulando
duas lojas (`pedidos-proxy/prova-colisao-multiloja.cjs`):

```
=== promocoes: loja A poe o produto 1234 a R$ 10,00 ===
   [{"codigo":"1234","preco":10,"lote":"loja-A-outubro"}]
=== agora a loja B poe o MESMO produto a R$ 25,00 ===
   [{"codigo":"1234","preco":25,"lote":"loja-B-outubro"}]
   linhas na tabela: 1 (esperado 2, uma por loja)
   >>> o preco da loja A virou R$ 25.00 e o lote dela sumiu: loja-B-outubro

=== clientes: mesmo telefone compra nas duas lojas ===
   {"telefone":"11988887777","pedidos":2,"total_gasto":150}
   >>> as duas donas veem 2 pedidos e R$ 150.00 — a soma das duas lojas
```

Repare no segundo caso: o `ON CONFLICT` de `clientes` faz
`total_gasto = clientes.total_gasto + excluded.total_gasto`. Ele não
sobrescreve — **soma**. Cliente que gastou R$ 100 na loja A e R$ 50 na
loja B aparece com R$ 150 no painel das duas.

A correção é chave composta:

```sql
PRIMARY KEY (loja_id, codigo)     -- promocoes
PRIMARY KEY (loja_id, telefone)   -- clientes
PRIMARY KEY (loja_id, ref)        -- pedidos
```

E o `ON CONFLICT` de cada `INSERT` muda junto:
`ON CONFLICT(loja_id, codigo)`. Esquecer isso é o mesmo bug com outra
roupa.

**O SQLite não altera chave primária com `ALTER TABLE`.** A migração é:
criar a tabela nova, copiar com `loja_id` da loja atual, apagar a velha,
renomear. Para o nosso banco, que já tem pedidos de verdade, isso é
migração com dado em produção — tem de ser ensaiada num banco de teste
antes, e feita com a loja fechada.

As outras cinco tabelas (`pedido_itens`, `buscas`, `banners`,
`encartes`, `encarte_paginas`) têm `id AUTOINCREMENT`, então basta
acrescentar a coluna e o índice.

---

## 4. Autenticação por loja

Hoje: uma `PAINEL_KEY` em variável de ambiente, comparada com `===`.
Isso não estica para N lojas — e guardar N senhas em texto no banco
trocaria um problema por outro pior.

**A senha vira hash no banco, com sal por loja:**

```sql
CREATE TABLE IF NOT EXISTS lojas_acesso (
    loja_id    INTEGER PRIMARY KEY,
    -- SHA-256 de (sal + senha), em hexa. O Workers tem Web Crypto
    -- nativo, então não entra dependência nova.
    hash       TEXT NOT NULL,
    sal        TEXT NOT NULL,
    trocada_em INTEGER NOT NULL,
    FOREIGN KEY (loja_id) REFERENCES lojas (id) ON DELETE CASCADE
);
```

O sal por loja é o que impede que duas lojas com a mesma senha tenham o
mesmo hash — sem ele, quem vê o banco descobre quais lojas repetiram
senha e quebra todas de uma vez.

**Qual loja está entrando?** Pelo caminho do painel, não por adivinhação:

```
drogaria-site.pages.dev/painel/drogaria-mais-barato
```

A loja vem do caminho e a senha é digitada. Assim a busca no banco é uma
só, pelo índice do slug, e a comparação de hash é uma. A alternativa —
procurar a senha digitada entre todas as lojas — obrigaria a comparar
contra cada hash, e aí o sal por loja deixaria de funcionar.

Vantagem de operação: cada cliente recebe o endereço do painel dele.
"Seu painel é `/painel/sua-loja`" é mais simples de explicar que um
seletor de loja na tela de login.

**O limite de tentativas continua por IP, e só por IP.** Se fosse por
`(IP, loja)`, quem ataca ganharia cinco tentativas novas a cada loja que
escolhesse — com 30 lojas, 150 tentativas em vez de 5. Por IP, o
orçamento é um só, não importa quantas portas ele teste. A tabela
`tentativas_painel` que já existe serve sem mudança.

**Endurecimento que vale a fase 2:** hoje a senha vai no cabeçalho de
*toda* chamada, e o painel chama rota protegida a cada 30 segundos. Está
sob TLS, então não é vazamento — mas trocar a senha por um token de
sessão curto logo no login reduz a exposição e, mais importante, permite
**revogar acesso** sem obrigar a loja a trocar de senha. Numa plataforma
com clientes, isso deixa de ser luxo.

---

## 5. Onde o `loja_id` entra

São 23 handlers. O inventário medido, agrupado pelo que cada um precisa:

### Rotas públicas — a loja vem da URL

| Handler | Tabelas | De onde vem a loja |
|---|---|---|
| `tratarNovoPedido` | pedidos, pedido_itens, clientes | corpo do pedido (`loja`) |
| `tratarNovaBusca` | buscas | corpo |
| `tratarBannersPublicos` | banners | `?loja=` |
| `tratarPromocoesPublicas` | promocoes | `?loja=` |
| `tratarEncartePublico` | encartes, encarte_paginas | `?loja=` |

### Rotas do painel — a loja vem de quem autenticou

As 18 restantes (`tratarFila`, `tratarResumo`, `tratarClientes`,
`tratarPedido`, `tratarStatus`, e todas as de banner, promoção e
encarte) **não devem aceitar a loja como parâmetro**. A loja sai da
autenticação.

Isso é a regra mais importante do documento. Se `tratarFila` aceitasse
`?loja=`, a dona da loja A autenticada poderia pedir
`/fila?loja=drogaria-b` e ler a fila da concorrente. O parâmetro é o
vetor; a autenticação é a fonte.

### A forma concreta

O portão que já existe passa a devolver a loja em vez de `null`:

```js
/* Hoje devolve null quando pode passar. Passa a devolver a loja, e aí
   o loja_id nunca vem de parâmetro em rota de painel — vem de quem
   provou a senha. */
async function autenticarLoja(request, env, slug) {
    const ip = ipDeQuemChama(request);
    const linha = await lerTentativas(env, ip);
    const faltam = quantoFaltaDoBloqueio(linha);
    if (faltam > 0) return { recusa: json({ erro: `Tentativas demais…` }, 429, …) };

    const loja = await env.DB.prepare(
        `SELECT l.id, l.slug, l.nome, a.hash, a.sal
           FROM lojas l JOIN lojas_acesso a ON a.loja_id = l.id
          WHERE l.slug = ?1 AND l.ativa = 1`
    ).bind(slug).first();

    const senha = request.headers.get("X-Painel-Key") || "";
    if (!loja || !(await conferirHash(senha, loja.sal, loja.hash))) {
        await registrarErro(env, ip, linha);
        return { recusa: json({ erro: "Não autorizado." }, 401) };
    }
    if (linha) await limparTentativas(env, ip);
    return { loja };
}
```

E cada handler de painel recebe a loja, em vez de ler o request:

```js
// antes
async function tratarFila(request, env) {
    … `WHERE status IN ('novo','separando','receita-ok')` …

// depois
async function tratarFila(request, env, loja) {
    … `WHERE loja_id = ?1 AND status IN ('novo','separando','receita-ok')` …
```

Passar a loja como **argumento obrigatório** é de propósito: um handler
novo que esqueça de usá-la fica visível na assinatura, e não escondido
dentro de uma consulta.

### Como garantir que nenhuma consulta escapou

Uma consulta sem `loja_id` não dá erro — devolve o dado de todas as
lojas. É o bug que não aparece em teste com uma loja só. Duas defesas:

1. **Teste com duas lojas sempre.** Cadastrar loja A e loja B no banco
   de teste, pôr dado nas duas, e todo teste de painel confere que a
   resposta da A não tem nada da B. É o único teste que pega isso.
2. **Varredura no commit.** Toda consulta às 8 tabelas com inquilino tem
   de citar `loja_id`. Dá para conferir com `grep` no código antes de
   publicar.

---

## 6. Os arquivos no R2

Hoje as chaves são `banner/<timestamp>-<aleatorio>.png`. Com várias
lojas, viram:

```
<slug-da-loja>/banner/<timestamp>-<aleatorio>.png
<slug-da-loja>/encarte/<timestamp>-<aleatorio>.png
```

E a rota que serve o arquivo confere que o prefixo é da loja pedida. Sem
isso, a loja A adivinharia o nome do encarte da loja B — improvável pelo
aleatório, mas é parede que custa uma linha.

**Atenção:** o R2 não é sistema de arquivos, a chave é texto plano. A
validação de `PASTAS` que já existe continua necessária; o slug entra na
mesma validação, senão um slug com `..` ou `/` monta chave estranha.

---

## 7. O catálogo por loja

Hoje o `script.js` tem a URL fixa:

```js
const CATALOGO = "https://raw.githubusercontent.com/zaureliojr-bit/Produtos/…/produtos.json";
```

Passa a vir de `lojas.catalogo_url`. Cada farmácia publica o seu
`produtos.json` pelo `publish-proxy`, e o que muda é o repositório ou o
caminho do arquivo.

**Aqui está a nossa vantagem, e ela é grande.** O `imagens-proxy` indexa
imagem **por EAN** (`imagens.ean TEXT PRIMARY KEY`), e a tabela
`correcoes` guarda descrição e classe também por EAN. O EAN é universal:
é o mesmo código de barras na Dipirona da nossa loja e na da rede.

Medição do nosso catálogo hoje:

| | |
|---|---|
| Produtos | 6.855 |
| Com imagem | **6.632 (97%)**, todas no nosso R2 |
| Com EAN válido | 6.834 (100%) |
| Sem imagem, mas com EAN | 221 (localizáveis) |

Isso quer dizer que **quando a rede entrar, todo produto dela que
compartilhe EAN com o nosso já chega com imagem e descrição
padronizada** — sem trabalho nenhum. O acervo não é por loja, é por EAN,
então ele cresce a cada cliente e serve todos os outros.

É esse o ativo a mostrar pra rede, e é por isso que **copiar as imagens
do Farmatch não nos serve** (ver seção 10).

---

## 8. A renderização no servidor

É a peça que falta e a que mais rende, porque resolve três coisas de uma
vez:

1. **Multiloja.** A mesma rota tem de responder com o preço e o nome da
   loja certa. Sem servidor, não há como.
2. **Prévia no WhatsApp.** Hoje o link de produto mostra "Produto —
   Drogaria Mais Barato" porque o WhatsApp não executa JavaScript. Para
   quem vende por WhatsApp, isso custa venda agora.
3. **Google.** As 6.855 páginas servem título e descrição idênticos.

A peça é **Pages Functions**. Uma função por rota, lendo a loja do
caminho e devolvendo o HTML já com `<title>`, `og:image`, `canonical` e
JSON-LD preenchidos.

E a divisão de URL que o Farmatch usa, que vale copiar inteira:

| Papel | Rota | Canônica |
|---|---|---|
| Vitrine da loja | `/<slug-da-loja>` | si mesma, com `Pharmacy` JSON-LD daquela loja |
| Compra | `/loja/<slug>/produto/<nome>-<ean>` | a página de busca |
| Busca (sem loja) | `/produto/<nome>-<ean>` | si mesma, **sem preço nem vendedor** |

A terceira linha é a sacada. Se cada loja gerasse a sua página do mesmo
produto, N lojas dariam N páginas quase idênticas competindo entre si — o
Google trata como conteúdo duplicado e escolhe uma, ou nenhuma. Com uma
página canônica por produto para a busca e as variantes por loja fora do
índice, o problema não nasce.

---

## 9. O que a rede vai perguntar

Quem compra isso faz diligência. Vale ter a resposta pronta:

- **"Meus dados ficam separados dos das outras farmácias?"** Com o
  Caminho B, mesmo banco e isolamento por `loja_id`. É resposta honesta,
  mas é mais fraca que a do Caminho A, onde cada farmácia tem banco
  próprio. Se a rede for exigente nisso, vale oferecer banco dedicado
  para ela e plataforma compartilhada para as lojas pequenas.
- **"Quem vê o meu faturamento?"** Hoje: quem tem a senha. Com senha por
  loja e hash, só ela — e você, como operador. Diga isso explicitamente;
  é o tipo de coisa que, descoberta depois, quebra a confiança.
- **"E o meu farmacêutico responsável?"** Resolvido pelas colunas da
  seção 2, por loja.
- **"Se outra farmácia da plataforma fizer algo errado, me afeta?"** No
  domínio compartilhado, sim — a autoridade de busca é somada, e uma
  penalidade também. É o custo real do modelo e é melhor dizer antes.

---

## 10. Sobre copiar as imagens do Farmatch

Não vou fazer isso, e o motivo prático é mais forte que o jurídico.

**Não precisamos.** Já temos 6.632 imagens em R2 próprio, indexadas por
EAN, e 221 produtos faltando que têm EAN e são localizáveis pelos
proxies de Cosmos e Serper que já estão no repositório. Baixar as deles
não acrescenta cobertura — acrescenta imagem de procedência que não
controlamos, dentro do acervo que é justamente o nosso diferencial.

**E atrapalha a venda que você quer fazer.** O `robots.txt` deles
permite rastreamento, mas permissão de rastrear não é licença de uso de
imagem: a foto de embalagem é do fabricante ou de quem a produziu. Você
está entrando numa rede que vai fazer diligência, disputando com esse
mesmo fornecedor. Chegar lá com o acervo dele dentro do nosso produto é
exatamente o que transforma uma disputa comercial, que você pode ganhar,
num problema jurídico, que trava a venda.

**O caminho que acelera de verdade:** peça à rede a lista de EAN do
catálogo dela, hoje, antes de qualquer código. A ferramenta já está no
repositório:

```
node pedidos-proxy/cobertura-acervo.cjs <catalogo-da-rede.csv>
```

Aceita o `produtos.json` ou a exportação crua do PDV (acha a coluna do
EAN sozinha, ignora cabeçalho e descarta repetidos). Consulta o acervo
em lotes de 100 e responde com o número que interessa:

```
====================================================
JÁ TEMOS IMAGEM DE 250 DOS 310 PRODUTOS — 81%
====================================================
```

Ainda grava um `sem-imagem.txt` com os que faltam, que é a fila de
trabalho do padronizador.

Esse número é o argumento de venda. Se a cobertura der 80%, você mostra
à rede que 80% do catálogo dela já está pronto no primeiro dia — e
nenhuma tela convence tanto quanto isso. Só não dá para medir sem a
lista de EAN, então pedir essa lista é a coisa mais urgente da semana,
na frente de qualquer código.

---

## 11. Plano, e o que dá para vender antes de estar pronto

A ordem importa porque as duas primeiras fases **já servem a loja de
hoje**, e não são trabalho jogado à espera da plataforma.

### Fase 0 — o que está pendente e bloqueia tudo
Subir o worker com os dois limites (senha do painel e rotas abertas) e
rodar as tabelas no D1. Já está escrito, testado e commitado; falta
publicar. Não dá para levar a uma rede uma plataforma cuja senha não tem
limite de tentativas.

### Fase 1 — renderização no servidor, ainda com uma loja
Pages Functions, título e `og:image` por produto, `sitemap.xml`,
`robots.txt`, JSON-LD de `Pharmacy` e `Product`. Entrega valor imediato
(prévia no WhatsApp e Google) **e** é a fundação da plataforma. Se a
venda para a rede não acontecer, isso continua valendo.

### Fase 2 — a loja vira dado
Tabela `lojas` + `lojas_horario`, e o site passa a ler dela em vez do
HTML. Ainda com uma loja cadastrada. Nada muda para o cliente; muda que
a segunda loja passa a ser um `INSERT`.

### Fase 3 — isolamento
As três chaves primárias compostas, `loja_id` nas 8 tabelas, senha por
loja com hash, prefixo de loja no R2. **Com teste de duas lojas desde a
primeira linha.** É a fase que não pode ter pressa, porque é a que vaza
dado se sair errada.

### Fase 4 — segunda loja de verdade
Cadastrar uma loja da rede, de preferência uma, em piloto. A segunda
loja é que revela o que o desenho esqueceu.

### Fase 5 — painel de operador
Cadastrar loja, trocar senha, ver uso. Até aqui dá para fazer por SQL no
console do D1; a partir de três ou quatro lojas, não dá mais.

**O que vender antes da Fase 4:** a Fase 1 inteira é demonstrável numa
loja só. Preço, foto e nome aparecendo certo na prévia do WhatsApp, a
loja no Google com endereço e horário, o encarte do mês no ar — é isso
que a dona da rede vai olhar. A arquitetura multiloja é o que faz você
atender a décima loja sem contratar ninguém, mas não é o que fecha a
primeira venda.
