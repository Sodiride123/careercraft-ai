import { Route, Switch, useLocation } from "wouter";
import Home from "@/pages/Home";
import Documents from "@/pages/Documents";
import NotFound from "@/pages/NotFound";
import { useState } from "react";

function App() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [location] = useLocation();

  // Keep Home always mounted so chat state is preserved.
  // Hide it visually when on other routes.
  const isHome = location === "/";

  return (
    <>
      {/* Home is always rendered but hidden when not active */}
      <div style={{ display: isHome ? "block" : "none" }}>
        <Home
          currentJobId={currentJobId}
          onJobCreated={setCurrentJobId}
        />
      </div>

      {/* Other routes render normally */}
      {!isHome && (
        <Switch>
          <Route path="/documents" component={Documents} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      )}
    </>
  );
}

export default App;
