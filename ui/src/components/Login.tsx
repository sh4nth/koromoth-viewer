import { Authenticator, View, useAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";

export function Login() {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  useEffect(() => {
    if (authStatus === "authenticated") {
      navigate(from, { replace: true });
    }
  }, [authStatus, navigate, from]);

  return (
    <div className="d-flex justify-content-center align-items-center vh-100">
      <View>
        <Authenticator />
      </View>
    </div>
  );
}
