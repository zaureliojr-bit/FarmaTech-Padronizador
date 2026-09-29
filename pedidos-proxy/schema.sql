-- Histórico de pedidos do site da Drogaria Mais Barato.
-- Rode isto uma vez no D1 (painel do Cloudflare -> D1 -> Console) antes
-- de usar o worker. Pode rodar de novo sem medo: tudo é IF NOT EXISTS.
--
-- Por que existe: até aqui o pedido ia para uma planilha com os itens
-- numa célula só, tipo "2x Dipirona [789...] | 1x Novalgina [789...]".
-- Dá para ler um pedido assim, mas não dá para somar: "quantas dipironas
-- eu vendi esse mês" exige quebrar texto. Aqui cada item é uma linha.

CREATE TABLE IF NOT EXISTS pedidos (
    ref           TEXT PRIMARY KEY,        -- o mesmo código que vai no WhatsApp
    criado_em     INTEGER NOT NULL,        -- epoch em milissegundos, UTC
    cliente       TEXT NOT NULL,
    telefone      TEXT NOT NULL,
    entrega       TEXT NOT NULL,           -- "Retirada" ou "Entrega"
    endereco      TEXT,
    pagamento     TEXT,
    subtotal      REAL NOT NULL DEFAULT 0,
    frete         REAL NOT NULL DEFAULT 0,
    total         REAL NOT NULL DEFAULT 0,
    -- pedido com medicamento que exige receita: a entrega só sai depois
    -- de a farmacêutica conferir. Fica no pedido para o painel conseguir
    -- separar o que está esperando receita.
    tem_receita   INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'novo'
);

CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos (criado_em);
CREATE INDEX IF NOT EXISTS idx_pedidos_telefone ON pedidos (telefone);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos (status);

-- Uma linha por produto vendido. É esta tabela que responde "produtos
-- mais vendidos" e "quanto saiu de cada item".
CREATE TABLE IF NOT EXISTS pedido_itens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ref          TEXT NOT NULL,
    ean          TEXT,
    codigo       TEXT,
    descricao    TEXT NOT NULL,
    qtd          INTEGER NOT NULL,
    preco_unit   REAL NOT NULL,
    -- preço x quantidade, gravado junto: o preço muda com o tempo, e o
    -- relatório de um pedido antigo tem que continuar batendo com o que
    -- o cliente pagou naquele dia.
    total_item   REAL NOT NULL,
    FOREIGN KEY (ref) REFERENCES pedidos (ref) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_itens_ref ON pedido_itens (ref);
CREATE INDEX IF NOT EXISTS idx_itens_ean ON pedido_itens (ean);

