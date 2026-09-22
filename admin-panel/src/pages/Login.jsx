import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import welfog from "../assets/welfog.png";
import {
  MdLock,
  MdPerson,
  MdEmail,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";
import toast from "react-hot-toast";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [loginType, setLoginType] = useState("admin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loginType === "admin" && !username) {
      return toast.error("Username required");
    }
    if (loginType === "staff" && !email) {
      return toast.error("Email required");
    }
    if (!password) {
      return toast.error("Password required");
    }

    setLoading(true);

    const credentials =
      loginType === "admin"
        ? { loginType: "admin", username, password }
        : { loginType: "staff", email, password };

    const result = await login(credentials);
    setLoading(false);

    if (result.success) {
      toast.success("Login successful");
      navigate("/dashboard");
    } else {
      toast.error(result.message || "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      {/* RESPONSIVE WRAPPER: 
          - Mobile par width full rahegi aur height content ke hisaab se (h-auto).
          - Tablet/Desktop (sm) par width 500px fix ho jayegi aur aspect-square (height=width) kaam karega.
      */}
      <div className="w-full max-w-[500px] sm:aspect-square flex flex-col">
        
        {/* ✅ PERFECT SQUARE CARD (Responsive) */}
        <div className="w-full h-full bg-white border border-gray-300 rounded-2xl shadow-2xl flex flex-col justify-center p-6 sm:p-10 md:p-12">
          
          <div className="w-full">
            {/* HEADER */}
            <div className="text-center mb-6">
              <img
                src={welfog}
                alt="Welfog Logo"
                className="mx-auto mb-4 h-16 md:h-20 w-auto object-contain"
              />
              <h1 className="text-3xl md:text-4xl font-bold text-black mb-1">
                Welfog
              </h1>
              <p className="text-gray-600 text-sm md:text-base">
                Sign in to your account
              </p>
            </div>

            {/* TOGGLE */}
            <div className="flex mb-6 rounded-lg overflow-hidden border border-gray-300">
              {["admin", "staff"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setLoginType(type)}
                  className={`flex-1 py-2 text-sm font-semibold transition ${
                    loginType === type
                      ? "bg-primary-600 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {type === "admin" ? "Admin" : "Staff"}
                </button>
              ))}
            </div>

            {/* FORM */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {loginType === "admin" && (
                <div className="relative">
                  <MdPerson className="absolute left-3 top-3 text-gray-500 text-xl" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Username"
                    disabled={loading}
                  />
                </div>
              )}

              {loginType === "staff" && (
                <div className="relative">
                  <MdEmail className="absolute left-3 top-3 text-gray-500 text-xl" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Email"
                    disabled={loading}
                  />
                </div>
              )}

              <div className="relative">
                <MdLock className="absolute left-3 top-3 text-gray-500 text-xl" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-white border border-gray-300 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <MdVisibilityOff className="text-xl" />
                  ) : (
                    <MdVisibility className="text-xl" />
                  )}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-800 text-white font-bold rounded-lg flex items-center justify-center gap-2 text-sm shadow-md"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <MdLock />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-[10px] md:text-xs text-gray-400 font-medium uppercase tracking-wider">
                Authorized access only
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;