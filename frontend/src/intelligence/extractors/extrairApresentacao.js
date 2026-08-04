/**
 * =====================================================
 * FarmaTech Intelligence
 * Extrator de Apresentação
 * =====================================================
 */

import { encontrarApresentacao } from "../patterns";

export function extrairApresentacao(produto) {

    produto.apresentacao = encontrarApresentacao(
        produto.descricaoPesquisa
    );

    return produto;

}