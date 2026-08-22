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
