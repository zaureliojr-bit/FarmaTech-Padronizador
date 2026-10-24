/**
 * =====================================================
 * DrogaLink Intelligence
 * Dicionário de Abreviações
 * =====================================================
 *
 * Responsabilidade:
 * Expandir as abreviações que os fornecedores usam na
 * descrição do PDV — "SAB" vira "Sabonete", "CX" vira
 * "Caixa" — para o nome publicado no site ficar legível.
 *
 * POR QUE ISTO DEIXOU DE SER UM DICIONÁRIO SIMPLES
 *
 * A primeira versão era um mapa de sigla para palavra,
 * trocada em qualquer lugar onde a sigla aparecesse
 * isolada. Funcionava para a maioria e errava feio numa
 * minoria grande — três casos vistos no catálogo de
 * verdade, somando mais de 450 produtos:
 *
 *   FR INF PERSONAL ...   -> "Frasco Inf Personal"
 *                            (é FRALDA infantil)
 *   VITAMINA C C/ 30      -> "Vitamina Com Com 30"
 *   PROTETOR SOL FPS 50   -> "Protetor Solução"
 *
 * Nenhum dos três é erro de digitação do fornecedor: a
 * mesma sigla quer dizer coisas diferentes conforme o
 * produto. Um dicionário que não olha o resto da frase
 * não tem como acertar os dois lados.
 *
 * A REGRA QUANDO NÃO DÁ PARA SABER
 *
 * Sigla ambígua sem nenhum sinal na frase fica COMO
 * ESTÁ. "Fr" no nome é feio; "Frasco" numa fralda é
 * errado, e errado no nome de um produto de farmácia é
 * o que faz o cliente desistir da compra achando que
 * recebeu outra coisa. Entre feio e errado, feio.
 *
 * Sprint:
 * 8.1.1
 * =====================================================
 */

/* As que querem dizer uma coisa só, em qualquer frase. */
export const ABREVIACOES = {

    CONF: "Confort",

    SEC: "Sec",

    CX: "Caixa",

    KIT: "Kit",

    SAB: "Sabonete",

    SH: "Shampoo",

    COND: "Condicionador",

    SPR: "Spray",

    CAPS: "Cápsulas",

    COMP: "Comprimidos",

    ENV: "Envelope"

};

/**
 * As ambíguas.
 *
 * Cada uma traz as leituras possíveis em ordem de
 * prioridade. A primeira cujo sinal aparecer na
 * descrição vence; não aparecendo nenhum, a sigla não é
 * tocada.
 */
export const ABREVIACOES_COM_CONTEXTO = [

    {
        sigla: "FR",
        leituras: [
            {
                /* Fralda vem primeiro porque os sinais dela são mais
                   específicos: "INF" e as marcas de fralda não
                   aparecem em produto líquido. Já "ML" aparece em
                   fralda? Não — mas lenço umedecido da mesma marca
                   sim, e aí a ordem salva. */
                vira: "Fralda",
                sinais: /\b(INF|INFANTIL|BABY|GERIATRIC\w*|POM\s?POM|POMPOM|PERSONAL|HUGGIES|PAMPERS|MAMYPOKO|CREMER|TOQUINHO|PROTEK)\b/i
            },
            {
                vira: "Frasco",
                sinais: /\b(\d+\s?ML|\d+\s?L|LITRO|XAROPE|GTS|GOTAS|SOL|SOLUCAO|SOLUÇÃO|SUSP|SUSPENSAO|ELIXIR|SPRAY|LOCAO|LOÇÃO)\b/i
            }
        ]
    },

    {
        sigla: "SOL",
        leituras: [
            {
                /* O sol do céu, não a solução do frasco. Protetor
                   solar é o caso que aparece, e "Protetor Solução"
                   seria a frase que denuncia o site inteiro. */
                vira: null,
                sinais: /\b(PROTETOR|PROTECAO|PROTEÇÃO|FPS|BRONZEAD\w*|POS[\s-]?SOL)\b/i
            },
            {
                vira: "Solução",
                sinais: /\b(ORAL|OFT|OFTALMIC\w*|NASAL|INJ|INJETAVEL|TOPIC\w*|OTOLOGIC\w*|GTS|GOTAS|\d+\s?ML)\b/i
            }
        ]
    },

    {
        sigla: "C",
        leituras: [
            {
                /* Só na forma "C/ 30", que é quantidade. O "C"
                   solto entre palavras é quase sempre o nome do
                   produto — Vitamina C, Aspirina C — e virou
                   "Vitamina Com Com Zinco" em oito itens do
                   catálogo antes desta regra existir. */
                vira: "Com",
                sinais: /\bC\s*\//i,
                somenteEm: /\bC(?=\s*\/)/g
            }
        ]
    }

];

/* Escapa nada: as siglas são constantes deste arquivo e só têm letras.
   A função existe para o `new RegExp` ficar numa linha só. */
function comoPalavraIsolada(sigla) {
    return new RegExp(`\\b${sigla}\\b`, "gi");
}

/**
 * Expande as abreviações de uma descrição.
 *
 * Recebe e devolve o texto ainda em caixa alta, como vem
 * do PDV — quem capitaliza é o passo seguinte.
 */
export function expandirAbreviacoes(descricao) {

    let texto = String(descricao || "");

    for (const [sigla, expandida] of Object.entries(ABREVIACOES)) {
        texto = texto.replace(comoPalavraIsolada(sigla), expandida);
    }

    for (const { sigla, leituras } of ABREVIACOES_COM_CONTEXTO) {

        /* O texto ORIGINAL é quem decide, não o já mexido: uma
           expansão anterior pode ter acabado de inserir a palavra que
           serviria de sinal, e aí a sigla decidiria com base no que
           nós mesmos escrevemos. */
        const leitura = leituras.find((l) => l.sinais.test(descricao));

        /* Nenhum sinal, ou sinal que manda deixar quieto: a sigla
           fica como está. */
        if (!leitura || !leitura.vira) continue;

        texto = texto.replace(
            leitura.somenteEm
                ? new RegExp(leitura.somenteEm.source, leitura.somenteEm.flags)
                : comoPalavraIsolada(sigla),
            leitura.vira
        );

    }

    return texto;

}
