import "./Dashboard.css";

import StatCard from "../StatCard/StatCard";

import {
    FiBox,
    FiDatabase,
    FiClock,
    FiCheckCircle
} from "react-icons/fi";

function Dashboard() {

    return (

        <main className="dashboard">

            <h1>Dashboard</h1>

            <p>Bem-vindo ao FarmaTech Padronizador.</p>

            <div className="cards-grid">

                <StatCard
                    title="Produtos"
                    value="0"
                    color="#2563EB"
                    icon={<FiBox />}
                />

                <StatCard
                    title="Banco"
                    value="0"
                    color="#22C55E"
                    icon={<FiDatabase />}
                />

                <StatCard
                    title="Novos"
                    value="0"
                    color="#F59E0B"
                    icon={<FiCheckCircle />}
                />

                <StatCard
                    title="Pendentes"
                    value="0"
                    color="#EF4444"
                    icon={<FiClock />}
                />

            </div>

        </main>

    );

}

export default Dashboard;