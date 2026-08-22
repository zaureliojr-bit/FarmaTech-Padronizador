/**
 * =====================================================
 * FarmaTech Intelligence
 * Roteamento por nome
 * =====================================================
 *
 * O FarmaxPDV usa algumas categorias como gaveta de tudo. A pior é
 * PERFUMARIA, com 1.244 produtos: shampoo e creme de pentear (Skala,
 * Seda), esmalte (Risqué, Impala), sabonete e hidratante (Giovanna
 * Baby), chupeta e mamadeira, fralda, seringa e até chinelo Havaianas.
 * No site tudo isso caía em "Outros" - quem procurava shampoo não
 * achava em "Cabelo".
 *
 * Aqui o nome do produto decide a categoria, quando a categoria do PDV
 * não decide. As regras apontam para categorias que o site JÁ conhece
 * (as mesmas de familias.js), e não para famílias: assim o site continua
 * burro, só agrupando o que recebe, e ninguém precisa manter dois
 * vocabulários.
 *
 * ORDEM IMPORTA. A primeira regra que casar vence, e a lista está
 * ordenada do mais específico para o mais genérico - "CREME PENTEAR"
 * antes de "CONDICIONADOR" (porque "Cr Pent ... Condicionador" é creme
 * de pentear), "DERMOCOSMETICO" antes de "HIDRATANTE" (porque gel de
 * limpeza facial não é hidratante corporal). Regra nova vai perto das
 * parecidas, não no fim.
 *
 * Gatilho começando com "^" só casa no início do nome. É o que salva a
 * abreviação curta do PDV: "^CH " pega "Ch Neopan 4115" (chupeta) sem
 * pegar qualquer produto com "ch " no meio da descrição.
 *
 * Medido contra o catálogo real (6.287 produtos, 1.244 em PERFUMARIA):
 * 1.228 roteados, 16 sobrando. E tem que sobrar mesmo - o que fica são
 * casos que nenhuma categoria do site resolve ("Taxa De Entrega
 * Distancia Maior", "Pata De Vaca Ref 137") ou produto no lugar errado
 * na planilha ("Azox 20mg Susp 45ml", um medicamento arquivado em
 * PERFUMARIA). Esses continuam aparecendo no aviso de "Outros" da tela,
 * que é exatamente onde o farmacêutico precisa vê-los.
 * =====================================================
 */

/* Cada regra é [categoria de destino, gatilhos].
   Os gatilhos são comparados contra o nome já sem acento e em
   maiúsculas, então basta escrever nesse formato. */
