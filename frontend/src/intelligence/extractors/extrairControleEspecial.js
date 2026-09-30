/**
 * =====================================================
 * FarmaTech Intelligence
 * Controle Especial (Portaria 344/1998)
 * =====================================================
 *
 * Decide o que acontece na venda de um medicamento controlado - não a
 * tarja da CMED sozinha, que é vermelha até em anticoncepcional e
 * antibiótico comum e vende livre. Usa a substância (vinda da CMED,
 * confiável) como sinal primário, e cai para a descrição do produto
 * só quando o produto não foi encontrado na CMED.
 *
 * Sprint:
 * 8.2 - Controle Especial
 * =====================================================
 */

import { classificarControleEspecial } from "../dictionary/substanciasControladas";
import { ehAntimicrobiano } from "../dictionary/antimicrobianos";

export function extrairControleEspecial(produto) {

    const alvo = produto.substancia || produto.descricaoOriginal || "";

    const classificacao = classificarControleEspecial(alvo);

    /* Duas regras diferentes, mesma consequência no site: a receita fica
       retida, então o cliente precisa se comprometer a mandar a foto
       antes de o pedido sair.
         - listas C da Portaria 344  (classificacao.receitaRemota)
         - antimicrobiano da RDC 20/2011
       Não entra o que já está fora do carrinho: listas A/B são retirada
       presencial, e pedir foto de receita para elas seria prometer uma
       entrega que não existe. */
    const confirmarReceita =
        !classificacao.bloqueioPresencial &&
        (classificacao.receitaRemota || ehAntimicrobiano(alvo));

    return {
        ...produto,
        controleEspecial: classificacao.lista || "",
        controleEspecialNome: classificacao.listaNome,
        tipoReceita: classificacao.tipoReceita,
        bloqueioPresencial: classificacao.bloqueioPresencial,
        receitaRemota: classificacao.receitaRemota,
        confirmarReceita
    };

}
