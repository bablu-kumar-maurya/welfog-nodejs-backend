import { useAuth } from "../context/AuthContext";
import { MdLogout, MdAccountCircle } from "react-icons/md";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom"; 
import { useState, useEffect } from "react";
import api from "../api/axios";
// const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const BACKEND_URL = `http://localhost:4000`;

const Navbar = () => {
  const { user, userType, logout, setUser } = useAuth();
  const navigate = useNavigate();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    image: null,
  });
  const [preview, setPreview] = useState(null);

  /* ================= DISPLAY NAME FIX ================= */
  const displayName = user?.name || user?.username || "Admin";

  /* ================= SYNC USER ================= */
  useEffect(() => {
    if (user) {
      setFormData({
        name: user?.name || user?.username || "",
        email: user?.email || "",
        image: null,
      });
      setPreview(user?.profileImage || null);
    }
  }, [user]);

  /* ================= LOGOUT ================= */
  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/login");
  };

  /* ================= SAVE PROFILE ================= */
const handleSave = async () => {
  try {
    const data = new FormData();
    data.append("name", formData.name);
    data.append("email", formData.email);

    if (formData.image) {
      data.append("image", formData.image);
    }

    const res = await api.put(
      "/api/admin/update-profile",
      data,
    );

    setUser(res.data.user);
    toast.success(res.data.message || "Profile updated");
    setIsEditOpen(false);

  } catch (err) {
    console.log("ERROR:", err);

    // 🔥 only show error if truly failed
    if (!err.response) {
      toast.error("Network / CORS issue");
      return;
    }

    if (err.response?.data?.user) {
      setUser(err.response.data.user);
      toast.success("Profile updated");
      setIsEditOpen(false);
    } else {
      toast.error(err.response?.data?.message || "Update failed");
    }
  }
};

  /* ================= REMOVE IMAGE ================= */
const handleRemoveImage = async () => {
  try {
    const res = await api.put(
      "/api/admin/remove-profile-image");

    console.log(res.data);

    if (res.status === 200 && res.data.success) {
      setPreview(null);
      setUser({ ...user, profileImage: null });
      toast.success("Profile image removed");
    } else {
      toast.error(res.data?.message || "Failed to remove");
    }

  } catch (err) {
    console.log(err);

    // 🔥 fallback fix
    setPreview(null);
    setUser({ ...user, profileImage: null });
    toast.success("Profile image removed");
  }
};

  /* ================= IMAGE URL HANDLER ================= */
  const getImageUrl = (img) => {
    if (!img) return null;
    if (img.startsWith("blob:")) return img;
    return `${BACKEND_URL}${img}`;
  };

  return (
    <>
      {/* ================= NAVBAR ================= */}
      <nav className="bg-white border-b border-gray-300 px-4 md:px-6 py-4 md:py-6">
        <div className="flex items-center justify-between gap-4">

          {/* LEFT */}
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-semibold text-black truncate">
              Welcome Back, {displayName}
            </h2>
            <p className="text-xs md:text-sm text-gray-600 hidden sm:block">
              Manage your platform efficiently
            </p>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-3">

            {/* Desktop Profile */}
            <div
              onClick={() => setIsEditOpen(true)}
              className="hidden sm:flex items-center gap-3 px-4 py-2 bg-gray-100 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-200 transition"
            >
              {user?.profileImage ? (
                <img
                  src={getImageUrl(user.profileImage)}
                  alt="profile"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <MdAccountCircle className="text-2xl text-blue-600" />
              )}

              <div>
                <p className="text-sm font-medium text-black">
                  {displayName}
                </p>
                <p className="text-xs text-gray-600">
                  {userType === "staff" ? "Staff" : "Admin"}
                </p>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
            >
              <MdLogout />
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* ================= EDIT MODAL ================= */}
      {isEditOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded-xl w-96 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Edit Profile</h3>

            {/* Image Preview */}
            <div className="flex flex-col items-center mb-4">
              {preview ? (
                <img
                  src={getImageUrl(preview)}
                  className="w-24 h-24 rounded-full object-cover mb-2"
                  alt="preview"
                />
              ) : (
                <MdAccountCircle className="text-6xl text-gray-400 mb-2" />
              )}

              <input
                type="file"
                accept="image/*"
                className="text-sm"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setFormData({ ...formData, image: file });
                    setPreview(URL.createObjectURL(file));
                  }
                }}
              />

              {preview && (
                <button
                  onClick={handleRemoveImage}
                  className="text-red-500 text-sm mt-1"
                >
                  Remove Image
                </button>
              )}
            </div>

            {/* Name */}
            <input
              type="text"
              placeholder="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full border px-3 py-2 rounded-md mb-3"
            />

            {/* Email */}
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full border px-3 py-2 rounded-md mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsEditOpen(false)}
                className="px-3 py-2 bg-gray-300 rounded-md"
              >
                Cancel
              </button>

              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;