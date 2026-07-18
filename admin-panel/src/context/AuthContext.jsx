import { createContext, useContext, useState, useEffect } from "react";
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
     2. AXIOS INTERCEPTOR (FOR BACKGROUND REFRESH + QUEUE)
  ====================================================== */
  useEffect(() => {
    // Ye local variables queue maintain karenge
    let isRefreshing = false;
    let failedQueue = [];

    const processQueue = (error, token = null) => {
      failedQueue.forEach(prom => {
        if (error) {
          prom.reject(error);
        } else {
          prom.resolve(token);
        }
      });
      failedQueue = [];
    };

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
          
          // Agar refresh chal raha hai, toh nai requests ko queue mein daal do
          if (isRefreshing) {
            return new Promise(function (resolve, reject) {
              failedQueue.push({ resolve, reject });
            })
              .then(() => {
                return api(originalRequest); // Refresh hone ke baad retry karega
              })
              .catch((err) => {
                return Promise.reject(err);
              });
          }

          originalRequest._retry = true;
          isRefreshing = true;

          try {
            await api.post(`/api/admin/refresh`);
            isRefreshing = false;
            
            // Queue mein ruki requests ko aage badhao
            processQueue(null, 'success');
            
            return api(originalRequest); // Ye current request retry karo
          } catch (err) {
            isRefreshing = false;
            processQueue(err, null); // Queue fail karo
            logoutStateOnly(); // Token sach mein expire ho chuka hai, local state clear karo
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
      const response = await api.post(`/api/admin/login`, credentials);

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
      return {
        success: false,
        message: error.response?.data?.message || "Login failed",
      };
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