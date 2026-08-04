/**
 * =====================================================
 * FarmaTech Intelligence
 * Pattern - Medidas
 * =====================================================
 */

export function encontrarMedida(texto = "") {

    const peso = texto.match(/(\d+)\s?(MG|G|KG)/i);

    if (peso) {

        return `${peso[1]} ${peso[2].toUpperCase()}`;

    }

    const volume = texto.match(/(\d+)\s?(ML|L)/i);

    if (volume) {

        return `${volume[1]} ${volume[2].toUpperCase()}`;

    }

    return "";

}