import "./DashboardStats.css";

function DashboardStats({ produtos }) {

    const totalProdutos = produtos.length;

    const imagensSalvas = produtos.filter(
        produto => produto.statusImagem === "salva"
    ).length;

    const semImagem = totalProdutos - imagensSalvas;

    const totalLaboratorios = new Set(
        produtos
            .map(produto => produto.laboratorio)
            .filter(Boolean)
    ).size;

    const totalCategorias = new Set(
        produtos
            .map(produto => produto.categoria)
            .filter(Boolean)
    ).size;

    const totalAbas = new Set(
        produtos
            .map(produto => produto.aba)
            .filter(Boolean)
    ).size;

    const cards = [

        {
            titulo: "Produtos",
            valor: totalProdutos,
            icone: "📦",
            cor: "azul"
        },

        {
            titulo: "Imagens",
            valor: imagensSalvas,
            icone: "🖼️",
            cor: "verde"
        },

        {
            titulo: "Sem imagem",
            valor: semImagem,
            icone: "🚫",
            cor: "vermelho"
        },

        {
            titulo: "Laboratórios",
            valor: totalLaboratorios,
            icone: "🏭",
            cor: "roxo"
        },

        {
            titulo: "Categorias",
            valor: totalCategorias,
            icone: "📂",
            cor: "amarelo"
        },

        {
            titulo: "Abas",
            valor: totalAbas,
            icone: "📑",
            cor: "ciano"
        }

    ];

    return (

        <div className="dashboard-stats">

            {

                cards.map((card) => (

                    <div
                        key={card.titulo}
                        className={`dashboard-card cor-${card.cor}`}
                    >

                        <span className="dashboard-icon">

                            {card.icone}

                        </span>

                        <div className="dashboard-texto">

                            <strong className="dashboard-value">

                                {card.valor.toLocaleString("pt-BR")}

                            </strong>

                            <span className="dashboard-title">

                                {card.titulo}

                            </span>

                        </div>

                    </div>

                ))

            }

        </div>

    );

}

export default DashboardStats;
