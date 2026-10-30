/**
 * =====================================================
 * DrogaLink Intelligence
 * Extrator de Categoria
 * =====================================================
 *
 * Começa da categoria bruta do FarmaxPDV e calcula a família - é ela
 * que decide em qual seção o produto aparece no site, e é aqui que dá
 * pra avisar o farmacêutico ANTES de publicar quando algo cairia em
 * "Outros".
 *
 * Quando a categoria do PDV não leva a nenhuma família (PERFUMARIA,
 * DIVERSOS, erro de digitação), o nome do produto decide no lugar dela
 * (ver dictionary/roteamentoPorNome.js). A categoria roteada substitui
 * a do PDV no produto - o site não precisa saber que houve roteamento,
 * e a categoria bruta continua guardada em categoriaOriginal, tanto
 * pra conferência quanto pra o roteamento poder rodar de novo do zero
 * a cada reprocessamento.
 *
 * Correção manual na tabela sempre vence: ela grava a categoria no
 * produto importado, que vira categoriaOriginal na próxima passagem -
 * aí a família reconhece e o roteamento nem chega a ser consultado.
 *
 * Categoria sem família reconhecida tenta mais duas fontes, nesta
 * ordem: a categoria da distribuidora (categoriaDistribuidor, de uma
 * Lista da distribuidora que trouxer essa coluna - ex.: dpcnet-
 * extrator) primeiro, por ser uma classificação de verdade e não um
 * palpite; o nome do produto (roteamentoPorNome.js) por último, só
 * quando não sobrou outra pista. A categoria da distribuidora só
 * resolve pra quem já está no dicionário de familias.js - categoria
 * nova de um distribuidor novo não vira família sozinha, precisa
 * entrar no dicionário primeiro.
 */

import { familiaDe, categoriaPeloNome } from "../dictionary";

export function extrairCategoria(produto) {

    if (produto.categoriaOriginal) {

        produto.categoria =
            produto.categoriaOriginal;

    }

    let familia = familiaDe(produto.categoria);

    produto.categoriaRoteada = false;

    if (familia.id === "outros" && produto.categoriaDistribuidor) {

        const familiaDistribuidor = familiaDe(produto.categoriaDistribuidor);

        if (familiaDistribuidor.id !== "outros") {

            produto.categoria = produto.categoriaDistribuidor;
            produto.categoriaRoteada = true;

            familia = familiaDistribuidor;

        }

    }

    if (familia.id === "outros") {

        const sugerida = categoriaPeloNome(
            produto.descricaoOriginal || produto.descricaoSite
        );

        const familiaSugerida = sugerida ? familiaDe(sugerida) : null;

        // Só troca se a sugestão realmente resolve o problema. Regra
        // que aponta pra categoria fora do familias.js seria trocar
        // "Outros" por "Outros" - e ainda apagaria a categoria do PDV
        // da tela sem ganho nenhum.
        if (familiaSugerida && familiaSugerida.id !== "outros") {

            produto.categoria = sugerida;
            produto.categoriaRoteada = true;

            familia = familiaSugerida;

        }

    }

    produto.familia = familia.id;
    produto.familiaNome = familia.nome;

    // Subcategoria é um eixo à parte - filtro dentro da família, não
    // decide qual família é - então entra direto, independente de qual
    // das fontes acima resolveu (ou não) a família.
    if (produto.subcategoriaDistribuidor) {
        produto.subcategoria = produto.subcategoriaDistribuidor;
    }

    return produto;

}
