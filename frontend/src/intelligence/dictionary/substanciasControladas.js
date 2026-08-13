/**
 * =====================================================
 * FarmaTech Intelligence
 * Substâncias de Controle Especial (Portaria SVS/MS 344/1998)
 * =====================================================
 *
 * Fonte: Anexo I da Portaria 344/1998, redação vigente conforme
 * RDC nº 1.023/2026 (ANVISA) - lista.substanciascontroladas34498.js,
 * fornecida por quem opera a farmácia.
 * Fonte oficial: https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/controlados/lista-substancias
 *
 * Por que isto existe: tarja (P/R/V/L, vinda da CMED) diz se o
 * medicamento precisa de receita para ser MOSTRADO na venda, mas não diz
 * se a receita precisa ser RETIDA. Anticoncepcional e antibiótico comum
 * são tarja vermelha e vendem livremente - bloqueá-los pela tarja sozinha
 * é bug, não é regra da lei. Quem exige retenção de receita são as
 * listas A e B da Portaria 344; as listas C exigem receita de controle
 * especial mas a lei permite entrega remota com conferência da receita
 * antes do envio (Art. 34-B) - por isso viram dois grupos diferentes:
 *
 *   BLOQUEIO_TOTAL (A1/A2/A3/B1/B2): retenção sempre presencial, não
 *   entra no carrinho do site.
 *
 *   RECEITA_REMOTA (C1/C2/C3/C5): entra no carrinho normalmente, mas o
 *   checkout precisa confirmar o envio da receita antes de despachar.
 *
 * Não incluídas (intencionalmente): C4 (antirretrovirais, fora da
 * Portaria desde a RDC 103/2016), D1/D2 (precursores - não são produto
 * de farmácia), E/F (plantas e substâncias proscritas - não vendáveis).
 *
 * Manutenção: a lista muda ~8-10x por ano via RDC da ANVISA. Revisar
 * contra a fonte oficial periodicamente. Tratar como camada adicional de
 * segurança sobre a tarja da CMED, não como única fonte - nomes
 * comerciais e grafias variantes podem escapar da comparação por texto.
 */

