/**
 * =====================================================
 * FarmaTech Intelligence
 * Pattern - Quantidade
 * =====================================================
 *
 * Responsabilidade:
 * Identificar quantidades em descrições de produtos.
 *
 */

export function encontrarQuantidade(texto = "") {

    const regex = [
        /C\/\s*(\d+)/i,
        /CX\s*(\d+)/i,
        /(\d+)\s*UN/i,
        /(\d+)\s*UNIDADES/i,
        /(\d+)\s*CAPS/i,
        /(\d+)\s*COMP/i
    ];

    for (const padrao of regex) {

        const resultado = texto.match(padrao);

        if (resultado) {

            return resultado[1];

        }

    }

    return "";

}