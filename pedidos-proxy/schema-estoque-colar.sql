CREATE TABLE IF NOT EXISTS estoque_foto (
    ean         TEXT PRIMARY KEY,
    codigo      TEXT,
    descricao   TEXT,
    estoque     REAL NOT NULL DEFAULT 0,
    custo       REAL,
    preco       REAL,
    minimo      REAL,
    validade    TEXT,
    visto_em    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_foto_estoque ON estoque_foto (estoque);
CREATE TABLE IF NOT EXISTS estoque_mov (
    ean             TEXT NOT NULL,
    dia             TEXT NOT NULL,
    estoque_antes   REAL,
    estoque_depois  REAL NOT NULL,
    saida           REAL NOT NULL DEFAULT 0,
    entrada         REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (ean, dia)
);
CREATE INDEX IF NOT EXISTS idx_mov_dia ON estoque_mov (dia);