export const SUBSTANCIAS_CONTROLADAS = {

    A1: {
        nome: "Substâncias Entorpecentes",
        receita: "Notificação de Receita A (amarela)",
        substancias: [
            "Acetilmetadol", "Alfacetilmetadol", "Alfameprodina", "Alfametadol",
            "Alfaprodina", "Alfentanila", "Alilprodina", "Anileridina", "Bezitramida",
            "Benzetidina", "Benzilmorfina", "Benzoilmorfina", "Betacetilmetadol",
            "Betameprodina", "Betametadol", "Betaprodina", "Buprenorfina",
            "Butorfanol", "Clonitazeno", "Codoxima", "Concentrado de palha de dormideira",
            "Dextromoramida", "Diampromida", "Dietiltiambuteno", "Difenoxilato",
            "Difenoxina", "Diidromorfina", "Dimefeptanol (metadol)", "Dimenoxadol",
            "Dimetiltiambuteno", "Dioxafetila", "Dipipanona", "Drotebanol",
            "Etilmetiltiambuteno", "Etonitazeno", "Etoxeridina", "Fenadoxona",
            "Fenampromida", "Fenazocina", "Fenomorfano", "Fenoperidina", "Fentanila",
            "Furetidina", "Hidrocodona", "Hidromorfinol", "Hidromorfona",
            "Hidroxipetidina", "Intermediário da metadona (4-ciano-2-dimetilamina-4,4-difenilbutano)",
            "Intermediário da moramida (ácido 2-metil-3-morfolina-1,1-difenilpropano carboxílico)",
            "Intermediário a da petidina (4-ciano-1-metil-4-fenilpiperidina)",
            "Intermediário b da petidina (éster etílico do ácido 4-fenilpiperidina-4-carboxilíco)",
            "Intermediário c da petidina (ácido-1-metil-4-fenilpiperidina-4-carboxílico)",
            "Isometadona", "Levofenacilmorfano", "Levometorfano", "Levomoramida",
            "Levorfanol", "Metadona", "Metazocina", "Metildesorfina",
            "Metildiidromorfina", "Metopona", "Mirofina", "Morferidina", "Morfina",
            "Morinamida", "Nicomorfina", "Noracimetadol", "Norlevorfanol",
            "Normetadona", "Normorfina", "Norpipanona", "N-oxicodeína",
            "N-oximorfina", "Ópio", "Oripavina", "Oxicodona", "Oximorfona",
            "Petidina", "Piminodina", "Piritramida", "Proeptazina", "Properidina",
            "Racemetorfano", "Racemoramida", "Racemorfano", "Remifentanila",
            "Sufentanila", "Tapentadol", "Tebacona", "Tebaína", "Tilidina",
            "Trimeperidina", "Viminol"
        ]
    },

    A2: {
        nome: "Entorpecentes de Uso Permitido em Concentrações Especiais",
        receita: "Notificação de Receita A (amarela)",
        substancias: [
            "Acetildiidrocodeina", "Codeína", "Dextropropoxifeno", "Diidrocodeína",
            "Etilmorfina", "Folcodina", "Nalbufina", "Nalorfina", "Nicocodina",
            "Nicodicodina", "Norcodeína", "Propiram", "Tramadol"
        ]
    },

    A3: {
        nome: "Substâncias Psicotrópicas",
        receita: "Notificação de Receita A (amarela)",
        substancias: [
            "Anfetamina", "Catina", "Clorfentermina", "Dexanfetamina", "Dronabinol",
            "Femetrazina", "Fenciclidina", "Fenetilina", "Fenfluramina",
            "Levanfetamina", "Lisdexanfetamina", "Metilfenidato", "Metilsinefrina",
            "Tanfetamina"
        ]
    },

    B1: {
        nome: "Substâncias Psicotrópicas",
        receita: "Notificação de Receita B (azul)",
        substancias: [
            "Alfaxalona", "Alobarbital", "Alprazolam", "Amineptina", "Amobarbital",
            "Aprobarbital", "Armodafinila", "Barbexaclona", "Barbital", "Bromazepam",
            "Bromazolam", "Brotizolam", "Butabarbital", "Butalbital", "Camazepam",
            "Carisoprodol", "Cetamina", "Cetazolam", "Ciclobarbital", "Clobazam",
            "Clonazepam", "Clonazolam", "Clorazepam", "Clorazepato", "Clordiazepóxido",
            "Cloreto de etila", "Cloreto de metileno/diclorometano", "Clotiazepam",
            "Cloxazolam", "Delorazepam", "Diazepam", "Diclazepam", "Escetamina",
            "Estazolam", "Eszopiclona", "Etclorvinol", "Etilanfetamina (N-etilanfetamina)",
            "Etinamato", "Etizolam", "Fenazepam", "Fenobarbital", "Flualprazolam",
            "Flubromazolam", "Fludiazepam", "Flunitrazepam", "Flunitrazolam",
            "Flurazepam", "GBL", "GHB (ácido gama-hidroxibutírico)", "Glutetimida",
            "Halazepam", "Haloxazolam", "Lefetamina", "Lemborexante",
            "Loflazepato de etila", "Loprazolam", "Lorazepam", "Lormetazepam",
            "Medazepam", "Meprobamato", "Mesocarbo", "Metilfenobarbital (prominal)",
            "Metiprilona", "Midazolam", "Modafinila", "Nimetazepam", "Nitrazepam",
            "Norcanfano (fencanfamina)", "Nordazepam", "Oxazepam", "Oxazolam",
            "Pemolina", "Pentazocina", "Pentobarbital", "Perampanel", "Pinazepam",
            "Pipradrol", "Pirovalerona", "Prazepam", "Prolintano", "Propilexedrina",
            "Remimazolam", "Secbutabarbital", "Secobarbital", "Temazepam",
            "Tetrazepam", "Tiamilal", "Tiopental", "Triazolam", "Tricloroetileno",
            "Triexifenidil", "Vinilbital", "Zaleplona", "Zolpidem", "Zopiclona"
        ]
    },

    B2: {
        nome: "Substâncias Psicotrópicas Anorexígenas",
        receita: "Notificação de Receita B2",
        substancias: [
            "Aminorex", "Anfepramona", "Femproporex", "Fendimetrazina", "Fentermina",
            "Mazindol", "Mefenorex", "Sibutramina"
        ]
    },

    C1: {
        nome: "Outras Substâncias Sujeitas a Controle Especial",
        receita: "Receita de Controle Especial (branca, 2 vias)",
        substancias: [
            "Acepromazina", "Ácido valpróico", "Agomelatina", "Amantadina",
            "Amissulprida", "Amitriptilina", "Amoxapina", "Aripiprazol", "Asenapina",
            "Atomoxetina", "Azaciclonol", "Beclamida", "Benactizina", "Benfluorex",
            "Benzidamina", "Benzoctamina", "Benzoquinamida", "Biperideno",
            "Brexpiprazol", "Brivaracetam", "Bupropiona", "Buspirona", "Butaperazina",
            "Butriptilina", "Canabidiol (CBD)", "Captodiamo", "Carbamazepina",
            "Caroxazona", "Celecoxibe", "Cenobamato", "Ciclarbamato", "Ciclexedrina",
            "Ciclopentolato", "Cisaprida", "Citalopram", "Clomacrano", "Clometiazol",
            "Clomipramina", "Clorexadol", "Clorpromazina", "Clorprotixeno",
            "Clotiapina", "Clozapina", "Dapoxetina", "Desflurano", "Desipramina",
            "Desvenlafaxina", "Deutetrabenazina", "Dexetimida", "Dexmedetomidina",
            "Dibenzepina", "Dimetracrina", "Disopiramida", "Dissulfiram",
            "Divalproato de sódio", "Dixirazina", "Donepezila", "Doxepina",
            "Droperidol", "Duloxetina", "Ectiluréia", "Emilcamato", "Enflurano",
            "Entacapona", "Escitalopram", "Estiripentol", "Etomidato", "Etoricoxibe",
            "Etossuximida", "Facetoperano", "Femprobamato", "Fenaglicodol",
            "Fenelzina", "Feniprazina", "Fenitoina", "Flufenazina", "Flumazenil",
            "Fluoxetina", "Flupentixol", "Fluvoxamina", "Gabapentina", "Galantamina",
            "Haloperidol", "Halotano", "Hidrato de cloral", "Hidroclorbezetilamina",
            "Hidroxidiona", "Homofenazina", "Imicloprazina", "Imipramina",
            "Imipraminóxido", "Iproclozida", "Isocarboxazida", "Isoflurano",
            "Isopropil-crotonil-uréia", "Lacosamida", "Lamotrigina", "Leflunomida",
            "Levetiracetam", "Levomepromazina", "Levomilnaciprana", "Lisurida",
            "Lítio", "Loperamida", "Loxapina", "Lumiracoxibe", "Lurasidona",
            "Mavacanteno", "Maprotilina", "Meclofenoxato", "Mefenoxalona",
            "Mefexamida", "Memantina", "Mepazina", "Mesoridazina", "Metilnaltrexona",
            "Metilpentinol", "Metisergida", "Metixeno", "Metopromazina",
            "Metoxiflurano", "Mianserina", "Milnaciprana", "Miltefosina",
            "Minaprina", "Mirtazapina", "Misoprostol", "Moclobemida", "Molnupiravir",
            "Moperona", "Naloxona", "Naltrexona", "Nefazodona", "Nialamida",
            "Nitrito de isobutila", "Nitrito de isopentila", "Nitrito de isopropila",
            "Nomifensina", "Nortriptilina", "Noxiptilina", "Olanzapina",
            "Opipramol", "Oxcarbazepina", "Oxibuprocaína (benoxinato)",
            "Oxifenamato", "Oxipertina", "Paliperidona", "Parecoxibe", "Paroxetina",
            "Penfluridol", "Perfenazina", "Pergolida", "Periciazina (propericiazina)",
            "Pimozida", "Pipamperona", "Pipotiazina", "Pramipexol", "Pregabalina",
            "Primidona", "Proclorperazina", "Promazina", "Propanidina",
            "Propiomazina", "Propofol", "Protipendil", "Protriptilina",
            "Proximetacaina", "Quetiapina", "Ramelteona", "Rasagilina",
            "Reboxetina", "Ribavirina", "Rimonabanto", "Risperidona",
            "Rivastigmina", "Rofecoxibe", "Ropinirol", "Rotigotina", "Rufinamida",
            "Selegilina", "Sertralina", "Sevoflurano", "Sulpirida", "Sultoprida",
            "Tacrina", "Teriflunomida", "Tetrabenazina", "Tetracaína", "Tiagabina",
            "Tianeptina", "Tiaprida", "Tioproperazina", "Tioridazina", "Tiotixeno",
            "Tolcapona", "Topiramato", "Tranilcipromina", "Trazodona", "Triclofós",
            "Trifluoperazina", "Trifluperidol", "Trimipramina", "Troglitazona",
            "Valdecoxibe", "Valproato sódico", "Venlafaxina", "Veraliprida",
            "Vigabatrina", "Vilazodona", "Vortioxetina", "Ziprazidona", "Zotepina",
            "Zuclopentixol"
        ]
    },

    C2: {
        nome: "Substâncias Retinóicas",
        receita: "Notificação de Receita Especial (branca) para uso sistêmico / venda sob prescrição sem retenção para uso tópico",
        substancias: [
            "Acitretina", "Adapaleno", "Bexaroteno", "Isotretinoína", "Tretinoína"
        ]
    },

    C3: {
        nome: "Substâncias Imunossupressoras",
        receita: "Notificação de Receita Especial (branca)",
        substancias: [
            "Ftalimidoglutarimida (Talidomida)", "Lenalidomida", "Pomalidomida"
        ]
    },

    C5: {
        nome: "Substâncias Anabolizantes",
        receita: "Receita de Controle Especial (branca, 2 vias)",
        substancias: [
            "Androstanolona", "Bolasterona", "Boldenona", "Cloroxomesterona",
            "Clostebol", "Deidroclormetiltestosterona", "Drostanolona",
            "Estanolona", "Estanozolol", "Etilestrenol",
            "Fluoximesterona (fluoximetiltestosterona)", "Formebolona", "Gestrinona",
            "Mesterolona", "Metandienona (metandrostenolona)", "Metandranona",
            "Metandriol", "Metenolona", "Metiltestosterona", "Mibolerona",
            "Nandrolona", "Noretandrolona", "Oxandrolona", "Oximesterona",
            "Oximetolona", "Prasterona (deidroepiandrosterona - DHEA)",
            "Somapacitana", "Somatrogona", "Somatropina (hormônio do crescimento)",
            "Testosterona", "Trembolona"
        ]
    }

};

