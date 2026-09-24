/** "PRODUTO EM CAIXA ALTA" -> "Produto Em Caixa Alta". */
export function primeiraLetraMaiuscula(texto) {

    return String(texto || "")
        .toLowerCase()
        .replace(/\b\w/g, (letra) => letra.toUpperCase());

}
