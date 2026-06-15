import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Sin StrictMode a proposito: el stream mock usa timers y StrictMode los montaria
// dos veces en dev, ensuciando el feed. En produccion no cambia nada.
createRoot(document.getElementById("root")!).render(<App />);