/** Retenção de receita sempre presencial - não pode ir para o carrinho. */
export const LISTAS_BLOQUEIO_TOTAL = ["A1", "A2", "A3", "B1", "B2"];

/**
 * Receita de Controle Especial - a Portaria permite entrega remota desde
 * que a receita seja conferida antes do envio (Art. 34-B). Pode ir para
 * o carrinho; o checkout é quem cobra a confirmação da receita.
 */
export const LISTAS_RECEITA_REMOTA = ["C1", "C2", "C3", "C5"];

function normalizar(texto) {

    return String(texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

}

function escapeRegExp(texto) {

    return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

}

/**
 * Uma entrada como "Dimefeptanol (metadol)" ou "Cloreto de
 * metileno/diclorometano" na verdade cita mais de um nome para a mesma
 * substância. Cada um vira um candidato de comparação próprio.
 */
function candidatosDoNome(nomeOriginal) {

    const semParenteses = nomeOriginal.replace(/\([^)]*\)/g, "").trim();
    const dentroDosParenteses = [...nomeOriginal.matchAll(/\(([^)]*)\)/g)]
        .map((m) => m[1]);

    return [semParenteses, ...dentroDosParenteses]
        .flatMap((parte) => parte.split("/"))
        .map((parte) => parte.trim())
        .filter(Boolean);

}

