import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import ImageList from "./components/ImageList";
import ImageDetail from "./components/ImageDetail";
import { useAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { Login } from "./components/Login";

function App() {
  const { user, signOut } = useAuthenticator((context) => [context.user]);

  return (
    <Router>
      <div className="container mt-4">
        <div className="d-flex justify-content-end mb-2">
          {user ? (
            <>
              <span className="navbar-text me-3">
                Signed in as:{" "}
                <strong>{user.attributes?.email ?? user.username}</strong>
              </span>
              <button className="btn btn-outline-primary" onClick={signOut}>
                Sign Out
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary">
              Sign In
            </Link>
          )}
        </div>
        <Routes>
          <Route path="/" element={<ImageList />} />
          <Route path="/image/:imageKey" element={<ImageDetail />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
