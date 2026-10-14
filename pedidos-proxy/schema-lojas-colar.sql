CREATE TABLE IF NOT EXISTS lojas (
    slug            TEXT PRIMARY KEY,
    nome            TEXT NOT NULL,
    razao_social    TEXT,
    cnpj            TEXT,
    logradouro      TEXT,
    numero          TEXT,
    complemento     TEXT,
    bairro          TEXT,
    cidade          TEXT,
    uf              TEXT,
    cep             TEXT,
    latitude        REAL,
    longitude       REAL,
    whatsapp        TEXT,
    telefone        TEXT,
    email           TEXT,
    farmaceutico    TEXT,
    crf             TEXT,
    rotulo_responsavel TEXT NOT NULL DEFAULT 'Farmacêutico(a) responsável',
    autorizacao     TEXT,
    licenca_ms      TEXT,
    raio_entrega_km REAL    NOT NULL DEFAULT 8,
    frete_gratis_acima REAL NOT NULL DEFAULT 0,
    fuso            TEXT    NOT NULL DEFAULT 'America/Sao_Paulo',
    ativo           INTEGER NOT NULL DEFAULT 1,
    criado_em       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS lojas_horario (
    slug  TEXT NOT NULL,
    dia   INTEGER NOT NULL,
    abre  TEXT NOT NULL,
    fecha TEXT NOT NULL,
    PRIMARY KEY (slug, dia, abre)
);
INSERT OR IGNORE INTO lojas (
    slug, nome, razao_social, cnpj,
    logradouro, numero, complemento, bairro, cidade, uf, cep,
    latitude, longitude,
    whatsapp, telefone,
    farmaceutico, crf, rotulo_responsavel, autorizacao, licenca_ms,
    raio_entrega_km, frete_gratis_acima, ativo
) VALUES (
    'mais-barato',
    'Drogaria Mais Barato',
    'Drogaria Mais Barato',
    '37.925.108/0001-03',
    'Rua Almeida Leme', '07', 'Loja 1', 'Parque São Bernardo',
    'São Bernardo do Campo', 'SP', '09761-170',
    -23.7092450, -46.5251954,
    '5511925190101', '+5511925190101',
    'Dra. Laís Carvalho da Silva', '122886', 'Farmacêutica responsável',
    'Processo 25351.507967/2022-82', 'MS 7.89888-2',
    8, 0, 1
);
INSERT OR IGNORE INTO lojas_horario (slug, dia, abre, fecha) VALUES
    ('mais-barato', 0, '08:00', '19:30'),
    ('mais-barato', 1, '07:00', '21:30'),
    ('mais-barato', 2, '07:00', '21:30'),
    ('mais-barato', 3, '07:00', '21:30'),
    ('mais-barato', 4, '07:00', '21:30'),
    ('mais-barato', 5, '07:00', '21:30'),
    ('mais-barato', 6, '07:00', '21:30');