/**
 * Monta, para um grupo de listas (bloqueio total ou receita remota), um
 * único regex com todos os nomes em alternância e um mapa de volta pro
 * nome/lista original. Um regex só por grupo é bem mais rápido do que
 * testar centenas de regex separados por produto importado.
 */
function construirIndice(codigosDeLista) {

    const mapa = new Map();
    const candidatos = [];

    for (const codigo of codigosDeLista) {

        const lista = SUBSTANCIAS_CONTROLADAS[codigo];

        for (const substancia of lista.substancias) {

            for (const candidato of candidatosDoNome(substancia)) {

                const normalizado = normalizar(candidato);

                if (!normalizado || mapa.has(normalizado)) continue;

                mapa.set(normalizado, { lista: codigo, substancia });
                candidatos.push(normalizado);

            }

        }

    }

    // Mais específico primeiro: se um nome for prefixo/substring de outro,
    // a alternância do regex encontra o mais longo primeiro.
    candidatos.sort((a, b) => b.length - a.length);

    const regex = new RegExp(
        `(?:^|[^a-z0-9])(${candidatos.map(escapeRegExp).join("|")})(?:$|[^a-z0-9])`,
        "i"
    );

    return { regex, mapa };

}

const indiceBloqueioTotal = construirIndice(LISTAS_BLOQUEIO_TOTAL);
const indiceReceitaRemota = construirIndice(LISTAS_RECEITA_REMOTA);

