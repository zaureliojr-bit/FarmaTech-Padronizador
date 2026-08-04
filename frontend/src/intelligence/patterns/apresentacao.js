/**
 * =====================================================
 * FarmaTech Intelligence
 * Pattern - Apresentação
 * =====================================================
 */

import { APRESENTACOES } from "../dictionary";

export function encontrarApresentacao(texto = "") {

    const descricao = texto.toUpperCase();

    for (const apresentacao of APRESENTACOES) {

        if (descricao.includes(apresentacao.toUpperCase())) {

            return apresentacao;

        }

    }

    return "";

}