/**
 * =====================================================
 * FarmaTech Intelligence
 * Extrator de Quantidade
 * =====================================================
 */

import { encontrarQuantidade } from "../patterns";

export function extrairQuantidade(produto) {

    produto.quantidade = encontrarQuantidade(
        produto.descricaoPesquisa
    );

    return produto;

}