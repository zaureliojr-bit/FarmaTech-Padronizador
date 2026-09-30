/**
 * =====================================================
 * FarmaTech Intelligence
 * Antimicrobianos (RDC 20/2011)
 * =====================================================
 *
 * A RDC 20/2011 obriga a reter a receita na venda de antimicrobiano —
 * do mesmo jeito que a Portaria 344 obriga nas listas C. São duas regras
 * diferentes com a mesma consequência prática pro site: o cliente tem
 * que se comprometer a mandar a foto da receita antes de o pedido sair.
 *
 * Por que não dá para usar a tarja da CMED: antibiótico é tarja
 * vermelha, mas tarja vermelha também é anti-hipertensivo de uso
 * contínuo, anticoncepcional e um monte de coisa cuja receita o
 * farmacêutico confere e devolve. Tarja é um conjunto grande demais —
 * usá-la fazia a loja inteira pedir receita, que é o mesmo que não pedir
 * para ninguém: o cliente marca a caixinha no automático.
 *
 * A lista é de PRINCÍPIO ATIVO, não de marca. O sinal primário é a
 * substância vinda da CMED; quando o produto não foi encontrado lá, cai
 * para o nome, que costuma trazer o genérico.
 *
 * Na dúvida, incluir. Pedir receita de algo que não precisava é atrito;
 * deixar de pedir de um antimicrobiano é infração sanitária.
 * =====================================================
 */

/* Agrupado por classe só para quem for revisar conseguir conferir por
   bloco — o código não usa os grupos, junta tudo num índice só. */
export const ANTIMICROBIANOS = {

    penicilinas: [
        "Amoxicilina", "Ampicilina", "Benzilpenicilina", "Penicilina",
        "Penicilina G", "Penicilina V", "Fenoximetilpenicilina",
        "Oxacilina", "Piperacilina", "Ticarcilina", "Clavulanato",
        "Ácido clavulânico", "Sulbactam", "Tazobactam"
    ],

    cefalosporinas: [
        "Cefalexina", "Cefadroxila", "Cefazolina", "Cefaclor",
        "Cefuroxima", "Cefoxitina", "Cefprozila", "Ceftriaxona",
        "Cefotaxima", "Ceftazidima", "Cefepima", "Cefpodoxima",
        "Ceftarolina", "Cefalotina"
    ],

    macrolideos: [
        "Azitromicina", "Claritromicina", "Eritromicina",
        "Espiramicina", "Roxitromicina", "Telitromicina"
    ],

    quinolonas: [
        "Ciprofloxacino", "Norfloxacino", "Levofloxacino",
        "Moxifloxacino", "Ofloxacino", "Gatifloxacino",
        "Gemifloxacino", "Ácido nalidíxico", "Lomefloxacino",
        "Besifloxacino"
    ],

    tetraciclinas: [
        "Tetraciclina", "Doxiciclina", "Minociclina", "Limeciclina",
        "Oxitetraciclina", "Tigeciclina"
    ],

    aminoglicosideos: [
        "Gentamicina", "Amicacina", "Neomicina", "Tobramicina",
        "Estreptomicina", "Canamicina"
    ],

    sulfonamidas: [
        "Sulfametoxazol", "Trimetoprima", "Sulfadiazina",
        "Sulfacetamida", "Sulfassalazina"
    ],

    /* Nitrofurano, nitroimidazol e afins — muito usados em infecção
       urinária e ginecológica, e é onde mais aparece venda sem receita. */
    outrosAntibacterianos: [
        "Nitrofurantoína", "Metronidazol", "Benzoilmetronidazol",
        "Secnidazol", "Tinidazol", "Clindamicina", "Lincomicina",
        "Cloranfenicol", "Vancomicina", "Teicoplanina", "Linezolida",
        "Daptomicina", "Fosfomicina", "Rifampicina", "Rifamicina",
        "Isoniazida", "Pirazinamida", "Etambutol", "Dapsona",
        "Mupirocina", "Ácido fusídico", "Bacitracina", "Polimixina",
        "Gramicidina", "Nistatina", "Colistina", "Espectinomicina",
        "Tianfenicol", "Nitrofural", "Nifuroxazida"
    ],

    /* Antifúngicos e antivirais sistêmicos entram no mesmo regime de
       retenção da RDC 20/2011. */
    antifungicos: [
        "Fluconazol", "Itraconazol", "Cetoconazol", "Miconazol",
        "Clotrimazol", "Terbinafina", "Griseofulvina", "Anfotericina",
        "Voriconazol", "Posaconazol", "Isoconazol", "Tioconazol",
        "Butoconazol", "Ciclopirox"
    ],

    antivirais: [
        "Aciclovir", "Valaciclovir", "Ganciclovir", "Oseltamivir",
        "Zanamivir", "Ribavirina", "Famciclovir", "Penciclovir"
    ]

};

function normalizar(texto) {

    return String(texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");

}

function escapeRegExp(texto) {

    return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

}

/* Um regex só com todos os nomes em alternância, pelo mesmo motivo do
   substanciasControladas.js: testar uma centena de regex por produto,
   num catálogo de seis mil, custa caro à toa. */
const indice = (() => {

    const nomes = Object.values(ANTIMICROBIANOS)
        .flat()
        .map(normalizar)
        .filter(Boolean);

    // mais específico primeiro: "penicilina g" antes de "penicilina",
    // senão a alternância casa o curto e perde o resto
    const unicos = [...new Set(nomes)].sort((a, b) => b.length - a.length);

    return new RegExp(
        `(?:^|[^a-z0-9])(${unicos.map(escapeRegExp).join("|")})(?:$|[^a-z0-9])`,
        "i"
    );

})();

/**
 * Diz se o texto (substância da CMED, ou o nome do produto quando ela
 * não existe) cita algum antimicrobiano.
 */
export function ehAntimicrobiano(texto) {

    const alvo = normalizar(texto);

    return !!alvo && indice.test(alvo);

}
