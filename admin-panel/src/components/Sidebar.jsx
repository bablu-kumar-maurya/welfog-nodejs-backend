import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  MdDashboard,
  MdPeople,
  MdMusicNote,
  MdComment,
  MdNotifications,
  MdSettings,
  MdSecurity,
  MdAdminPanelSettings,
  MdHistory,
  MdMenu,
  MdClose,
  MdExpandMore,
  MdExpandLess,
  MdGroupWork,
  MdBugReport,
  MdAccountBalanceWallet
} from 'react-icons/md';

import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user, userType } = useAuth();
  const [isOpen, setIsOpen] = useState(false); // Mobile toggle state
  const [isStaffOpen, setIsStaffOpen] = useState(false); // Dropdown toggle state
  const location = useLocation();

  const hasAnyPermission = (...perms) => {
    if (userType === 'admin') return true;
    const userPerms = Array.isArray(user?.permissions) ? user.permissions : [];
    return perms.some((p) => userPerms.includes(p));
  };

  // Roles, Staffs aur Settings ko yahan se filter logic ke liye handle karenge
  const menuItems = [
    { path: '/dashboard', icon: MdDashboard, label: 'Dashboard' },
    { path: '/users', icon: MdPeople, label: 'Users' },
    { path: '/reels', icon: MdDashboard, label: 'Reels' },
    { path: '/music', icon: MdMusicNote, label: 'Music' },
    { path: '/comments', icon: MdComment, label: 'Comments' },
    { path: '/notifications', icon: MdNotifications, label: 'Notifications' },
    { path: '/rewards', icon: MdAccountBalanceWallet, label: 'Wallet & Rewards' },
    { path: '/activity-logs', icon: MdHistory, label: 'Activity Logs' },
    { path: '/errors', icon: MdBugReport, label: 'Error Logs' },
    // Settings ko yahan se hata kar niche fixed position pe dala hai
  ];

  const filteredMenuItems = menuItems.filter((item) => {
    if (userType === 'admin') return true;
    if (item.path === '/dashboard') return hasAnyPermission('VIEW_DASHBOARD');
    if (item.path === '/users') return hasAnyPermission('VIEW_USERS');
    if (item.path === '/reels') return hasAnyPermission('VIEW_REELS');
    if (item.path === '/music') return hasAnyPermission('VIEW_MUSIC');
    if (item.path === '/comments') return hasAnyPermission('VIEW_COMMENTS');
    if (item.path === '/notifications') return hasAnyPermission('VIEW_NOTIFICATIONS');
    if (item.path === '/errors') return hasAnyPermission('VIEW_ERRORS');
    if (item.path === '/activity-logs') return false;
    
    return true;
  });

  // Check if user has access to Staff Management Group
  const canViewStaffManagement = hasAnyPermission(
    'ADD_ROLE', 'EDIT_ROLE', 'DELETE_ROLE', 
    'VIEW_STAFFS', 'ADD_STAFF', 'EDIT_STAFF', 'DELETE_STAFF'
  );

  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    <>
      {/* MOBILE HAMBURGER BUTTON */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-gray-200 rounded-lg shadow-sm text-gray-700"
      >
        {isOpen ? <MdClose size={24} /> : <MdMenu size={24} />}
      </button>

      {/* OVERLAY (Mobile only) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
          onClick={toggleSidebar}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-screen transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* HEADER */}
        <div className="p-6 border-b border-gray-200 bg-white flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-black flex items-center gap-2">
              Welfog
            </h1>
            <p className="text-gray-500 text-sm mt-1">Admin Panel</p>
          </div>
          <button onClick={toggleSidebar} className="lg:hidden text-gray-500">
            <MdClose size={24} />
          </button>
        </div>

        {/* MENU */}
        <nav className="flex-1 min-h-0 p-4 space-y-2 overflow-y-auto custom-scrollbar">
          {/* Main Menu Items (Dashboard, Users, etc.) */}
          {filteredMenuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'text-gray-700 hover:bg-white hover:text-black hover:shadow-sm'
                }`
              }
            >
              <item.icon className="text-xl shrink-0" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}

          {/* ✅ STAFF MANAGEMENT DROPDOWN SECTION (Now above Settings) */}
          {canViewStaffManagement && (
            <div className="space-y-1">
              <button
                onClick={() => setIsStaffOpen(!isStaffOpen)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
                  location.pathname.includes('/roles') || location.pathname.includes('/staffs')
                    ? 'bg-gray-200 text-black font-semibold'
                    : 'text-gray-700 hover:bg-white hover:text-black'
                }`}
              >
                <div className="flex items-center gap-3">
                  <MdGroupWork className="text-xl shrink-0" />
                  <span className="font-medium">Staff Management</span>
                </div>
                {isStaffOpen ? <MdExpandLess size={20} /> : <MdExpandMore size={20} />}
              </button>

              {/* Dropdown Items */}
              {isStaffOpen && (
                <div className="ml-6 space-y-1 mt-1 border-l-2 border-gray-200 pl-2 animate-fadeIn">
                  {hasAnyPermission('ADD_ROLE', 'EDIT_ROLE', 'DELETE_ROLE') && (
                    <NavLink
                      to="/roles"
                      onClick={() => setIsOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-2 rounded-md text-sm transition-all ${
                          isActive ? 'text-blue-600 font-bold' : 'text-gray-600 hover:text-black hover:bg-white'
                        }`
                      }
                    >
                      <MdSecurity size={18} />
                      Roles
                    </NavLink>
                  )}
                  
                  {hasAnyPermission('VIEW_STAFFS', 'ADD_STAFF', 'EDIT_STAFF', 'DELETE_STAFF') && (
                    <NavLink
                      to="/staffs"
                      onClick={() => setIsOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-2 rounded-md text-sm transition-all ${
                          isActive ? 'text-blue-600 font-bold' : 'text-gray-600 hover:text-black hover:bg-white'
                        }`
                      }
                    >
                      <MdAdminPanelSettings size={18} />
                      Staffs
                    </NavLink>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ✅ SETTINGS SECTION (Moved to the bottom of the list) */}
          {hasAnyPermission('VIEW_SETTINGS') && (
            <NavLink
              to="/settings"
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'text-gray-700 hover:bg-white hover:text-black hover:shadow-sm'
                }`
              }
            >
              <MdSettings className="text-xl shrink-0" />
              <span className="font-medium">Settings</span>
            </NavLink>
          )}
        </nav>

        {/* FOOTER */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <div className="text-xs text-gray-500 text-center font-medium">
            Version 1.0.10
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;