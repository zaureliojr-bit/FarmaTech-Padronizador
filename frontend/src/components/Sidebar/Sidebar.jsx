import "./Sidebar.css";

import { menu } from "../../data/menu";

function Sidebar() {

    return (

        <aside className="sidebar">

            <div className="logo">

                <h2>🏥 FarmaTech</h2>

                <span>Padronizador</span>

            </div>

            <nav>

                {

                    menu.map((item, index)=>{

                        const Icon = item.icon;

                        return(

                            <button key={index}>

                                <Icon size={18}/>

                                <span>{item.title}</span>

                            </button>

                        )

                    })

                }

            </nav>

        </aside>

    )

}

export default Sidebar;