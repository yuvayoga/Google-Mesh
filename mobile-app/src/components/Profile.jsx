import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Droplets, Phone, Activity, Save, CheckCircle2, Mail, Calendar, LogOut, AlertTriangle } from 'lucide-react';
import { ref, set } from 'firebase/database';

function Profile({ onLogout, user, userProfile, db }) {
    const [profile, setProfile] = useState({
        fullName: '',
        email: '',
        dob: '',
        bloodType: '',
        emergencyContact: '',
        medicalConditions: ''
    });
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (userProfile) {
            setProfile(userProfile);
        } else {
            const stored = localStorage.getItem('sos_user_profile');
            if (stored) setProfile(JSON.parse(stored));
        }
    }, [userProfile]);

    const handleSave = async () => {
        setLoading(true);
        try {
            // Save to Firebase
            if (user && db) {
                await set(ref(db, `users/${user.uid}`), {
                    ...profile,
                    updatedAt: Date.now()
                });
            }

            // Also update localStorage for offline consistency
            localStorage.setItem('sos_user_profile', JSON.stringify(profile));

            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            console.error("Failed to save profile:", err);
            alert("Failed to save profile. Please check your connection.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md flex flex-col gap-6"
        >
            <div className="flex justify-between items-end px-2">
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-black text-gradient tracking-tighter">My Profile</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest opacity-70">Personal & Medical Info</p>
                </div>
                <div className="flex gap-2">
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={onLogout}
                        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg bg-red-50 dark:bg-red-900/20 text-red-500"
                    >
                        <LogOut className="w-5 h-5" />
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handleSave}
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-slate-800 text-blue-600 border border-blue-100 dark:border-slate-700'}`}
                    >
                        {saved ? <CheckCircle2 className="w-6 h-6" /> : <Save className="w-6 h-6" />}
                    </motion.button>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                {/* Identity Section (Read Only / Core) */}
                <div className="bg-blue-50 dark:bg-blue-900/10 p-5 rounded-[2rem] flex flex-col gap-4 border border-blue-100 dark:border-blue-800/30">
                    <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1">Identity</h3>

                    {/* Full Name */}
                    <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase">
                            <User className="w-3 h-3" /> Full Name
                        </label>
                        <input
                            type="text"
                            value={profile.fullName}
                            onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                            className="bg-transparent border-b border-blue-200 dark:border-blue-800 py-1 outline-none font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>

                    {/* Email (Read Only) */}
                    <div className="flex flex-col gap-1 opacity-70">
                        <label className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase">
                            <Mail className="w-3 h-3" /> Gmail ID
                        </label>
                        <div className="font-mono text-sm font-bold text-slate-600 dark:text-slate-400">{profile.email}</div>
                    </div>

                    {/* DOB */}
                    <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase">
                            <Calendar className="w-3 h-3" /> Date of Birth
                        </label>
                        <input
                            type="date"
                            value={profile.dob}
                            onChange={(e) => setProfile({ ...profile, dob: e.target.value })}
                            className="bg-transparent border-b border-blue-200 dark:border-blue-800 py-1 outline-none font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>
                </div>

                {/* Medical Section */}
                <div className="glass p-5 rounded-[2rem] flex flex-col gap-4 shadow-xl">
                    <h3 className="text-xs font-black text-red-500 uppercase tracking-widest mb-1">Emergency Medical</h3>

                    {/* Blood Type */}
                    <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase">
                            <Droplets className="w-3 h-3" /> Blood Type
                        </label>
                        <input
                            type="text"
                            value={profile.bloodType}
                            onChange={(e) => setProfile({ ...profile, bloodType: e.target.value })}
                            placeholder="O+ / A- / B+"
                            className="bg-transparent border-b border-slate-200 dark:border-slate-700 py-1 outline-none font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>

                    {/* Emergency Contact */}
                    <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase">
                            <Phone className="w-3 h-3" /> Emergency Contact
                        </label>
                        <input
                            type="tel"
                            value={profile.emergencyContact}
                            onChange={(e) => setProfile({ ...profile, emergencyContact: e.target.value })}
                            placeholder="+1 234 567 890"
                            className="bg-transparent border-b border-slate-200 dark:border-slate-700 py-1 outline-none font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>

                    {/* Medical Conditions */}
                    <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase">
                            <Activity className="w-3 h-3" /> Medical Conditions
                        </label>
                        <textarea
                            value={profile.medicalConditions}
                            onChange={(e) => setProfile({ ...profile, medicalConditions: e.target.value })}
                            placeholder="Allergies, chronic illnesses, etc."
                            className="bg-transparent border-b border-slate-200 dark:border-slate-700 py-1 outline-none font-bold text-slate-700 dark:text-slate-200 resize-none h-20 text-sm leading-relaxed"
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4 mt-8">
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleSave}
                    className={`w-full py-5 rounded-[2.5rem] font-black flex items-center justify-center gap-3 transition-all shadow-2xl ${saved ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-emerald-900/30' : 'bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-blue-900/30'
                        }`}
                >
                    <Save className="w-6 h-6" />
                    {saved ? 'PROFILE UPDATED' : 'SAVE CHANGES'}
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                        if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                            // Remove from users list
                            const users = JSON.parse(localStorage.getItem('sos_users') || '[]');
                            const updatedUsers = users.filter(u => u.email !== profile.email);
                            localStorage.setItem('sos_users', JSON.stringify(updatedUsers));

                            // Clear current session
                            localStorage.removeItem('sos_user_profile');
                            localStorage.removeItem('sos_current_user');

                            onLogout();
                        }
                    }}
                    className="w-full py-4 rounded-[2.5rem] font-bold flex items-center justify-center gap-2 text-red-500 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all"
                >
                    <AlertTriangle className="w-5 h-5" />
                    Delete Account
                </motion.button>
            </div>
        </motion.div>
    );
}

export default Profile;
