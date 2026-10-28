-- ===================================================================
-- O banner que também aparece como aviso de entrada
-- ===================================================================
--
-- O pop-up de campanha que os aplicativos grandes mostram ao abrir:
-- imagem, uma frase e um botão. A loja pediu depois de ver um no 99.
--
-- Não é um banner novo. É um banner que a loja já cadastrou, marcado
-- para aparecer TAMBÉM por cima da vitrine — a mesma imagem, o mesmo
-- link, o mesmo prazo. Dois cadastros para a mesma campanha seria a
-- receita para a faixa dizer uma coisa e o pop-up outra.
--
-- POR QUE UMA TABELA EM VEZ DE UMA COLUNA EM `banners`
--
-- Pelo motivo de sempre, escrito por extenso no schema-cupons.sql:
-- ALTER TABLE não é repetível, e estes arquivos são colados à mão no
-- console do D1 de cada farmácia, às vezes duas vezes, por quem não
-- sabe se já rodou.
--
-- E de quebra o padrão fica certo: banner sem linha aqui é banner
-- normal, que é o que todos os existentes são.

CREATE TABLE IF NOT EXISTS banner_entrada (

    -- O id na tabela `banners`. Chave primária, então um banner está
    -- marcado ou não está — não existe "meio marcado".
    banner_id  INTEGER PRIMARY KEY,

    -- A ARTE DO AVISO, que é outra arte.
    --
    -- O banner da faixa é deitado, 1200x400. Num celular de 390px de
    -- largura, 3:1 vira uma tira de 119px de altura no meio da tela —
    -- medido, não estimado. Não é defeito de CSS: é geometria, e
    -- nenhum ajuste de largura resolve. Pop-up quer formato em pé.
    --
    -- Então o aviso tem a imagem dele, em 4:5 (1080x1350 serve), e a
    -- faixa continua com a dela. Mesma campanha, mesmo link, mesmo
    -- prazo; duas artes, porque são dois lugares com formatos
    -- diferentes.
    --
    -- Vazio é permitido: aí o aviso usa a imagem da faixa mesmo,
    -- deitada. Fica pior, e é melhor que não aparecer.
    imagem     TEXT,

    -- A chave do arquivo no R2, para ele ser apagado junto quando o
    -- banner for apagado — senão o balde vira depósito de arte de
    -- campanha antiga que ninguém sabe se ainda serve.
    r2_chave   TEXT,

    criado_em  INTEGER NOT NULL
);

-- O QUE O SITE FAZ COM ISSO, E O QUE ELE SE RECUSA A FAZER
--
-- Mostra o aviso só na HOME, nunca na página de um produto: quem clicou
-- no link de um produto no WhatsApp veio buscar aquilo, e tapar a tela
-- com propaganda é perder a venda que já estava feita.
--
-- Mostra só a partir da SEGUNDA visita. Na primeira, a pessoa vê a
-- farmácia; o Google trata pop-up na chegada de quem veio da busca como
-- "interstitial intrusivo" e penaliza, e o problema que esta loja tem
-- hoje é justamente gente que entra e sai sem procurar nada. Quem volta
-- já conhece a loja e aí recebe a campanha.
--
-- E mostra UMA VEZ por pessoa, por campanha. O que foi visto fica
-- guardado no aparelho do visitante, pelo id do banner: trocou o
-- banner, aparece de novo; o mesmo, não.
--
-- Nada disso mora aqui porque nada disso é do banco: é do navegador de
-- quem visita. Aqui mora só a decisão da loja — "esta campanha merece
-- um aviso de entrada".

-- SE VOCÊ JÁ RODOU A VERSÃO ANTERIOR DESTE ARQUIVO
--
-- A primeira versão desta tabela não tinha as colunas `imagem` e
-- `r2_chave`. O CREATE TABLE IF NOT EXISTS não acrescenta coluna a uma
-- tabela que já existe, então rodar este arquivo de novo não basta.
--
-- O site e o painel funcionam assim mesmo: o worker percebe a falta e
-- trata como "esta farmácia não usa arte própria", usando a imagem da
-- faixa. Então não há pressa nem risco.
--
-- Para ganhar o recurso, apague a tabela e rode este arquivo de novo.
-- O que se perde são as marcas de "mostrar como aviso de entrada", que
-- são uma caixinha por banner:
--
--     DROP TABLE banner_entrada;
--
-- Farmácia nova não precisa de nada disso — já nasce com as colunas.
