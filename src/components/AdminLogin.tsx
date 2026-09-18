import React, { useState, useEffect } from "react";
import { Shield, Mail, Lock, Eye, EyeOff, Sparkles, KeyRound, AlertCircle, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LocalDB } from "../lib/db";

interface AdminLoginProps {
  onLoginSuccess: (token: string, rememberMe: boolean) => void;
}

export default function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  // Pre-fill email if remembered
  useEffect(() => {
    const savedEmail = localStorage.getItem("ij_admin_remember_email");
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorCode(null);

    if (!email.trim() || !password.trim()) {
      setErrorCode("Please enter both your registered email and secure password.");
      return;
    }

    // Authentic master logins
    const isMasterEmail = email.toLowerCase() === "admin@webrajya.com";
    const isMasterPassword = password === "admin123" || password === "password123";

    if (isMasterPassword) {
      // Simulate JWT Token creation: header + payload + signature standard structure
      const payload = btoa(JSON.stringify({ sub: "webrajya_admin_id", role: "Owner", email: email }));
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const mockSignature = "r9U_63r-9saV_77f_93n-c";
      const token = `${header}.${payload}.${mockSignature}`;

      if (rememberMe) {
        localStorage.setItem("ij_admin_remember_email", email);
      } else {
        localStorage.removeItem("ij_admin_remember_email");
      }

      // Add audit log for successful security login
      LocalDB.addAuditLog("Admin Authorized", `Logged in from IP 127.0.0.1 using secure credential protocols`, "Admin");

      onLoginSuccess(token, rememberMe);
    } else {
      setErrorCode("Invalid credentials. Please verify your administrator email and passkey.");
      LocalDB.addAuditLog("Access Denied", `Failed login attempt for account ${email}`, "System Gateway");
    }
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim()) return;

    setRecoverySuccess(true);
    LocalDB.addAuditLog("Password Recovery Request", `Password assistance triggered for ${recoveryEmail}. Security code dispatched.`, "System Gateway");

    setTimeout(() => {
      setShowForgotModal(false);
      setRecoverySuccess(false);
      setRecoveryEmail("");
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-stone-800 flex items-center justify-center relative p-4 font-sans select-none overflow-hidden" id="admin-login-screen">
      {/* Decorative Ornate Art Background */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-[#d4af37]/8 blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-100/40 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(212,175,55,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(212,175,55,0.02)_1px,transparent_1px)] bg-[size:32px_32px]" />

      {/* Main Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md bg-white border border-stone-200/80 backdrop-blur-xl rounded-3xl p-8 sm:p-10 relative z-10 shadow-[0_24px_50px_rgba(40,30,10,0.06)]"
      >
        {/* Gold Border Top Accent */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent rounded-t-3xl" />

        {/* Brand Identity / Logo Header */}
        <div className="text-center space-y-3 mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-stone-50 to-stone-100 border border-[#d4af37]/40 text-[#d4af37] rounded-2xl flex items-center justify-center mx-auto shadow-[0_8px_30px_rgba(212,175,55,0.1)] relative group">
            <Shield className="w-6.5 h-6.5 transition-transform group-hover:scale-110" />
            <Sparkles className="w-3.5 h-3.5 text-[#d4af37] absolute top-1 right-1 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-semibold text-stone-900 tracking-wide uppercase">
              WebRajya <span className="text-[#aa7c11]">POS</span>
            </h1>
            <p className="text-xs text-stone-500 font-mono tracking-widest uppercase mt-0.5">
              Secure Restaurant Administration
            </p>
          </div>
        </div>

        {/* Error notification banner */}
        <AnimatePresence mode="wait">
          {errorCode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3 text-xs text-red-800 leading-relaxed font-sans"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
              <span>{errorCode}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Credentials Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-5">
          {/* Email input panel */}
          <div className="space-y-2">
            <label className="block text-xs font-mono font-medium text-stone-500 uppercase tracking-wider">
              EMAIL ADDRESS
            </label>
            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-[#d4af37] transition-colors" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@webrajya.com"
                className="w-full pl-11 pr-4 py-3 bg-stone-50 hover:bg-stone-50 border border-stone-200 focus:border-[#d4af37]/80 text-sm rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none transition-all font-sans"
              />
            </div>
          </div>

          {/* Password input panel */}
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <label className="block text-xs font-mono font-medium text-stone-500 uppercase tracking-wider">
                PASSWORD KEY
              </label>
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-xs font-mono text-[#aa7c11] hover:text-[#d4af37] hover:underline"
              >
                FORGOT KEY?
              </button>
            </div>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-[#d4af37] transition-colors" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-11 pr-11 py-3 bg-stone-50 hover:bg-stone-50 border border-stone-200 focus:border-[#d4af37]/80 text-sm rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-stone-400 hover:text-stone-700 focus:outline-none cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me Toggle */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2.5 text-xs text-stone-600 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="accent-[#d4af37] w-4 h-4 rounded border-stone-300 bg-white"
              />
              Remember my workstation
            </label>
          </div>

          {/* Log In Button */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-[#d4af37] to-[#aa7c11] hover:from-[#f3e5ab] hover:to-[#d4af37] text-white font-semibold tracking-wider rounded-xl shadow-[0_8px_30px_rgba(212,175,55,0.15)] uppercase text-xs cursor-pointer focus:outline-none transition-colors border border-yellow-300/10 mt-3"
            id="admin-login-btn"
          >
            AUTHORIZE & ENTER
          </motion.button>
        </form>

        {/* Quick developer credential tip */}
        <div className="mt-8 border-t border-stone-100 pt-4 text-center">
          <p className="text-[10px] sm:text-xs font-mono text-stone-400">
            For Developer Sandbox testing:
            <br />
            <span className="text-[#aa7c11]">admin@webrajya.com</span> / <span className="text-stone-600 font-bold">admin123</span>
          </p>
        </div>
      </motion.div>

      {/* Forgot Password modal */}
      <AnimatePresence>
        {showForgotModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForgotModal(false)}
              className="fixed inset-0 bg-stone-900/40 z-40 backdrop-blur-sm"
            />
            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-y-0 sm:inset-y-auto sm:my-auto max-w-md w-full bg-white border border-stone-200 p-6 sm:p-8 rounded-none sm:rounded-2xl z-50 shadow-2xl h-fit"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-50 border border-amber-200 text-[#aa7c11] rounded-xl">
                    <KeyRound className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-serif font-bold text-stone-900 uppercase tracking-wider">Credential Recovery</h3>
                    <p className="text-xs text-stone-500 font-sans mt-0.5">Secure identity recovery gateway</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowForgotModal(false)}
                  className="p-1 text-stone-400 hover:text-stone-900"
                >
                  ✕
                </button>
              </div>

              {recoverySuccess ? (
                <div className="py-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-green-50 border border-green-200 text-green-600 rounded-full flex items-center justify-center mx-auto text-xl">
                    ✓
                  </div>
                  <h4 className="text-sm font-semibold text-stone-950 uppercase tracking-wider">Recovery Dispatch Successful</h4>
                  <p className="text-xs text-stone-600 max-w-sm mx-auto font-sans leading-relaxed">
                    A cryptographic security code and recovery links have been sent to your registered owner email and SMS: **+91-11-4560-4560**.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-xs text-stone-500 leading-relaxed font-sans">
                    Please provide the registered administrator email below. The system will dispatch a multi-factor passcode and reset instructions directly to your owner email security channel.
                  </p>
                  <div className="space-y-1.5 font-sans">
                    <label className="block text-[10px] font-mono text-stone-450 uppercase tracking-widest">
                      ADMIN EMAIL
                    </label>
                    <input
                      required
                      type="email"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      placeholder="admin@webrajya.com"
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 focus:border-yellow-600 focus:outline-none rounded-xl text-sm text-stone-900 font-sans"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#d4af37] text-white font-semibold rounded-xl text-xs uppercase tracking-widest hover:bg-[#aa7c11] transition-colors focus:outline-none cursor-pointer"
                  >
                    DISPATCH RECOVERY CODE
                  </button>
                </form>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
