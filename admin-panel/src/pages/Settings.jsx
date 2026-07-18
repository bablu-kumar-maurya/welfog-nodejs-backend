import { useState, useEffect } from 'react'; 
import { MdSettings, MdSave, MdLock } from 'react-icons/md';
import toast from 'react-hot-toast';
import api from "../api/axios";
const Settings = () => {
  const [settings, setSettings] = useState({
    siteName: '',
    maintenanceMode: false,
    allowNewRegistrations: true,
    maxUploadSize: 0,
    videoQuality: 'high',
  });

  const [passwordChange, setPasswordChange] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Fetch settings from Database on page load
  useEffect(() => {
    const fetchSettings = async () => {
      try {
    
        const response = await api.get(`/api/admin/verify`, {
        });
        
        if (response.data.success) {
          const user = response.data.user;
          setSettings({
            siteName: user.siteName || 'Welfog Internet Private Limited',
            maintenanceMode: user.maintenanceMode || false,
            allowNewRegistrations: user.allowNewRegistrations !== undefined ? user.allowNewRegistrations : true,
            maxUploadSize: user.maxUploadSize || 200,
            videoQuality: user.videoQuality || 'high',
          });
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      }
    };
    fetchSettings();
  }, []);

  const handleSettingsChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveSettings = async () => {
    const loadingToast = toast.loading("Updating settings...");
    try {
      await api.put(
        `/api/admin/settings`, 
        settings,
        {
        }
      );

      toast.success('Settings saved successfully', { id: loadingToast });
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to update settings",
        { id: loadingToast }
      );
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
     
      await api.put(
        `/api/admin/change-password`,
        {
          currentPassword: passwordChange.currentPassword,
          newPassword: passwordChange.newPassword,
        },
        {
          
        }
      );
      toast.success("Password changed successfully");
      setPasswordChange({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Password change failed");
    }
  };

  return (
    /* Removed 'mx-auto' so it stays on the left side */
    <div className="space-y-6 animate-fadeIn max-w-4xl bg-white text-gray-900 p-4 md:p-6">
      {/* Header */}
      <div className="border-b border-gray-100 pb-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">Settings</h1>
        <p className="text-gray-500 text-sm md:text-base">Manage your admin panel settings</p>
      </div>

      {/* General Settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <MdSettings className="text-xl md:text-2xl text-blue-600" />
          <h2 className="text-lg md:text-xl font-semibold text-gray-900">General Settings</h2>
        </div>

        <div className="space-y-5 md:space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Site Name</label>
            <input
              type="text"
              value={settings.siteName}
              onChange={(e) => handleSettingsChange('siteName', e.target.value)}
              className="w-full px-4 py-2.5 md:py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Max Upload Size (MB)</label>
            <input
              type="number"
              value={settings.maxUploadSize}
              onChange={(e) => handleSettingsChange('maxUploadSize', parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2.5 md:py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Default Video Quality</label>
            <select
              value={settings.videoQuality}
              onChange={(e) => handleSettingsChange('videoQuality', e.target.value)}
              className="w-full px-4 py-2.5 md:py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">Low (240p)</option>
              <option value="medium">Medium (480p)</option>
              <option value="high">High (720p)</option>
            </select>
          </div>

          <div className="space-y-3">
            {/* Maintenance Mode Toggle */}
            <div className="flex flex-row items-center justify-between p-3 md:p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="pr-2">
                <p className="text-gray-900 font-medium text-sm md:text-base">Maintenance Mode</p>
                <p className="text-gray-500 text-xs md:text-sm">Disable site for maintenance</p>
              </div>
              <button
                type="button"
                onClick={() => handleSettingsChange('maintenanceMode', !settings.maintenanceMode)}
                className={`relative w-12 h-6 md:w-14 md:h-7 rounded-full transition-colors duration-200 flex-shrink-0 ${settings.maintenanceMode ? 'bg-blue-600' : 'bg-gray-400'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 md:w-6 md:h-6 bg-white rounded-full transition-transform duration-200 ${settings.maintenanceMode ? 'translate-x-6 md:translate-x-7' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Allow New Registrations Toggle */}
            <div className="flex flex-row items-center justify-between p-3 md:p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="pr-2">
                <p className="text-gray-900 font-medium text-sm md:text-base">Allow New Registrations</p>
                <p className="text-gray-500 text-xs md:text-sm">Allow new users to register</p>
              </div>
              <button
                type="button"
                onClick={() => handleSettingsChange('allowNewRegistrations', !settings.allowNewRegistrations)}
                className={`relative w-12 h-6 md:w-14 md:h-7 rounded-full transition-colors duration-200 flex-shrink-0 ${settings.allowNewRegistrations ? 'bg-blue-600' : 'bg-gray-400'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 md:w-6 md:h-6 bg-white rounded-full transition-transform duration-200 ${settings.allowNewRegistrations ? 'translate-x-6 md:translate-x-7' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm md:text-base"
          >
            <MdSave className="text-lg" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* Change Password Section */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <MdLock className="text-xl md:text-2xl text-blue-600" />
          <h2 className="text-lg md:text-xl font-semibold text-gray-900">Change Password</h2>
        </div>
        <form onSubmit={handlePasswordChange} className="space-y-4">
            {['currentPassword', 'newPassword', 'confirmPassword'].map((field, i) => (
                <div key={i}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field === 'currentPassword' ? 'Current Password' : field === 'newPassword' ? 'New Password' : 'Confirm New Password'}
                    </label>
                    <input
                        type="password"
                        value={passwordChange[field]}
                        onChange={(e) => setPasswordChange(prev => ({ ...prev, [field]: e.target.value }))}
                        className="w-full px-4 py-2.5 md:py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                    />
                </div>
            ))}
            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm md:text-base">
                <MdLock className="text-lg" /> <span>Change Password</span>
            </button>
        </form>
      </div>
    </div>
  );
};

export default Settings;