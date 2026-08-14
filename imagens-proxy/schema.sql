-- Índice das imagens hospedadas no R2, por EAN.
-- Rode isto uma vez no D1 (painel do Cloudflare -> D1 -> Console) antes
-- de usar o worker.

CREATE TABLE IF NOT EXISTS imagens (
    ean TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    origem TEXT NOT NULL,
    url_original TEXT,
    salvo_em INTEGER NOT NULL
);
