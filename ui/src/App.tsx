import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ImageList from "./components/ImageList";
import ImageDetail from "./components/ImageDetail";
import { withAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

function App({ signOut, user }) {
  return (
    <Router>
      <div className="container mt-4">
        <div className="d-flex justify-content-end mb-2">
          {user && (
            <>
              <span className="navbar-text me-3">
                Signed in as:{" "}
                <strong>{user?.attributes?.email ?? user?.username}</strong>
              </span>
              <button className="btn btn-outline-primary" onClick={signOut}>
                Sign Out
              </button>
            </>
          )}
        </div>
        <Routes>
          <Route path="/" element={<ImageList />} />
          <Route path="/image/:imageKey" element={<ImageDetail />} />
        </Routes>
      </div>
    </Router>
  );
}

export default withAuthenticator(App);
