/**
 * =====================================================
 * FarmaTech Intelligence
 * Famílias de Categoria
 * =====================================================
 *
 * Mesma tabela usada pelo site (Drogaria Mais Barato) pra agrupar
 * as ~51 categorias internas do FarmaxPDV num punhado de famílias
 * com nome de gente. Mantida aqui em espelho pra o padronizador
 * conseguir avisar, ANTES de publicar, quando uma categoria não é
 * reconhecida por nenhuma família (cairia em "Outros" no site -
 * às vezes por ser mesmo genérica, às vezes por erro de digitação
 * na planilha).
 *
 * Categoria nova no site? Espelhar a mudança aqui também.
 * =====================================================
 */

export const FAMILIAS = [

    { id: "medicamentos", nome: "Medicamentos",
        cats: ["ETICO", "GENERICO", "SIMILAR", "GENER/SIMILAR S/GT", "CARTELADOS"] },

    { id: "receita", nome: "Exigem receita", receita: true,
        cats: ["ETICO CONTROLADO", "ANTICONCEPCIONAL"] },

    { id: "vitaminas", nome: "Vitaminas e Suplementos",
        cats: ["VITAMINAS", "SUPLEMENTO"] },

    { id: "cabelo", nome: "Cabelo",
        cats: ["SHAMPOO", "CONDICIONADOR", "CREME PENTEAR", "CREME TRATAMENTO", "OLEO CAPILAR",
            "GEL FIXADOR CABELO", "TINTURA", "CR ALIS E MATIZADOR", "KIT SHAMPO/COND",
            "ESCOVA DE CABELO", "PENTE E ESCOVA"] },

    { id: "pele", nome: "Cuidados com a Pele",
        cats: ["DERMOCOSMETICO", "HIDRATANTE", "PROTETOR SOLAR", "OLEO CORPORAL",
            "LOÇAO FACIAL", "LOCAO FACIAL", "SABONETE LIQUIDO", "SABONETE BARRA"] },

    { id: "perfumaria", nome: "Perfumaria",
        cats: ["PERFUME", "DESODORANTE", "TALCO"] },

    { id: "higiene", nome: "Higiene Pessoal",
        cats: ["HIGIENE BUCAL", "HIGIENE PESSOAL", "ABSORVENTE", "PRESERVATIVO",
            "PRESTOBARBA", "DEPILATORIO"] },

    { id: "beleza", nome: "Beleza e Maquiagem",
        cats: ["ESMALTES", "MAQUIAGEM"] },

    { id: "infantil", nome: "Infantil",
        cats: ["LINHA INFANTIL", "FR INFANTIL", "FORMULA LEITE"] },

    { id: "saude", nome: "Saúde e Bem-estar",
        cats: ["FR GERIATRICA", "ORTOPED", "LUVAS", "PERF/APLIC/AFERICAO", "REPELENTE",
            "TESOURA", "OFICINAL HOSPITALAR"] },

    { id: "conveniencia", nome: "Conveniência",
        cats: ["CONVENIENCIA", "DIVERSOS", "VAREJO", "PREMIUM 10", "HAVAIANA"] }

];

export const FAMILIA_OUTROS = { id: "outros", nome: "Outros", cats: [] };

function chaveCategoria(cat) {

    return (cat || "").trim().toUpperCase().replace(/\s+/g, " ");

}

const _indiceFamilia = new Map();

FAMILIAS.forEach((familia) =>
    familia.cats.forEach((cat) => _indiceFamilia.set(chaveCategoria(cat), familia))
);

export function familiaDe(categoria) {

    return _indiceFamilia.get(chaveCategoria(categoria)) || FAMILIA_OUTROS;

}