function buscar({ regex, mapa }, textoNormalizado) {

    const encontro = regex.exec(textoNormalizado);

    if (!encontro) return null;

    return mapa.get(encontro[1].toLowerCase()) || null;

}

function semControle() {

    return {
        controlado: false,
        lista: null,
        listaNome: "",
        substancia: "",
        tipoReceita: "",
        bloqueioPresencial: false,
        receitaRemota: false
    };

}

function comControle(encontro, bloqueioPresencial, receitaRemota) {

    const lista = SUBSTANCIAS_CONTROLADAS[encontro.lista];

    return {
        controlado: true,
        lista: encontro.lista,
        listaNome: lista.nome,
        substancia: encontro.substancia,
        tipoReceita: lista.receita,
        bloqueioPresencial,
        receitaRemota
    };

}

/**
 * Compara o texto (substância da CMED, de preferência - ou a descrição do
 * produto, na falta dela) contra as listas da Portaria 344 e devolve a
 * classificação. Bloqueio total tem prioridade: se por algum motivo o
 * mesmo nome aparecer nas duas listas, prevalece o mais restritivo.
 */
export function classificarControleEspecial(texto) {

    const alvo = normalizar(texto);

    if (!alvo) return semControle();

    const bloqueio = buscar(indiceBloqueioTotal, alvo);

    if (bloqueio) return comControle(bloqueio, true, false);

    const remoto = buscar(indiceReceitaRemota, alvo);

    if (remoto) return comControle(remoto, false, true);

    return semControle();

}
