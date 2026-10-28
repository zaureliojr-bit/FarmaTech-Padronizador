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
