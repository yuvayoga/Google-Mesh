import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, LogIn, AlertTriangle, ArrowRight, CheckCircle2, KeyRound, Eye, EyeOff, Trash2 } from 'lucide-react';

function Login({ onLogin, onSwitchToSignup, auth }) {
    const [view, setView] = useState('login'); // 'login', 'forgot-email', 'forgot-otp', 'forgot-new-password'
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        otp: '',
        newPassword: '',
        confirmNewPassword: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [generatedOtp, setGeneratedOtp] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);


    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleLoginSubmit = async () => {
        if (!formData.email || !formData.password) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        try {
            const { signInWithEmailAndPassword } = await import('firebase/auth');

            // Use auth prop
            const userCredential = await signInWithEmailAndPassword(auth, formData.email.trim(), formData.password);
            const user = userCredential.user;

            // Pass user back to App
            onLogin({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                emailVerified: user.emailVerified
            });

        } catch (err) {
            console.error(err);
            setLoading(false);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError('Invalid email or password');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many failed attempts. Try again later.');
            } else {
                setError('Login failed. Please check your connection.');
            }
        }
    };

    const handleSendResetOTP = async () => {
        const email = formData.email.trim();
        if (!email.endsWith('@gmail.com')) {
            setError('Please enter a valid Gmail address');
            return;
        }

        setLoading(true);
        try {
            const { sendPasswordResetEmail } = await import('firebase/auth');

            await sendPasswordResetEmail(auth, email);

            setLoading(false);
            alert(`Password Reset Email Sent!\n\nCheck your inbox at ${email}.\nClick the link in the email to set a new password.`);
            setView('login'); // Go back to login since they need to check email

        } catch (err) {
            console.error(err);
            setLoading(false);
            if (err.code === 'auth/user-not-found') {
                setError('No account found with this email');
            } else {
                setError(err.message);
            }
        }
    };

    const handleVerifyResetOTP = () => {
        if (formData.otp !== generatedOtp) {
            setError('Invalid OTP code');
            return;
        }
        setView('forgot-new-password');
    };

    const handleResetPassword = () => {
        if (formData.newPassword !== formData.confirmNewPassword) {
            setError('Passwords do not match');
            return;
        }
        if (formData.newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        setTimeout(() => {
            const users = JSON.parse(localStorage.getItem('sos_users') || '[]');
            const email = formData.email.trim();
            const updatedUsers = users.map(u => {
                if (u.email === email) {
                    return { ...u, password: formData.newPassword };
                }
                return u;
            });

            localStorage.setItem('sos_users', JSON.stringify(updatedUsers));
            setLoading(false);
            alert('Password reset successful! Please login with your NEW password.');
            setView('login');
            setFormData(prev => ({ ...prev, password: '', otp: '', newPassword: '', confirmNewPassword: '' }));
        }, 1000);
    };



    return (
        <div className="w-full max-w-md p-6">
            <div className="text-center mb-10">
                <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto mb-6 rotate-3 hover:rotate-6 transition-transform">
                    <img src="/google-mesh-logo.svg" alt="Logo" className="w-12 h-12" />
                </div>
                <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                    {view === 'login' ? 'Welcome Back' : 'Reset Password'}
                </h2>
                <p className="text-slate-500 text-sm font-medium mt-2">
                    {view === 'login' ? 'Login to Google Mesh' : 'Recover your account'}
                </p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
                <AnimatePresence mode="wait">

                    {/* LOGIN VIEW */}
                    {view === 'login' && (
                        <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col gap-5">
                            <div className="relative group">
                                <Mail className="w-5 h-5 text-slate-400 absolute left-4 top-4 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="email"
                                    name="email"
                                    placeholder="Gmail Address"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-700 dark:text-slate-200 transition-all"
                                />
                            </div>

                            <div className="relative group">
                                <Lock className="w-5 h-5 text-slate-400 absolute left-4 top-4 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="w-full pl-12 pr-12 py-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-700 dark:text-slate-200 transition-all"
                                />
                                <button
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-4 text-slate-400 hover:text-blue-500"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>

                            <div className="flex justify-end">
                                <button onClick={() => setView('forgot-email')} className="text-xs font-bold text-blue-500 hover:text-blue-600">
                                    Forgot Password?
                                </button>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-red-500 text-xs font-bold bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
                                    <AlertTriangle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handleLoginSubmit}
                                disabled={loading}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 mt-2 transition-all active:scale-95"
                            >
                                {loading ? 'Verifying...' : 'Login'} <LogIn className="w-5 h-5" />
                            </button>
                        </motion.div>
                    )}

                    {/* FORGOT PASSWORD - EMAIL */}
                    {view === 'forgot-email' && (
                        <motion.div key="forgot-email" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5">
                            <p className="text-sm text-slate-500 font-medium mb-2">Enter your registered Gmail address to receive a verification code.</p>
                            <div className="relative group">
                                <Mail className="w-5 h-5 text-slate-400 absolute left-4 top-4 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="email"
                                    name="email"
                                    placeholder="Gmail Address"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-700 dark:text-slate-200 transition-all"
                                />
                            </div>
                            {error && <div className="text-red-500 text-xs font-bold">{error}</div>}
                            <button onClick={handleSendResetOTP} disabled={loading} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 mt-2">
                                {loading ? 'Sending...' : 'Send Reset Link'} <ArrowRight className="w-5 h-5" />
                            </button>
                            <button onClick={() => setView('login')} className="text-slate-400 text-xs font-bold hover:text-slate-600 text-center mt-2">Back to Login</button>
                        </motion.div>
                    )}

                    {/* FORGOT PASSWORD - OTP */}
                    {view === 'forgot-otp' && (
                        <motion.div key="forgot-otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5 text-center">
                            <p className="text-sm text-slate-500 font-medium">Enter the code sent to <b>{formData.email}</b></p>

                            {/* DEMO OTP DISPLAY */}
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 p-3 rounded-xl">
                                <p className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-widest mb-1">Demo Mode Code</p>
                                <p className="text-2xl font-black text-slate-800 dark:text-white tracking-widest">{generatedOtp}</p>
                            </div>

                            <input
                                type="text"
                                name="otp"
                                maxLength={6}
                                placeholder="000000"
                                value={formData.otp}
                                onChange={(e) => {
                                    setFormData({ ...formData, otp: e.target.value.replace(/[^0-9]/g, '') });
                                    setError('');
                                }}
                                className="w-full text-center text-3xl font-black tracking-[0.5em] py-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none transition-all"
                            />
                            {error && <div className="text-red-500 text-xs font-bold">{error}</div>}
                            <button onClick={handleVerifyResetOTP} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 mt-2">
                                Verify Code <CheckCircle2 className="w-5 h-5" />
                            </button>
                        </motion.div>
                    )}

                    {/* FORGOT PASSWORD - NEW PASSWORD */}
                    {view === 'forgot-new-password' && (
                        <motion.div key="forgot-new-password" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-5">
                            <p className="text-sm text-slate-500 font-medium mb-2">Create a new password for your account.</p>
                            <div className="relative group">
                                <KeyRound className="w-5 h-5 text-slate-400 absolute left-4 top-4 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="password"
                                    name="newPassword"
                                    placeholder="New Password"
                                    value={formData.newPassword}
                                    onChange={handleChange}
                                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-700 dark:text-slate-200 transition-all"
                                />
                            </div>
                            <div className="relative group">
                                <KeyRound className="w-5 h-5 text-slate-400 absolute left-4 top-4 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="password"
                                    name="confirmNewPassword"
                                    placeholder="Confirm New Password"
                                    value={formData.confirmNewPassword}
                                    onChange={handleChange}
                                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-700 dark:text-slate-200 transition-all"
                                />
                            </div>
                            {error && <div className="text-red-500 text-xs font-bold">{error}</div>}
                            <button onClick={handleResetPassword} disabled={loading} className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black shadow-lg shadow-green-500/30 flex items-center justify-center gap-2 mt-2">
                                {loading ? 'Updating...' : 'Reset Password'} <CheckCircle2 className="w-5 h-5" />
                            </button>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>

            <div className="text-center mt-8">
                <p className="text-slate-500 text-sm font-medium">
                    New to Mesh?{' '}
                    <button onClick={onSwitchToSignup} className="text-blue-600 font-bold hover:underline">
                        Create Account
                    </button>
                </p>


            </div>
        </div>
    );
}

export default Login;
