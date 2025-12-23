import { createContext, useContext, useState, useEffect } from "react";
import { getCurrentUser, signIn, signUp, signOut, getUserProfile } from "../services/appwrite";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        const profile = await getUserProfile(currentUser.$id);
        setUserProfile(profile);
      }
    } catch (error) {
      console.error("Auth check error:", error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const loggedInUser = await signIn(email, password);
    setUser(loggedInUser);
    const profile = await getUserProfile(loggedInUser.$id);
    setUserProfile(profile);
    return loggedInUser;
  };

  const register = async (email, password, displayName) => {
    const newUser = await signUp(email, password, displayName);
    setUser(newUser);
    const profile = await getUserProfile(newUser.$id);
    setUserProfile(profile);
    return newUser;
  };

  const logout = async () => {
    await signOut();
    setUser(null);
    setUserProfile(null);
  };

  const value = {
    user,
    userProfile,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