-- Quem já comprou, com o telefone como identidade. Não é cadastro de
-- marketing: é o resumo do que os pedidos já dizem, para o painel não
-- precisar recalcular tudo a cada abertura.
CREATE TABLE IF NOT EXISTS clientes (
    telefone         TEXT PRIMARY KEY,
    nome             TEXT NOT NULL,
    ultimo_endereco  TEXT,
    primeiro_pedido  INTEGER NOT NULL,
    ultimo_pedido    INTEGER NOT NULL,
    pedidos          INTEGER NOT NULL DEFAULT 0,
    total_gasto      REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_clientes_ultimo ON clientes (ultimo_pedido);

-- O que o cliente digitou na busca. Serve para duas perguntas que os
-- pedidos não respondem:
--   1. o que procuram muito (e a loja deve manter sempre em estoque)
--   2. o que procuram e NÃO acham (o que falta no catálogo)
-- A segunda é a mais valiosa: é uma venda que não aconteceu e que
-- ninguém veria olhando só o histórico de pedidos.
--
-- NÃO guarda quem buscou. Sem telefone, sem IP, sem identificador de
-- sessão — de propósito. Assim isto é estatística de loja, e não dado
-- pessoal: ninguém consegue reconstruir o que uma pessoa específica
-- procurou, nem cruzar com o cadastro de clientes.
CREATE TABLE IF NOT EXISTS buscas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    -- já chega normalizado do site: minúsculo e sem acento, para
    -- "Dipirona", "dipirona" e "DIPIRONA" somarem na mesma linha
    termo       TEXT NOT NULL,
    criado_em   INTEGER NOT NULL,       -- epoch em milissegundos, UTC
    -- quantos produtos a busca devolveu. Zero é o caso interessante.
    resultados  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_buscas_data ON buscas (criado_em);
CREATE INDEX IF NOT EXISTS idx_buscas_termo ON buscas (termo);

-- ===================================================================
-- Banners de promoção e de parceiros da home.
--
-- Começaram num arquivo JSON no repositório, editado à mão no GitHub.
-- Funcionava, mas só para quem sabe o que é um repositório: um erro de
-- vírgula derrubava a faixa inteira, e não havia como a loja conferir
-- antes de publicar. Aqui a loja mexe pelo painel, com formulário.
--
-- A tabela guarda só o endereço da imagem, nunca o arquivo. O arquivo
-- vive no R2, que é feito para isso; linha de banco com imagem dentro
-- fica lenta de ler e cara de servir a cada visita da home.
-- ===================================================================
CREATE TABLE IF NOT EXISTS banners (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    imagem      TEXT NOT NULL,           -- https://... (R2 ou externo)
    alt         TEXT NOT NULL,           -- o que a imagem diz, escrito
    link        TEXT,                    -- para onde o clique leva; vazio = não clicável
    -- aaaa-mm-dd, como TEXTO. Comparar data como texto evita o fuso:
    -- guardada como número, uma campanha que termina em 30/09 sumiria
    -- às 21h do dia 29 para quem está no Brasil.
    inicio      TEXT,                    -- vazio = vale desde já
    fim         TEXT,                    -- vazio = não expira
    ativo       INTEGER NOT NULL DEFAULT 1,
    ordem       INTEGER NOT NULL DEFAULT 0,   -- menor aparece primeiro
    criado_em   INTEGER NOT NULL,
    -- chave do arquivo no R2, quando a imagem foi enviada pelo painel.
    -- Guardada para o arquivo poder ser apagado junto com o banner, em
    -- vez de ficar ocupando o balde para sempre.
    r2_chave    TEXT
);

CREATE INDEX IF NOT EXISTS idx_banners_ativo ON banners (ativo, ordem);

-- ===================================================================
-- Promoções feitas pela loja, por cima do preço que vem da planilha.
--
-- O catálogo é reexportado do FarmaxPDV toda semana, e a reexportação
-- sobrescreve tudo. Se a promoção morasse no catálogo, ela sumiria na
-- próxima importação — que é justamente o que acontecia antes, com o
-- preço promocional vindo só da planilha.
--
-- Aqui ela é uma CAMADA. A planilha manda no preço normal; esta tabela
-- manda no preço promocional enquanto a promoção estiver valendo. Uma
-- reexportação não apaga nada daqui.
--
-- GUARDA O PREÇO FINAL, e não o percentual, de propósito. Guardando
-- percentual, um reajuste na planilha mudaria sozinho o valor que o
-- cliente paga, sem ninguém decidir. O percentual existe só na hora de
-- aplicar em lote, para calcular os preços — depois disso o que vale é
-- o número que a loja viu na tela.
-- ===================================================================
CREATE TABLE IF NOT EXISTS promocoes (
    codigo      TEXT PRIMARY KEY,        -- o mesmo código do produto no catálogo
    preco       REAL NOT NULL,           -- preço final da promoção
    inicio      TEXT,                    -- aaaa-mm-dd; vazio = já vale
    fim         TEXT,                    -- aaaa-mm-dd; vazio = não expira
    ativo       INTEGER NOT NULL DEFAULT 1,
    -- rótulo do lote, quando veio de uma aplicação em massa. Serve para
    -- desfazer tudo de uma vez: sem isso, uma promoção de 300 itens só
    -- se desfaz item por item.
    lote        TEXT,
    criado_em   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promocoes_ativo ON promocoes (ativo);
CREATE INDEX IF NOT EXISTS idx_promocoes_lote ON promocoes (lote);

-- ===================================================================
-- Encarte de promoções do mês.
--
-- É a peça que a loja já faz para o WhatsApp e para imprimir. Aqui ela
-- ganha um lugar no site, com prazo: o de outubro entra e sai sozinho,
-- sem ninguém lembrar de tirar o de setembro do ar — que é o jeito mais
-- comum de um encarte virar propaganda de preço vencido.
--
-- Uma linha por encarte; as páginas ficam na tabela ao lado. Encarte de
-- farmácia tem duas, quatro, oito páginas, e elas precisam de ordem.
-- ===================================================================
CREATE TABLE IF NOT EXISTS encartes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo      TEXT NOT NULL,           -- "Encarte de outubro", "Semana do bebê"
    inicio      TEXT,                    -- aaaa-mm-dd; vazio = já vale
    fim         TEXT,                    -- aaaa-mm-dd; vazio = não expira
    ativo       INTEGER NOT NULL DEFAULT 1,
    -- PDF opcional, para quem quiser baixar ou imprimir. As páginas em
    -- imagem continuam sendo o que aparece na tela: PDF no celular abre
    -- em visualizador de arquivo, e metade das pessoas desiste ali.
    pdf         TEXT,
    pdf_chave   TEXT,
    criado_em   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_encartes_ativo ON encartes (ativo);

CREATE TABLE IF NOT EXISTS encarte_paginas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    encarte_id  INTEGER NOT NULL,
    imagem      TEXT NOT NULL,
    r2_chave    TEXT,
    ordem       INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (encarte_id) REFERENCES encartes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paginas_encarte ON encarte_paginas (encarte_id, ordem);
