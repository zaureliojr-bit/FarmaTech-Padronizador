-- ===================================================================
-- Promoções de quantidade: "leve 3 pague 2" e "3 por R$ 10"
-- ===================================================================
--
-- A promoção que já existia troca o preço de UMA unidade, e a conta do
-- carrinho continua sendo preço × quantidade. Estas mudam a conta: o
-- valor depende de quantas a pessoa leva, e muda de novo a cada
-- unidade a mais.
--
-- POR QUE UMA TABELA NOVA, E NÃO COLUNAS EM `promocoes`
--
-- Duas razões, e a segunda é a que decide.
--
-- A primeira é prática: ALTER TABLE ADD COLUMN não é idempotente, e
-- este arquivo vai ser colado em toda loja nova e, mais cedo ou mais
-- tarde, duas vezes na mesma por engano. Tabela nova com IF NOT EXISTS
-- aguenta isso; ALTER não.
--
-- A segunda é de significado: as duas coisas CONVIVEM. "R$ 5,90 cada,
-- ou 3 por R$ 15" é como a farmácia anuncia de verdade. Se fossem
-- colunas da mesma linha, uma teria de apagar a outra.
--
-- O MODELO É UM SÓ PARA OS DOIS TIPOS
--
-- Ambos são "a cada N unidades, o pacote custa X":
--
--   leve 3 pague 2  ->  N = 3, X = 2 × preço unitário do dia
--   3 por R$ 10     ->  N = 3, X = 10,00
--
-- A diferença está em de onde sai o X, e é por isso que o `tipo`
-- existe. No "leve e pague" o valor acompanha o preço do produto: se a
-- planilha reexportar mais barato, o pacote fica mais barato junto,
-- sozinho. A loja prometeu dar uma unidade, não um valor.
--
-- A CONTA NÃO MORA AQUI
--
-- Quem calcula é o promoQtd.js, no site, que roda sem navegador e tem
-- teste. Esta tabela guarda o que foi prometido; a aritmética fica num
-- lugar só, porque dois lugares calculando dinheiro é como um deles
-- fica errado.

CREATE TABLE IF NOT EXISTS promocao_quantidade (

    -- o mesmo código do produto no catálogo
    codigo      TEXT PRIMARY KEY,

    -- 'leve-pague' | 'pacote'
    tipo        TEXT NOT NULL,

    -- "leve 3 pague 2": leve = 3, pague = 2
    leve        INTEGER NOT NULL DEFAULT 0,
    pague       INTEGER NOT NULL DEFAULT 0,

    -- "3 por R$ 10": quantidade = 3, preco = 10.00
    quantidade  INTEGER NOT NULL DEFAULT 0,
    preco       REAL    NOT NULL DEFAULT 0,

    inicio      TEXT,                    -- aaaa-mm-dd; vazio = já vale
    fim         TEXT,                    -- aaaa-mm-dd; vazio = não expira
    ativo       INTEGER NOT NULL DEFAULT 1,

    -- igual ao das promoções comuns: desfazer 300 itens de uma vez
    lote        TEXT,

    criado_em   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_promo_qtd_ativo ON promocao_quantidade (ativo);
CREATE INDEX IF NOT EXISTS idx_promo_qtd_lote  ON promocao_quantidade (lote);
