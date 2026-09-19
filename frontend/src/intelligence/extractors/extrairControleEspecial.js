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

// CMED classifica antibiótico dentro da classe terapêutica (ATC) como
// "ANTIBACTERIANO(S)" (às vezes junto de subgrupo, tipo "ANTIBACTERIANOS
// BETA-LACTAMICOS - PENICILINAS") - não confundir com "ANTI-INFECCIOSO"
// sozinho, que também cobre antiviral/antifúngico/antiparasitário e
// deixaria a exigência de receita larga demais.
function ehAntibiotico(classeTerapeutica) {

    const texto = (classeTerapeutica || "").toUpperCase();

    return texto.includes("ANTIBACTERIAN") || texto.includes("ANTIMICROBIANO");

}

export function extrairControleEspecial(produto) {

    const alvo = produto.substancia || produto.descricaoOriginal || "";

    const classificacao = classificarControleEspecial(alvo);

    const antibiotico = ehAntibiotico(produto.classeTerapeutica);

    return {
        ...produto,
        controleEspecial: classificacao.lista || "",
        controleEspecialNome: classificacao.listaNome,
        tipoReceita: classificacao.tipoReceita,
        bloqueioPresencial: classificacao.bloqueioPresencial,
        receitaRemota: classificacao.receitaRemota,
        antibiotico,

        // Sinal pro site pedir a confirmação da receita (foto por
        // WhatsApp) antes de despachar - só antibiótico e controlado de
        // receita remota (listas C). bloqueioPresencial (listas A/B) fica
        // de fora de propósito: esses nem chegam a entrar no carrinho.
        confirmarReceita: antibiotico || classificacao.receitaRemota
    };

}
