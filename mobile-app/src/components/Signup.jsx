import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Calendar, ArrowRight, AlertTriangle, ShieldCheck, HeartPulse, Phone, FileText, Droplet } from 'lucide-react';

function Signup({ onSignup, onSwitchToLogin, auth, db }) {
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        dob: '',
        bloodType: '',
        emergencyContact: '',
        medicalConditions: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const validateDetails = () => {
        if (!formData.fullName || !formData.email || !formData.dob || !formData.password || !formData.confirmPassword || !formData.bloodType || !formData.emergencyContact) {
            setError('Please fill in all required fields');
            return false;
        }
        if (!formData.email.endsWith('@gmail.com')) {
            setError('Please use a valid Gmail address');
            return false;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return false;
        }
        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters');
            return false;
        }
        return true;
    };

    const handleSignupSubmit = async () => {
        if (!validateDetails()) return;

        setLoading(true);
        try {
            // Dynamic imports to keep bundle size low
            const { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } = await import('firebase/auth');
            const { ref, set } = await import('firebase/database');

            console.log("Starting signup process...");

            // 1. Create User
            const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
            const user = userCredential.user;
            console.log("User created:", user.uid);

            // 2. Update Profile Name
            await updateProfile(user, { displayName: formData.fullName });
            console.log("Profile updated");

            // 3. Send Verification Email
            await sendEmailVerification(user);
            console.log("Verification email sent");

            // 4. Save extra data to Realtime DB
            try {
                await set(ref(db, 'users/' + user.uid), {
                    fullName: formData.fullName,
                    email: formData.email,
                    dob: formData.dob,
                    bloodType: formData.bloodType,
                    emergencyContact: formData.emergencyContact,
                    medicalConditions: formData.medicalConditions || 'None',
                    joinedAt: Date.now(),
                    emailVerified: false // Explicitly false until they verify
                });
                console.log("Database updated");
            } catch (dbErr) {
                console.error("Database write failed:", dbErr);
            }

            setLoading(false);
            // The App.jsx onAuthStateChanged listener will detect the new user
            // and automatically switch to the "Verification Required" view.

        } catch (err) {
            console.error("Signup Error:", err);
            setLoading(false);
            if (err.code === 'auth/email-already-in-use') {
                alert('This email is already registered. Redirecting to login...');
                onSwitchToLogin();
            } else if (err.code === 'auth/weak-password') {
                setError('Password should be at least 6 characters.');
            } else {
                setError(err.message);
            }
        }
    };

    return (
        <div className="w-full max-w-md p-6">
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-4">
                    <img src="/google-mesh-logo.svg" alt="Logo" className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-black text-slate-800 dark:text-white">Create Account</h2>
                <p className="text-slate-500 text-sm font-medium mt-1">Join the Mesh Network</p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                <div className="flex flex-col gap-4">
                    {/* Full Name */}
                    <div className="input-group relative">
                        <User className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
                        <input
                            type="text"
                            name="fullName"
                            placeholder="Full Name"
                            value={formData.fullName}
                            onChange={handleChange}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border-none outline-none font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>

                    {/* Email */}
                    <div className="input-group relative">
                        <Mail className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
                        <input
                            type="email"
                            name="email"
                            placeholder="Gmail Address"
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border-none outline-none font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>

                    {/* DOB */}
                    <div className="input-group relative">
                        <Calendar className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
                        <input
                            type="date"
                            name="dob"
                            value={formData.dob}
                            onChange={handleChange}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border-none outline-none font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>

                    {/* Blood Type */}
                    <div className="input-group relative">
                        <Droplet className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
                        <select
                            name="bloodType"
                            value={formData.bloodType}
                            onChange={handleChange}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border-none outline-none font-bold text-slate-700 dark:text-slate-200 appearance-none"
                        >
                            <option value="">Select Blood Type</option>
                            <option value="A+">A+</option>
                            <option value="A-">A-</option>
                            <option value="B+">B+</option>
                            <option value="B-">B-</option>
                            <option value="AB+">AB+</option>
                            <option value="AB-">AB-</option>
                            <option value="O+">O+</option>
                            <option value="O-">O-</option>
                        </select>
                    </div>

                    {/* Emergency Contact */}
                    <div className="input-group relative">
                        <Phone className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
                        <input
                            type="tel"
                            name="emergencyContact"
                            placeholder="Emergency Contact (Phone)"
                            value={formData.emergencyContact}
                            onChange={handleChange}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border-none outline-none font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>

                    {/* Medical Conditions */}
                    <div className="input-group relative">
                        <FileText className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
                        <textarea
                            name="medicalConditions"
                            placeholder="Medical Conditions (Optional)"
                            value={formData.medicalConditions}
                            onChange={handleChange}
                            rows="2"
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border-none outline-none font-bold text-slate-700 dark:text-slate-200 resize-none"
                        />
                    </div>

                    {/* Password */}
                    <div className="input-group relative">
                        <Lock className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
                        <input
                            type="password"
                            name="password"
                            placeholder="Create Password"
                            value={formData.password}
                            onChange={handleChange}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border-none outline-none font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>

                    {/* Confirm Password */}
                    <div className="input-group relative">
                        <ShieldCheck className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
                        <input
                            type="password"
                            name="confirmPassword"
                            placeholder="Confirm Password"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border-none outline-none font-bold text-slate-700 dark:text-slate-200"
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-500 text-xs font-bold bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                            <AlertTriangle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleSignupSubmit}
                        disabled={loading}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 mt-2 transition-all"
                    >
                        {loading ? 'Creating Account...' : 'Create Account'} <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="text-center mt-6">
                <p className="text-slate-500 text-sm font-medium">
                    Already have an account?{' '}
                    <button onClick={onSwitchToLogin} className="text-blue-600 font-bold hover:underline">
                        Login
                    </button>
                </p>
            </div>
        </div>
    );
}

export default Signup;
