CREATE TABLE IF NOT EXISTS reativacao_bloqueio (
    telefone    TEXT PRIMARY KEY,
    motivo      TEXT,
    criado_em   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reativacao_fila (
    telefone    TEXT PRIMARY KEY,
    nome        TEXT,
    dias        INTEGER NOT NULL DEFAULT 0,
    mensagem    TEXT NOT NULL,
    situacao    TEXT NOT NULL DEFAULT 'espera',
    tentativas  INTEGER NOT NULL DEFAULT 0,
    pego_em     INTEGER,
    erro        TEXT,
    criado_em   INTEGER NOT NULL,
    enviado_em  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fila_situacao ON reativacao_fila (situacao, criado_em);
