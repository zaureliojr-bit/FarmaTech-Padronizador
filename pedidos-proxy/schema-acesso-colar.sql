CREATE TABLE IF NOT EXISTS lojas_acesso (
    slug       TEXT PRIMARY KEY,
    hash       TEXT,
    sal        TEXT,
    banco      TEXT,
    prefixo_r2 TEXT,
    trocada_em TEXT
);
