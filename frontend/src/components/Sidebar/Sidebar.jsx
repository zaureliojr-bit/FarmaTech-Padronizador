import "./Sidebar.css";

function Sidebar() {

    return (

        <aside className="sidebar">

            <div className="logo">

                <h2>🏥 FarmaTech</h2>

                <span>Padronizador</span>

            </div>

            <nav>

                <button>🏠 Dashboard</button>

                <button>📄 Importar</button>

                <button>🔍 Buscar</button>

                <button>🤖 IA</button>

                <button>🖼 Imagens</button>

                <button>🗄 Banco</button>

                <button>📊 Relatórios</button>

                <button>⚙ Configurações</button>

            </nav>

        </aside>

    );

}

export default Sidebar;