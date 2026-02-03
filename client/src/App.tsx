import { Route, Switch } from "wouter";
import Home from "@/pages/Home";
import Chat from "@/pages/Chat";
import Resumes from "@/pages/Resumes";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/chat" component={Chat} />
      <Route path="/resumes" component={Resumes} />
      <Route path="/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return <Router />;
}

export default App;