export const ROTEAMENTO_POR_NOME = [

    // ---- CABELO -----------------------------------------------------
    // vem primeiro porque é o maior grupo dentro de PERFUMARIA, e porque
    // várias palavras dele ("creme", "óleo", "máscara", "spray") também
    // aparecem em pele e higiene
    ["SHAMPOO", [
        "SHAMPOO", "SHAMPO", "XAMPU", "ANTICASPA", "^SH "
    ]],

    // "OLEO*CAP" pega "Oleo Salon Line 42ml Cap Sos Kids", que senão
    // cairia em OLEO CORPORAL lá embaixo por causa do "^OLEO "
    ["OLEO CAPILAR", [
        "OLEO CAP", "SERUM CAP", "OLEO DE ARGAN", "SERUM DE TRAT",
        "OLEO*CAP", "OLEO*CABELO", "OLEO*FIOS", "OLEO*CACHO"
    ]],

    // antes de CONDICIONADOR: "Cr Pent Dabelle Sos Crescimento
    // Condicionador" é creme de pentear, não condicionador
    ["CREME PENTEAR", [
        "CREME PENT", "CR PENT", "CREME DE PENT", "PENTEAR",
        "LEAVE-IN", "LEAVE IN", "FINALIZAD", "ATIVADOR DE CACHO",
        "DEFINICAO DE CACHO", "TODECACHO", "CACHINHO",
        "GELATINA CAP", "^GELATINA ", "DESEMBARAC", "DESEMBARAG",
        "AMACIHAIR", "DESMAIA CABELO", "^ATIVADOR", "DEFINIDOR DE CACHO",
        "ACIDIFICANTE"
    ]],

    ["CONDICIONADOR", [
        "CONDICIONADOR", "^COND ", "^CONDIC "
    ]],

    ["TINTURA", [
        "TINTURA", "^TINT ", "TINT ", "COLORACAO", "TINTA CAP",
        "RETOQUE DE RAIZ", "HENNA", "HENE", "BACIA TINT",
        "PO DESC", "^DESC ", "DESCOLORANTE", "^PO DESC", "OXIGENADA CREME",
        "LIGHT COLOR", "GRECIN", "TRES MARCHAND", "BIOCOLOR", "MAXTON",
        "SOFT COLOR", "^MARCIA ", "^YAMA "
    ]],

    ["CREME TRATAMENTO", [
        "MASC TRAT", "MASCARA TRAT", "MASCARA CAP", "MASC CAP",
        "TRATAMENTO CAP", "CREME DE TRATAMENTO", "UMECTACAO",
        "RECONSTRUCAO", "SELAGEM", "QUERATINA", "BOTOX CAP",
        "AMPOLA CAP", "AMP TRAT CAP", "AMPOLA DE TRAT", "TONICO CAP",
        "TONICO FORT", "LOCAO CAPILAR", "TRICOFORT", "PROT TERMICO",
        "PROTETOR TERMICO", "REPARADOR DE PONTA", "POS QUIMICA",
        "^GOTA TONICO", "GOTA MILAGROSA", "AMPOLA VIT CAP", "^SKAFE",
        "HAIR LIFE"
    ]],

    ["GEL FIXADOR CABELO", [
        "GEL FIX", "SPRAY FIX", "HAIR SPRAY", "^LAQUE", "LACA ",
        "POMADA MOD", "POMADA CAP", "PASTA MODELAD", "MODELADOR DE CAB",
        "MOUSSE", "GOMMA", "GEL COLA", "GEL CERA", "FIXACAO",
        // "^FIXADOR" e não "FIXADOR": tem fixador de dentadura no catálogo
        "^FIXADOR", "GEL FIXADOR", "SPRAY FIXADOR",
        "BRYLCREEM", "PENTEADO", "MODELADOR", "MODELADORA", "CERA MODEL",
        "^CREME MODELAD", "^GEL MODELAD", "STYLING HAIR", "STUDIO HAIR",
        "CAPTAIN HAIR", "GEL BOZZANO"
    ]],

    ["CR ALIS E MATIZADOR", [
        "ALISANTE", "ALISENA", "PROGRESSIVA", "RELAXANTE", "RELAXAMENTO",
        "MATIZAD", "MATIZ ", "GUANIDINA", "HIDROXIDO DE SODIO", "HIDROX",
        "MEU LISO", "LISO ",
        "DEFRIZ", "ANTIFRIZZ", "^CHAPINHA", "PRANCHA ALISAD"
    ]],

    ["PENTE E ESCOVA", [
        "^PENTE ", "PENTE DE BOLSO", "PENTE P/", "ESCOVA DE CAB",
        "ESCOVA CAB", "^ESC CAP", "ESCOVA P/CAB", "PINCEL",
        "ELASTICO", "^ELAST ", "XUXINHA", "RABICO", "PRESILHA",
        "TIARA", "LACAROTE", "GRAMPO", "^TOUCA ", "TOUCA P/", "MARCO BONI",
        "PIRANHA", "REDE CABELO", "REDE P/ CAB", "ESCOVA PARA CAB",
        "ESCOVA P/ CAB", "PENTE E ESCOVA", "ESCOVA E PENTE",
        "ESCOVA PENTE", "^CONDOR PENTE", "ESC SILIC",
        "ESCOVA MASSAGEADORA", "SECADOR DE CAB", "^TAIFF"
    ]],

    // ---- BELEZA -----------------------------------------------------
    ["ESMALTES", [
        "ESMALTE", "^ESM ", "ESMALT", "BASE COAT", "EXTRA BRILHO UNHA",
        "REMOVEDOR DE ESM", "ACETONA", "UNHA",
        "^LIXA ", "LIXA P", "ALICATE", "^ALIC ", "CUTIC", "PEDICURE",
        "BLOCO POLIDOR", "PALITO P/UNHA", "PALITO P/ UNHA",
        "SECANTE ESM", "^SECANTE ", "CORTADOR DE UNHA", "PEDRA POME"
    ]],

    ["MAQUIAGEM", [
        "BATOM", "^GLOSS", "RIMEL", "MASCARA DE CILIO", "CILIOS",
        "SOMBRA ", "BLUSH", "DELINEAD", "LAPIS DE OLHO",
        "LAPIS PARA OLHO", "LAPIS P/ OLHO", "^LAPIS ", "PO COMPACTO",
        "BASE LIQUIDA", "CORRETIVO", "PRIMER", "ILUMINADOR",
        "ESPONJA GOTA", "MAQ ESPONJA", "ESPONJA PARA BASE",
        "ESPONJA P/ BASE"
    ]],

    // ---- BARBA ------------------------------------------------------
    // antes de PELE: "Creme De Barbear Hidratação" tem "hidrat" no nome
    ["PRESTOBARBA", [
        "APARELHO DE BARB", "APARELHO BARB", "LAMINA DE BARB",
        "CREME DE BARBEAR", "CREME BARBEAR", "GEL DE BARB",
        "ESPUMA DE BARB", "ESP BARBEAR", "BALM P/ BARBA", "POS BARBA",
        "POS-BARBA", "NAVALHETE", "AP DE BARB", "^GILLETTE",
        "^BIC COMFORT", "PREST "
    ]],

    // ---- PELE -------------------------------------------------------
    ["PROTETOR SOLAR", [
        "PROTETOR SOLAR", "FOTOPROTETOR", "^FPS ", "FPS50", "FPS 50",
        "BRONZEAD", "POS SOL", "HELIOCARE", "SUNLESS", "ANASOL",
        "FPS 75", "FPS75"
    ]],

    // antes de HIDRATANTE: gel de limpeza / sérum facial não é hidratante
    ["DERMOCOSMETICO", [
        "SERUM FAC", "AGUA MICELAR", "DEMAQUILANTE", "ESFOLIANTE",
        "ANTI-IDADE", "ANTISSINAIS", "TONICO FAC", "GEL DE LIMPEZA",
        "ACIDO HIALURONICO", "VITAMINA C FAC", "ASEPXIA", "SABONETE FAC",
        "CICATRICURE", "SERUM*CORP", "ESFOLIANTA", "^CONTOUR"
    ]],

    ["HIDRATANTE", [
        "HIDRAT", "^HID ", "LOCAO HID", "LOC HID", "CREME PARA AS MAOS",
        "CREME MAOS", "CREME P/ MAOS", "CR HIDR", "CREME PES",
        "CREME P/ PES", "MANTEIGA CORP", "UREIA", "PROT LAB",
        "PROTETOR LABIAL", "MANTEIGA DE CACAU", "MANT CACAU", "CARMED",
        "LEITE DE AVEIA", "PERNAS CANSADAS", "LISA MAO"
    ]],

    ["OLEO CORPORAL", [
        "OLEO CORP", "OLEO DE BANHO", "OLEO HIDRAT", "OLEO DE AMENDOA",
        "^OLEO ", "^OLEO DE COCO", "^SANTO OLEO", "OLEO DE COPAIBA",
        "VASELINA"
    ]],

    ["SABONETE LIQUIDO", [
        "SABONETE LIQ", "SAB LIQ", "SABONETE INTIMO", "ESPUMA DE BANHO",
        "ESPUMA BANHO", "GEL DE BANHO"
    ]],

    ["SABONETE BARRA", [
        // com espaço (ou ponto) no fim: "Saboneteira" não é sabonete
        "SABONETE ", "SABONETE.", "SAB BARRA"
    ]],

    // ---- INFANTIL ---------------------------------------------------
    // as abreviações do PDV aqui são curtas demais pra procurar no meio
    // do nome - por isso quase tudo está ancorado no início
    ["LINHA INFANTIL", [
        "FRALDA", "CHUPETA", "^CH ", "^CHUP", "MAMADEIRA", "^MAM ",
        "BICO MAM", "BICO DE SILI", "^BICO ", "TIRA LEITE",
        "COPO EDUCATIVO", "COPO ANTIVAZ", "BABYSEC",
        "NEOPAN", "^KUKA ", "KUKA", "LENCO UMEDECIDO INF", "HUGGIES",
        "CONCHA AMAMENT", "CONCHAS AMAMENT", "MASSAGEADOR DE GENGIVA",
        "MASSAGEADOR*GENGIVA", "GENGIVA ROSA", "GENGIVA AZUL",
        "PROTETOR DE TOMADA", "CANECA TREINAMENTO", "ALIMENTADOR",
        "PORTA LEITE EM PO", "POTE PARA LEITE", "PORTA-FRUTINHA",
        "CHOCALHO", "^BUBA ", "^LOLLY ", "^CONCHA ", "CRIPAN", "COLORPAN",
        "BABYRUB", "FORMULA INFANTIL", "^NAN "
    ]],

    // ---- HIGIENE ----------------------------------------------------
    ["HIGIENE BUCAL", [
        "CREME DENTAL", "PASTA DE DENTE", "ESCOVA DENT", "^ESC DENT",
        "FIO DENTAL", "ENXAGUANTE", "^ENX ", "^ENXAG",
        "ANTISSEPTICO BUCAL", "SOLUCAO BUCAL", "BUCAL", "DENTADURA",
        "CLAREADOR DENT", "NOPLAK", "POWERDENT", "MALVATRIKIDS",
        "^PALITO ", "PORTA ESCOVA DENT", "CERA ORTODONT",
        "CERA ORTONDONT", "CRM DENT", "CR DENTAL", "COLGATE", "CLOSEUP",
        "^ELMEX", "^TANDY", "MALVATRIK", "MALVATRIC", "EXAGUANTE",
        "ESC ULTRA CLEAN",
        "^ESC D ", "^KIT ESC D", "ESCOVA CLASSIC", "ESCOVA INTER",
        "ESCOVA DE DENTE", "ORAL-B", "DENTALCLEAN"
    ]],

    ["ABSORVENTE", [
        "ABSORVENTE", "^ABS ", "ABS P/ SEIO", "ABS P/SEIO",
        "PROTETOR DIARIO", "COLETOR MENSTRUAL", "TAMPAO ", "^OB COM"
    ]],

    ["PRESERVATIVO", [
        "PRESERVATIVO", "^PRESERV", "CAMISINHA", "^OLLA ", "OLLA COM",
        "GEL LUBRIF", "LUBRIFICANTE INTIMO", "^K-MED"
    ]],


    ["DEPILATORIO", [
        "DEPILATOR", "CERA DEPIL", "CREME DEPIL", "^DEPIL", "DEPIL BELLA",
        "AP DE DEPILAR", "APARELHO DE DEPILAR", "^VENUS "
    ]],

    ["HIGIENE PESSOAL", [
        "DESODORANTE", "^DESOD", "ANTITRANSPIRANTE", "PAPEL HIGIENICO",
        "PAPEL TOALHA", "PAPEL INTERFOLHA", "LENCO UMED", "COTONETE",
        "HASTE FLEXIVEL", "ALCOOL GEL", "ALCOOL LIQ", "ALCOOL 70",
        "ESPONJA BANHO", "ESPONJA DE BANHO", "PEDRA HUME", "DESINF",
        "LYSOFORM", "LENCO DE PAPEL", "KLEENEX", "^FREECO", "^SECRET "
    ]],

    // ---- PERFUMARIA de verdade --------------------------------------
    ["PERFUME", [
        "PERFUME", "COLONIA", "DEO COLONIA", "EAU DE ", "BODY SPLASH",
        "^PARFUM"
    ]],

    ["TALCO", [
        "TALCO"
    ]],

    // ---- SAÚDE ------------------------------------------------------
    ["REPELENTE", [
        "REPELENTE", "^REP ", "^REPEL", "EXPOSIS", "^OFF ", "ICARIDINA",
        "DEET", "^RAID ", "^SBP "
    ]],

    ["ORTOPED", [
        "TORNOZELEIRA", "MUNHEQUEIRA", "JOELHEIRA", "COTOVELEIRA",
        "CINTA ABDOMINAL", "TIPOIA", "JOANETE", "PALMILHA",
        "PROTETOR OCULAR", "MEIA DE COMPRESSAO", "^COXAL ", "^JOELH ",
        "MERCUR NEOP", "DILATADOR NASAL"
    ]],

    ["TESOURA", [
        "TESOURA", "UNHEX", "^CORTADOR "
    ]],

    ["PERF/APLIC/AFERICAO", [
        "TERMOMETRO", "MEDIDOR DE PRESSAO", "MONITOR DE PRESSAO",
        "ESFIGMOMANOMETRO", "OXIMETRO", "GLICOSIMETRO", "TIRA DE GLICOSE",
        "KIT GLICOSE", "G-TECH", "LANCETA", "INALADOR", "INALACAO",
        "NEBULIZ", "PORTA CAPSULA", "PORTA COMPRIMIDO", "BOLSA TERMICA",
        "LAVAGEM NASAL", "^COPINHO ", "ULTRANEB", "CLEARBLUE", "TESTE DE GRAVIDEZ", "TESTE DE OVULACAO"
    ]],

    ["OFICINAL HOSPITALAR", [
        "ESPARADRAPO", "CURATIVO", "BAND AID", "BANDAID", "ALGODAO",
        "^GAZE", "ATADURA", "COMPRESSA", "SORO FISIOLOG", "ALMOTOLIA",
        "ALMOTOLOGIA", "TRAQUEIA", "SERINGA", "AGULHA", "POVIDINE",
        "RIODEINE", "RIOHEX", "CLOREXIDINA", "SAL AMARGO",
        "AGUA OXIGENADA", "GLICERINA", "FITA CREMER", "MICROPOROSA",
        "CICATRISAN", "SAF GEL", "COLETOR MATERIAL", "DESCARPACK",
        "PASTA D AGUA", "PASTA DAGUA", "CREME BELADONA", "MANITOL",
        "PROT/AURICULAR", "PROTETOR AURICULAR", "MISSNER"
    ]],

    ["LUVAS", [
        "^LUVA ", "LUVAS "
    ]],

    // ---- CONVENIÊNCIA ----------------------------------------------
    ["HAVAIANA", [
        "SAND.HAV", "SAND HAV", "SANDALIA HAV", "HAVAIANA", "^HAV "
    ]],

    ["CONVENIENCIA", [
        "CHINELO", "^PILHA ", "^BATERIA ", "ISQUEIRO", "^MEIA ",
        "BRINQUEDO", "MORDEDOR", "BONECA", "CARRINHO DE BRINQ",
        "BRINCO", "PIERCING", "^BALA ", "CHICLETE", "GELATINA SABOR",
        "CHECK-OUT", "MENTOS", "TRIDENT", "HALLS", "CHOCOLATE",
        "^GELEIA ", "^OCULOS ", "^COPO ", "^TIC TAC", "SNICKERS",
        "^FINI ", "PASTILHA", "GAROTO", "^TALENTO ", "^VALDA",
        "ROYAL TOYS", "^KIT FERRAMENTAS", "^AVIAO ", "POM POM",
        "KERO COCO", "^MONSTER ", "^CHA ", "SACHES BOLDO", "MULTIERVAS",
        "LEITE EM PO", "^NINHO ", "^NUTREN ", "^FORTINE ", "BEB LACT",
        "^YOPRO "
    ]]

];

