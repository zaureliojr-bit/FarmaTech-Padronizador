/**
 * =====================================================
 * FarmaTech Intelligence
 * Diagnóstico do Produto
 * =====================================================
 */

export function diagnosticarProduto(produto) {

    if (produto.score >= 90) {

        return "Pronto para publicação";

    }

    if (produto.score >= 70) {

        return "Quase pronto";

    }

    if (produto.score >= 50) {

        return "Necessita revisão";

    }

    return "Cadastro incompleto";

}