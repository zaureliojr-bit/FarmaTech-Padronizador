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

        // \b garante palavra inteira - sem isso "CREMER" (fabricante)
        // é confundido com "CREME" (forma farmacêutica).
        const regex = new RegExp(`\\b${apresentacao.toUpperCase()}\\b`);

        if (regex.test(descricao)) {

            return apresentacao;

        }

    }

    return "";

}