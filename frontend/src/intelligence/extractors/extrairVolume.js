/**
 * =====================================================
 * FarmaTech Intelligence
 * Extrator de Volume
 * =====================================================
 */

import { encontrarVolume } from "../patterns";

export function extrairVolume(produto) {

    produto.volume = encontrarVolume(
        produto.descricaoPesquisa
    );

    return produto;

}