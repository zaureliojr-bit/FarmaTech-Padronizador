/**
 * =====================================================
 * FarmaTech Intelligence
 * Extrator de Marca
 * =====================================================
 */

import { MARCAS } from "../dictionary";

export function extrairMarca(produto) {

    const descricao =
        produto.descricaoPesquisa.toUpperCase();

    for (const marca of MARCAS) {

        if (
            marca.sinonimos.some((nome) =>
                descricao.includes(nome)
            )
        ) {

            produto.marca = marca.nome;

            break;

        }

    }

    return produto;

}