/* Marcas que definem sozinhas a categoria, usadas só quando nenhuma
   regra por palavra casou. É a rede de baixo: nome comercial que não
   diz o que o produto é ("Salon Line Todecacho 550g"), mas a marca
   diz. Lista curta de propósito - marca é sinal fraco, e uma marca que
   um dia lançar outra linha passa a errar. */
export const MARCAS_QUE_DEFINEM = [
    ["CREME TRATAMENTO", ["SALON LINE", "^S LINE", "SKALA", "NOVEX",
        "BIO EXTRATUS", "DABELLE", "TRESEMME", "PANTENE", "ELSEVE",
        "SEDA ", "NEUTROX", "YAMASTEROL", "GOTA DOURADA", "KOLENE",
        "NIELY", "EMBELLEZE", "^KARINA ", "CHARMING", "^FIXED ",
        "^LOLA ", "^FOREVER "]],
    ["HIDRATANTE", ["GIOVANNA BABY", "MURIEL", "NIVEA", "PRINCIPIA",
        "CETAPHIL", "NEUTROGENA", "BEPANTOL"]],
    ["ESMALTES", ["RISQUE", "IMPALA", "COLORAMA", "TOP BEAUTY"]]
];

function semAcento(texto) {

    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();

}

function casa(alvo, gatilho) {

    // "^" no gatilho = só vale no começo do nome. Serve pras
    // abreviações curtas do PDV ("^CH " de chupeta, "^ESM " de
    // esmalte), que no meio do nome dariam falso positivo.
    if (gatilho.startsWith("^")) return alvo.startsWith(gatilho.slice(1));

    // "*" = os pedaços precisam aparecer nessa ordem, com qualquer
    // coisa no meio. O PDV enfia marca e volume no meio do nome
    // ("Oleo Salon Line 42ml Cap Sos"), então "OLEO*CAP" é a única
    // forma de dizer "óleo capilar" sem escrever marca por marca.
    if (gatilho.includes("*")) {

        let posicao = 0;

        for (const pedaco of gatilho.split("*")) {

            const achou = alvo.indexOf(pedaco, posicao);

            if (achou === -1) return false;

            posicao = achou + pedaco.length;

        }

        return true;

    }

    return alvo.includes(gatilho);

}

/**
 * Descobre a categoria a partir do nome do produto.
 * Devolve a categoria (string) ou "" quando nenhuma regra casa.
 */
export function categoriaPeloNome(nome) {

    const alvo = semAcento(nome);

    if (!alvo) return "";

    for (const [categoria, gatilhos] of ROTEAMENTO_POR_NOME) {
        for (const gatilho of gatilhos) {
            if (casa(alvo, gatilho)) return categoria;
        }
    }

    for (const [categoria, marcas] of MARCAS_QUE_DEFINEM) {
        for (const marca of marcas) {
            if (casa(alvo, marca)) return categoria;
        }
    }

    return "";

}
