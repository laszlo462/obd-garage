import { useEffect, useState } from "preact/hooks";
import { client } from "./client.ts";

export function App() {
  const [health, setHealth] = useState<string>("checking...");

  useEffect(() => {
    client.api.health
      .$get()
      .then((res) => res.json())
      .then((body) => setHealth(body.status))
      .catch(() => setHealth("unreachable"));
  }, []);

  return (
    <main>
      <h1>OBD Garage</h1>
      <p>
        API health: <strong data-testid="health">{health}</strong>
      </p>
    </main>
  );
}
