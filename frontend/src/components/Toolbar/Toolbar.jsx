import "./Toolbar.css";
import { exportarJSON } from "../../services/exportService";

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
    produtos
}) {

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

        </div>

    );

}

export default Toolbar;