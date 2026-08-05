/**
 * =====================================================
 * FarmaTech Intelligence
 * Score do Catálogo
 * =====================================================
 */

export function calcularScoreCatalogo(produtos = []) {

    if (!produtos.length) {

        return {

            scoreGeral: 0,

            media: 0,

            produtosProntos: 0,

            produtosPendentes: 0

        };

    }

    const soma = produtos.reduce(

        (total, produto) => total + produto.score,

        0

    );

    const media = Math.round(soma / produtos.length);

    const produtosProntos = produtos.filter(

        produto => produto.score >= 90

    ).length;

    return {

        scoreGeral: media,

        media,

        produtosProntos,

        produtosPendentes:

            produtos.length - produtosProntos

    };

}