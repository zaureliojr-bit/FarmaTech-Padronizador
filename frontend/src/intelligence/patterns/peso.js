/**
 * =====================================================
 * FarmaTech Intelligence
 * Pattern - Peso
 * =====================================================
 */

export function encontrarPeso(texto = "") {

    const resultado = texto.match(/(\d+)\s?(MG|G|KG)/i);

    if (!resultado) {

        return "";

    }

    return `${resultado[1]} ${resultado[2].toUpperCase()}`;

}