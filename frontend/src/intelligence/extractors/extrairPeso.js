/**
 * =====================================================
 * FarmaTech Intelligence
 * Extrator de Peso
 * =====================================================
 */

import { encontrarPeso } from "../patterns";

export function extrairPeso(produto) {

    produto.peso = encontrarPeso(
        produto.descricaoPesquisa
    );

    return produto;

}