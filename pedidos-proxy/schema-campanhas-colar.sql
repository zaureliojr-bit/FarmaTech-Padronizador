CREATE TABLE IF NOT EXISTS campanhas (
    id          TEXT PRIMARY KEY,
    nome        TEXT NOT NULL,
    canal       TEXT NOT NULL DEFAULT 'outro',
    gasto       REAL NOT NULL DEFAULT 0,
    ativa       INTEGER NOT NULL DEFAULT 1,
    criado_em   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS campanha_dia (
    dia         TEXT NOT NULL,
    campanha    TEXT NOT NULL,
    visitas     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, campanha)
);
CREATE INDEX IF NOT EXISTS idx_campanha_dia ON campanha_dia (dia);
CREATE TABLE IF NOT EXISTS pedido_campanha (
    ref         TEXT PRIMARY KEY,
    campanha    TEXT NOT NULL,
    quando      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pedido_campanha ON pedido_campanha (campanha);
