import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// No StrictMode on purpose: the mock stream uses timers and StrictMode would mount
// them twice in dev, polluting the feed. In production nothing changes.
createRoot(document.getElementById("root")!).render(<App />);
