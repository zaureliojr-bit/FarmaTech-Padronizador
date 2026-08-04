/**
 * =====================================================
 * FarmaTech Intelligence
 * Pattern - Volume
 * =====================================================
 */

export function encontrarVolume(texto = "") {

    const resultado = texto.match(/(\d+)\s?(ML|L)/i);

    if (!resultado) {

        return "";

    }

    return `${resultado[1]} ${resultado[2].toUpperCase()}`;

}