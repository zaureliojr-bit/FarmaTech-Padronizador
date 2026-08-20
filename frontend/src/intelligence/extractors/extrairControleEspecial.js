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

export function extrairControleEspecial(produto) {

    const alvo = produto.substancia || produto.descricaoOriginal || "";

    const classificacao = classificarControleEspecial(alvo);

    return {
        ...produto,
        controleEspecial: classificacao.lista || "",
        controleEspecialNome: classificacao.listaNome,
        tipoReceita: classificacao.tipoReceita,
        bloqueioPresencial: classificacao.bloqueioPresencial,
        receitaRemota: classificacao.receitaRemota
    };

}
