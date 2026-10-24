/**
 * "PRODUTO EM CAIXA ALTA" -> "Produto Em Caixa Alta".
 *
 * A borda de palavra do JavaScript (`\b\w`) não conhece
 * acento: para ela, "ç" e "ã" não são letras. Em
 * "solução" isso faz o "o" final parecer começo de
 * palavra, e o nome publicado virava "SoluçãO" — 437
 * produtos do catálogo estavam assim, e é o tipo de erro
 * que o cliente lê como site mal feito antes de ler como
 * remédio certo.
 *
 * Por isso a conta é com propriedade Unicode: começa
 * palavra a letra que vem depois de algo que NÃO é letra
 * nem número. "Solução" fica "Solução", e "Com/70un"
 * continua "Com/70un" — o "u" vem depois de um número,
 * então não é começo de nada.
 */
export function primeiraLetraMaiuscula(texto) {

    return String(texto || "")
        .toLowerCase()
        .replace(
            /(^|[^\p{L}\p{N}])(\p{L})/gu,
            (_, antes, letra) => antes + letra.toUpperCase()
        );

}
