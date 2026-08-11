import { useState } from "react";
import "./Toolbar.css";
import { exportarJSON } from "../../services/exportService";
import { publicarNoSite } from "../../services/exportSiteService";

function Toolbar({
    pesquisa,
    setPesquisa,
    laboratorios,
    categorias,
    abas,
    laboratorio,
    setLaboratorio,
    categoria,
    setCategoria,
    aba,
    setAba,
    total,
    limparFiltros,
    produtos,
    produtosCompletos,
    mostrarToast
}) {

    const [publicando, setPublicando] = useState(false);

    async function handlePublicar() {

        setPublicando(true);

        try {

            // Sempre publica o catálogo completo importado, nunca a lista
            // filtrada da tela - senão um filtro ativo (categoria, busca...)
            // apagaria do site tudo que não bate com o filtro.
            const { total: totalPublicado } = await publicarNoSite(produtosCompletos || produtos);
            mostrarToast?.(`${totalPublicado} produtos publicados no site!`, "sucesso");

        } catch (erro) {

            console.error("Erro ao publicar no site", erro);
            mostrarToast?.(erro.message || "Erro ao publicar no site.", "erro");

        } finally {

            setPublicando(false);

        }

    }

    return (

        <div className="toolbar">

            <input
                type="text"
                placeholder="🔎 Pesquisar..."
                value={pesquisa}
                onChange={(e) => setPesquisa(e.target.value)}
            />

            <select
                value={laboratorio}
                onChange={(e) => setLaboratorio(e.target.value)}
            >
                <option value="">Todos os Laboratórios</option>

                {laboratorios.map(item => (
                    <option key={item} value={item}>
                        {item}
                    </option>
                ))}

            </select>

            <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
            >
                <option value="">Todas as Categorias</option>

                {categorias.map(item => (
                    <option key={item} value={item}>
                        {item}
                    </option>
                ))}

            </select>

            <select
                value={aba}
                onChange={(e) => setAba(e.target.value)}
            >
                <option value="">Todas as Abas</option>

                {abas.map(item => (
                    <option key={item} value={item}>
                        {item}
                    </option>
                ))}

            </select>

            <div className="toolbar-info">
                <strong>{total}</strong> produtos
            </div>

            <button onClick={limparFiltros}>
                Limpar
            </button>

            <button
                onClick={() => exportarJSON(produtos)}
            >
                📤 Exportar JSON
            </button>

            <button
                onClick={handlePublicar}
                disabled={publicando}
                title={`Publica o catálogo completo (${(produtosCompletos || produtos).length} produtos), ignorando filtros ativos na tela`}
            >
                {publicando ? "Publicando..." : "🌐 Publicar no site"}
            </button>

        </div>

    );

}

export default Toolbar;