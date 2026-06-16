import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// No StrictMode on purpose: the live answer streams over a single ndjson fetch and
// StrictMode's double-mount in dev would open it twice, duplicating the feed. In
// production nothing changes.
createRoot(document.getElementById("root")!).render(<App />);
