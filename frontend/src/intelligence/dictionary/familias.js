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
        cats: ["PERFUME", "DESODORANTE", "TALCO", "PERFUMARIA"] },

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

const _indicePorId = new Map(FAMILIAS.map((familia) => [familia.id, familia]));

// Correções feitas na tela (categoria -> id de família), carregadas do
// D1 compartilhado ao abrir o padronizador - existem pra não precisar
// mexer no dicionário fixo acima (e esperar um deploy) toda vez que uma
// planilha nova traz uma categoria que a lista original não previu.
const _overrides = new Map();

export function definirOverridesCategoria(mapaCategoriaParaFamiliaId) {

    _overrides.clear();

    mapaCategoriaParaFamiliaId.forEach((familiaId, categoria) => {
        _overrides.set(chaveCategoria(categoria), familiaId);
    });

}

export function familiaDe(categoria) {

    const chave = chaveCategoria(categoria);

    const overrideId = _overrides.get(chave);
    const familiaOverride = overrideId && _indicePorId.get(overrideId);

    if (familiaOverride) return familiaOverride;

    return _indiceFamilia.get(chave) || FAMILIA_OUTROS;

}
