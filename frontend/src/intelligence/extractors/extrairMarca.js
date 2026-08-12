/**
 * =====================================================
 * FarmaTech Intelligence
 * Extrator de Marca
 * =====================================================
 *
 * O dicionário MARCAS só cobre um punhado de marcas conhecidas -
 * catálogo de farmácia real tem centenas. Quando nada bate, cai pro
 * que já veio na própria planilha em vez de deixar vazio (o que hoje
 * derrubava o score e gerava erro de validação mesmo em produtos com
 * cadastro completo): primeiro a coluna "marca" original, se a
 * planilha tiver uma; senão o laboratório/fabricante.
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

    if (!produto.marca && produto.marcaOriginal) {

        produto.marca = produto.marcaOriginal.trim();

    }

    if (!produto.marca && produto.laboratorio) {

        produto.marca = produto.laboratorio.trim();

    }

    return produto;

}