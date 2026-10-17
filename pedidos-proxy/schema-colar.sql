CREATE TABLE IF NOT EXISTS pedidos (
    ref           TEXT PRIMARY KEY,
    criado_em     INTEGER NOT NULL,
    cliente       TEXT NOT NULL,
    telefone      TEXT NOT NULL,
    entrega       TEXT NOT NULL,
    endereco      TEXT,
    pagamento     TEXT,
    subtotal      REAL NOT NULL DEFAULT 0,
    frete         REAL NOT NULL DEFAULT 0,
    total         REAL NOT NULL DEFAULT 0,
    tem_receita   INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'novo'
);
CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos (criado_em);
CREATE INDEX IF NOT EXISTS idx_pedidos_telefone ON pedidos (telefone);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos (status);
CREATE TABLE IF NOT EXISTS pedido_itens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ref          TEXT NOT NULL,
    ean          TEXT,
    codigo       TEXT,
    descricao    TEXT NOT NULL,
    qtd          INTEGER NOT NULL,
    preco_unit   REAL NOT NULL,
    total_item   REAL NOT NULL,
    FOREIGN KEY (ref) REFERENCES pedidos (ref) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_itens_ref ON pedido_itens (ref);
CREATE INDEX IF NOT EXISTS idx_itens_ean ON pedido_itens (ean);
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
CREATE TABLE IF NOT EXISTS buscas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    termo       TEXT NOT NULL,
    criado_em   INTEGER NOT NULL,
    resultados  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_buscas_data ON buscas (criado_em);
CREATE INDEX IF NOT EXISTS idx_buscas_termo ON buscas (termo);
CREATE TABLE IF NOT EXISTS banners (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    imagem      TEXT NOT NULL,
    alt         TEXT NOT NULL,
    link        TEXT,
    inicio      TEXT,
    fim         TEXT,
    ativo       INTEGER NOT NULL DEFAULT 1,
    ordem       INTEGER NOT NULL DEFAULT 0,
    criado_em   INTEGER NOT NULL,
    r2_chave    TEXT
);
CREATE INDEX IF NOT EXISTS idx_banners_ativo ON banners (ativo, ordem);
CREATE TABLE IF NOT EXISTS promocoes (
    codigo      TEXT PRIMARY KEY,
    preco       REAL NOT NULL,
    inicio      TEXT,
    fim         TEXT,
    ativo       INTEGER NOT NULL DEFAULT 1,
    lote        TEXT,
    criado_em   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promocoes_ativo ON promocoes (ativo);
CREATE INDEX IF NOT EXISTS idx_promocoes_lote ON promocoes (lote);
CREATE TABLE IF NOT EXISTS encartes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo      TEXT NOT NULL,
    inicio      TEXT,
    fim         TEXT,
    ativo       INTEGER NOT NULL DEFAULT 1,
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
CREATE TABLE IF NOT EXISTS tentativas_painel (
    ip             TEXT PRIMARY KEY,
    erros          INTEGER NOT NULL DEFAULT 0,
    ultimo         INTEGER NOT NULL,
    bloqueado_ate  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tentativas_ultimo ON tentativas_painel (ultimo);
CREATE TABLE IF NOT EXISTS limite_publico (
    chave     TEXT PRIMARY KEY,
    contagem  INTEGER NOT NULL DEFAULT 0,
    janela    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_limite_janela ON limite_publico (janela);
