CREATE TABLE IF NOT EXISTS cupons (
    codigo        TEXT PRIMARY KEY,
    tipo          TEXT NOT NULL,
    valor         REAL NOT NULL DEFAULT 0,
    minimo        REAL NOT NULL DEFAULT 0,
    teto          REAL NOT NULL DEFAULT 0,
    inicio        INTEGER,
    fim           INTEGER,
    limite_total  INTEGER NOT NULL DEFAULT 0,
    limite_pessoa INTEGER NOT NULL DEFAULT 1,
    usos          INTEGER NOT NULL DEFAULT 0,
    ativo         INTEGER NOT NULL DEFAULT 1,
    descricao     TEXT,
    criado_em     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cupons_ativo ON cupons (ativo);
CREATE TABLE IF NOT EXISTS cupom_usos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo    TEXT NOT NULL,
    telefone  TEXT NOT NULL,
    ref       TEXT NOT NULL,
    desconto  REAL NOT NULL DEFAULT 0,
    quando    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cupom_usos_codigo ON cupom_usos (codigo);
CREATE INDEX IF NOT EXISTS idx_cupom_usos_telefone ON cupom_usos (codigo, telefone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cupom_usos_ref ON cupom_usos (ref);
