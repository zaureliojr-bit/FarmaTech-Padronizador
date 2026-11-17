-- Execute uma vez no D1 de cada filial que usa a faixa do cabeçalho.
-- NULL indica carrossel; string vazia indica faixa com apenas a arte desktop.
ALTER TABLE banners ADD COLUMN faixa_mobile TEXT;
