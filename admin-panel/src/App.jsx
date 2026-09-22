import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Reels from './pages/Reels';
import Music from './pages/Music';
import Comments from './pages/Comments';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import UserActivityDetails from './pages/UserInfo/UserActivityDetails';
import Layout from './components/Layout';
import UserPosts from './pages/UserInfo/UserPosts';
import UserComments from './pages/UserInfo/UserComments';
import UserFollowers from './pages/UserInfo/UserFollowers';
import UserFollowing from './pages/UserInfo/UserFollowing';
import UserLikedComments from './pages/UserInfo/UserLikedComments';
import UserLikedReels from './pages/UserInfo/UserLikedReels';
import UserMusicUploads from './pages/UserInfo/UserMusicUploads';
import Roles from "./pages/StaffManagement/Roles";
import Staffs from "./pages/StaffManagement/Staffs";
import CreateRole from './pages/StaffManagement/CreateRole';
import CreateStaff from './pages/StaffManagement/CreateStaff';
import StaffAwareHome from './components/StaffAwareHome';
import ActivityLogs from './pages/ActivityLogs';
import ErrorLogs from "./pages/ErrorLogs";
import WalletRewards from "./pages/WalletRewards";

const RequirePermission = ({ children, anyOf }) => {
  const { user, userType, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  if (userType === 'admin') {
    return children;
  }

  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const allowed = (anyOf || []).some((p) => perms.includes(p));

  return allowed ? children : <Navigate to="/" />;
};
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1e293b',
              color: '#fff',
              border: '1px solid #334155',
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <StaffAwareHome />
              }
            />

            <Route
              path="dashboard"
              element={
                <RequirePermission anyOf={["VIEW_DASHBOARD"]}>
                  <Dashboard />
                </RequirePermission>
              }
            />

            <Route path="users" element={
              <RequirePermission anyOf={["VIEW_USERS"]}>
                <Users />
              </RequirePermission>
            } />
            <Route path="users/:userId/activity" element={<UserActivityDetails />} />
            <Route path="users/:id/posts" element={<UserPosts />} />
            <Route path="/users/:userId/comments" element={<UserComments />} />
            <Route path="/users/:userId/followers" element={<UserFollowers />} />
            <Route path="/users/:userId/following" element={<UserFollowing />} />
            <Route path="/users/:userId/liked-comments" element={<UserLikedComments />} />
            <Route path="/users/:userId/liked-reels" element={<UserLikedReels />} />
            <Route path="/users/:userId/music" element={<UserMusicUploads />} />
            <Route path="roles/create" element={
              <RequirePermission anyOf={["ADD_ROLE"]}>
                <CreateRole />
              </RequirePermission>
            } />
            <Route path="roles/edit/:id" element={
              <RequirePermission anyOf={["EDIT_ROLE"]}>
                <CreateRole />
              </RequirePermission>
            } />
            <Route path="staffs/create" element={
              <RequirePermission anyOf={["ADD_STAFF"]}>
                <CreateStaff />
              </RequirePermission>
            } />
            <Route path="staffs/edit/:id" element={
              <RequirePermission anyOf={["EDIT_STAFF"]}>
                <CreateStaff />
              </RequirePermission>
            } />
            <Route path="roles" element={
              <RequirePermission anyOf={["ADD_ROLE", "EDIT_ROLE", "DELETE_ROLE"]}>
                <Roles />
              </RequirePermission>
            } />
            <Route path="staffs" element={
              <RequirePermission anyOf={["VIEW_STAFFS", "ADD_STAFF", "EDIT_STAFF", "DELETE_STAFF"]}>
                <Staffs />
              </RequirePermission>
            } />
            <Route
              path="activity-logs"
              element={
                <RequirePermission anyOf={["SUPER_ADMIN"]}>
                  <ActivityLogs />
                </RequirePermission>
              }
            />

            <Route path="reels" element={
              <RequirePermission anyOf={["VIEW_REELS"]}>
                <Reels />
              </RequirePermission>
            } />
            
            <Route path="music" element={
              <RequirePermission anyOf={["VIEW_MUSIC"]}>
                <Music />
              </RequirePermission>
            } />
            <Route path="comments" element={
              <RequirePermission anyOf={["VIEW_COMMENTS"]}>
                <Comments />
              </RequirePermission>
            } />
            <Route path="notifications" element={
              <RequirePermission anyOf={["VIEW_NOTIFICATIONS"]}>
                <Notifications />
              </RequirePermission>
            } />
            <Route path="rewards" element={<WalletRewards />} />
            <Route path="/errors" element={<ErrorLogs />} />
            <Route path="settings" element={
              <RequirePermission anyOf={["VIEW_SETTINGS"]}>
                <Settings />
              </RequirePermission>
            } />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
