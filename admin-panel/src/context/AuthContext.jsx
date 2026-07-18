import { createContext, useContext, useState, useEffect, useRef } from "react";
import api from "../api/axios";



const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);
  const [loading, setLoading] = useState(true);

  const isRefreshing = useRef(false);

  /* ======================================================
     1. VERIFY TOKEN (FIXED FOR PAGE RELOAD)
  ====================================================== */
  const verifyToken = async () => {
    try {
   const res = await api.get("/api/admin/verify");

      if (res.data.success) {
        setIsAuthenticated(true);
        setUser(res.data.user);
        setUserType(res.data.userType);
      }
    } catch (err) {
      // ✅ FIX: Agar verify fail ho (401), toh check karo ki kya refresh ho sakta hai
      if (err.response?.status === 401) {
        try {
          const refreshRes = await api.post(`/api/admin/refresh`);
          if (refreshRes.data.success) {
            // Refresh success! Ab user data ke liye dobara verify call karo
            const retryRes = await api.get(`/api/admin/verify`);
            setIsAuthenticated(true);
            setUser(retryRes.data.user);
            setUserType(retryRes.data.userType);
            return; // Exit function successfully
          }
        } catch (refreshErr) {
          console.error("Refresh token expired on reload");
        }
      }
      // Agar refresh bhi fail ho gaya, tabhi logout state set karo
      logoutStateOnly();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verifyToken();
  }, []);

  /* ======================================================
     2. AXIOS INTERCEPTOR (FOR BACKGROUND REFRESH)
  ====================================================== */
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Skip interceptor if it's a login or already a refresh attempt
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !originalRequest.url.includes("/refresh") &&
          !originalRequest.url.includes("/login")
        ) {
          originalRequest._retry = true;

          if (isRefreshing.current) return Promise.reject(error);
          isRefreshing.current = true;

          try {
            await api.post(`/api/admin/refresh`);
            isRefreshing.current = false;
            return api(originalRequest); // Retry the failed request
          } catch (err) {
            isRefreshing.current = false;
            logout(); // Full logout if refresh fails
            return Promise.reject(err);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => api.interceptors.response.eject(interceptor);
  }, []);

  /* ======================================================
     3. LOGIN
  ====================================================== */
  const login = async (credentials) => {
    try {
      setLoading(true);
     const response = await api.post(
  `/api/admin/login`,
  credentials,
);

      if (response.data.success) {
        const { user } = response.data;
        setIsAuthenticated(true);
        setUser(user);
        setUserType(user.userType);
        localStorage.setItem("userType", user.userType);
        return { success: true, user };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || "Login failed" };
    } finally {
      setLoading(false);
    }
  };

  /* ======================================================
     4. LOGOUT
  ====================================================== */
  const logoutStateOnly = () => {
    setIsAuthenticated(false);
    setUser(null);
    setUserType(null);
    localStorage.removeItem("userType");
  };

  const logout = async () => {
    try {
      await api.post(`/api/admin/logout`);
    } catch (err) {
      console.error("Logout error", err);
    } finally {
      logoutStateOnly();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        setUser,
        userType,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};