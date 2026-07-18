import { useState, useEffect } from 'react';
import api from "../api/axios";
import StatCard from '../components/StatCard';
import { useNavigate } from 'react-router-dom';

import {
  MdPeople,
  MdVideoLibrary,
  MdMusicNote,
  MdComment,
  MdVisibility,
  MdThumbUp,
} from 'react-icons/md';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const navigate = useNavigate();
  const safeNavigateIfData = (count, path) => {
    if (!count || count === 0) return;
    navigate(path);
  };
  const [stats, setStats] = useState({

    totalUsers: 0,
    totalReels: 0,
    totalMusic: 0,
    totalComments: 0,
    totalViews: 0,
    totalLikes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);
  const [recentMusic, setRecentMusic] = useState([]);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
    
      // Fetch dashboard data from backend
      const results = await Promise.allSettled([
        api.get(`/api/users/admin_users`, {
        
        }
        ),
        api.get(`/api/reels/admin_reels`, {
          

        }),
        api.get(`/api/music/admin-view`, {
           

        }),
        api.get(`/api/comment/admin-view`, {
         
        }),
        api.get(`/api/reels/totallikes`, {
         

        }),
        api.get(`/api/reels/totalviews`, {
      

        }),
      ]);

      const [
        usersRes,
        reelsRes,
        musicRes,
        commentsRes,
        likesRes,
        viewsRes
      ] = results.map(r => (r.status === "fulfilled" ? r.value : null));

      const users = Array.isArray(usersRes?.data?.data)
        ? usersRes.data.data
        : [];

      const reels = Array.isArray(reelsRes?.data?.data)
        ? reelsRes.data.data
        : [];

      const totalReels = reelsRes?.data?.total ?? 0;

      const comments = Array.isArray(commentsRes?.data?.comments)
        ? commentsRes.data.comments
        : [];

      // For music
      const music = Array.isArray(musicRes?.data?.data)
        ? musicRes.data.data
        : [];



      const totalMusic = musicRes?.data?.totalItems ?? 0;

      // Totals (permission-safe)
      const totalViews = viewsRes?.data?.totalViews ?? 0;
      const totalLikes = likesRes?.data?.totalLikes ?? 0;

      setStats({
        totalUsers: usersRes?.data?.total ?? 0,
        totalReels: totalReels ?? 0,
        totalMusic: musicRes?.data?.totalItems ?? 0,
        totalComments: commentsRes?.data?.totalComments ?? 0,
        totalViews: totalViews ?? 0,
        totalLikes: totalLikes ?? 0,
      });


      // Chart data (last 7 days)
      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        const dayReels = reels.filter(r => r.createdAt?.startsWith(dateStr)).length;
        const dayUsers = users.filter(u => u.createdAt?.startsWith(dateStr)).length;

        last7Days.push({
          date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          reels: dayReels,
          users: dayUsers,
        });
      }
      setChartData(last7Days);

      // Recent reels
      const recent = reels.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
      setRecentActivity(recent);

      // Latest music tracks for display (pagination)
      setRecentMusic(music);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner"></div>
      </div>
    );
  }

  const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-6 animate-fadeIn bg-white text-dark-900 p-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white-900 mb-2">Dashboard</h1>
        <p className="text-dark-800">Overview of your platform statistics</p>
      </div>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          icon={MdPeople}
          title="Total Users"
          // value={stats.totalUsers.toLocaleString()}
          value={Number(stats.totalUsers || 0).toLocaleString()}
          change={12.5}
          changeType="increase"
          iconColor="bg-blue-600/20 text-blue-500"
          onClick={() => safeNavigateIfData(stats.totalUsers, '/users')}
        />
        <StatCard
          icon={MdVideoLibrary}
          title="Total Reels"
          // value={stats.totalReels.toLocaleString()}
          value={Number(stats.totalReels || 0).toLocaleString()}
          change={8.3}
          changeType="increase"
          iconColor="bg-purple-600/20 text-purple-500"
          onClick={() =>
            safeNavigateIfData(stats.totalReels, '/reels')
          }

        />
        <StatCard
          icon={MdMusicNote}
          title="Music Tracks"
          // value={stats.totalMusic.toLocaleString()}
          value={Number(stats.totalMusic || 0).toLocaleString()}
          change={5.2}
          changeType="increase"
          iconColor="bg-green-600/20 text-green-500"
          onClick={() =>
            safeNavigateIfData(stats.totalMusic, '/music')
          }

        />
        <StatCard
          icon={MdComment}
          title="Total Comments"
          // value={stats.totalComments.toLocaleString()}
          value={Number(stats.totalComments || 0).toLocaleString()}
          change={15.8}
          changeType="increase"
          iconColor="bg-yellow-600/20 text-yellow-500"
          onClick={() =>
            safeNavigateIfData(stats.totalComments, '/comments')
          }
        />
        <StatCard
          icon={MdVisibility}
          title="Total Views"
          // value={stats.totalViews.toLocaleString()}
          value={Number(stats.totalViews || 0).toLocaleString()}
          change={22.1}
          changeType="increase"
          iconColor="bg-cyan-600/20 text-cyan-500"
          onClick={() =>
            safeNavigateIfData(stats.totalReels, '/reels')
          }
        />
        <StatCard
          icon={MdThumbUp}
          title="Total Likes"
          // value={stats.totalLikes.toLocaleString()}
          value={Number(stats.totalLikes || 0).toLocaleString()}
          change={18.4}
          changeType="increase"
          iconColor="bg-pink-600/20 text-pink-500"
          onClick={() =>
            safeNavigateIfData(stats.totalReels, '/reels')
          }
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line Chart */}
        <div className="bg-white border border-gray-200  rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-dark-900 mb-4">
            Activity Over Last 7 Days
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="reels"
                stroke="#0ea5e9"
                strokeWidth={2}
                name="Reels"
              />
              <Line
                type="monotone"
                dataKey="users"
                stroke="#10b981"
                strokeWidth={2}
                name="Users"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm ">
          <h3 className="text-lg font-semibold text-dark-900 mb-4">
            Content Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={[
                { name: 'Users', value: stats.totalUsers },
                { name: 'Reels', value: stats.totalReels },
                { name: 'Music', value: stats.totalMusic },
                { name: 'Comments', value: stats.totalComments },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Bar dataKey="value" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Reels
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="pb-3 text-gray-900 font-medium">Caption</th>
                <th className="pb-3 text-gray-900 font-medium">Creator</th>
                <th className="pb-3 text-gray-900 font-medium">Views</th>
                <th className="pb-3 text-gray-900 font-medium">Likes</th>
                <th className="pb-3 text-gray-900 font-medium">Status</th>
              </tr>
            </thead>

            <tbody>
              {recentActivity.map((reel) => (
                <tr
                  key={reel._id}
                  className="border-b border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  <td className="py-4 text-gray-900">
                    {reel.caption?.substring(0, 50) || 'No caption'}
                    {reel.caption?.length > 50 && '...'}
                  </td>

                  <td className="py-4 text-gray-700">
                    {reel.username}
                  </td>

                  <td className="py-4 text-gray-700">
                    {reel.views?.toLocaleString() || 0}
                  </td>

                  <td className="py-4 text-gray-700">
                    {reel.likes?.length?.toLocaleString() || 0}
                  </td>

                  <td className="py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${reel.status === 'Published'
                          ? 'bg-green-600/20 text-green-600'
                          : reel.status === 'Processing'
                            ? 'bg-yellow-600/20 text-yellow-600'
                            : 'bg-red-600/20 text-red-600'
                        }`}
                    >
                      {reel.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;