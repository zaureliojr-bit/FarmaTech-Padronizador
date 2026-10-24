-- ===================================================================
-- O funil: quantos entram, quantos buscam, quantos chegam ao carrinho
-- ===================================================================
--
-- A Cloudflare já conta visita. O que ela não responde é o que a
-- farmácia precisa saber: de quem entrou, quantos chegaram ao fim.
--
--   100 entram · 40 buscam · 12 põem no carrinho · 3 pedem
--
-- Lido assim, o número que importa não é o 100 — é onde a conta cai.
-- Se 12 chegam ao carrinho e 3 pedem, o problema está entre o carrinho
-- e o envio, e isso tem conserto. Sem o funil, a loja só sabe que
-- "entrou gente" e que "veio pedido", sem nada no meio.
--
-- A UNIDADE É A VISITA, NÃO O EVENTO
--
-- Comparar "100 páginas abertas" com "40 buscas digitadas" não diz
-- nada: uma pessoa abre cinco páginas e busca três vezes. Para as
-- etapas serem comparáveis, cada uma conta UMA VEZ por visita.
--
-- Quem garante isso é o navegador: ele sorteia um número para a aba,
-- guarda no sessionStorage (morre quando a aba fecha) e manda cada
-- etapa no máximo uma vez. Esse número NUNCA chega aqui — o servidor
-- recebe só "mais uma visita hoje", "mais uma busca hoje".
--
-- É por isso que não há cookie, não há identificador e não há banner de
-- consentimento. E é por isso que esta tabela não tem como responder
-- "quem" fez o quê: ela foi feita para não poder.
--
-- POR QUE A BUSCA É CONTADA AQUI SE JÁ EXISTE A TABELA `buscas`
--
-- São perguntas diferentes. `buscas` guarda O QUE foi digitado, e
-- conta cada digitação — é o que alimenta "procuraram e não acharam".
-- Aqui conta QUANTAS VISITAS buscaram, uma vez cada. Somar as duas
-- daria dois números diferentes para a mesma palavra, e o que torna o
-- funil legível é justamente todas as etapas estarem na mesma unidade.

CREATE TABLE IF NOT EXISTS funil (

    -- O dia em São Paulo, não em UTC: um acesso das 22h já é o dia
    -- seguinte em UTC e sairia da conta do dia da farmácia.
    dia    TEXT NOT NULL,

    -- 'visita' | 'busca' | 'carrinho' | 'pedido'
    etapa  TEXT NOT NULL,

    total  INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (dia, etapa)
);

CREATE INDEX IF NOT EXISTS idx_funil_dia ON funil (dia);
