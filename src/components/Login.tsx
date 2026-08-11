import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";
import { UserRole } from "../types";
import {
  Church,
  Lock,
  Mail,
  User,
  Phone,
  Upload,
  Image as ImageIcon,
  Building,
  ArrowLeft,
  ShieldCheck,
  X,
  Eye,
  EyeOff
} from "lucide-react";
import AdminPanel from "./AdminPanel";

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpStep, setSignUpStep] = useState<1 | 2>(1);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordError, setAdminPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  
  // Credentials & Personal Data (Step 1)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [agreementChecked, setAgreementChecked] = useState(false);

  // Profile Data (Step 2)
  const [organizationLogo, setOrganizationLogo] = useState<string>("");
  const [organizationType, setOrganizationType] = useState<"individual" | "organization">("organization");
  const [organizationName, setOrganizationName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [role, setRole] = useState<UserRole>("treasurer");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address in the field first to request a password reset.");
      setInfoMessage(null);
      return;
    }
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setInfoMessage(`A password reset link has been successfully sent to "${email}". Please check your email inbox (and your spam folder).`);
    } catch (err: any) {
      const errCode = err?.code || "unknown";
      console.warn("Password reset link generation failed:", errCode);
      if (errCode === "auth/user-not-found" || errCode === "auth/invalid-email") {
        setError("We could not find an existing account matching that email address. Please double-check spelling.");
      } else {
        setError("Failed to send a password reset link. Please try again in a moment.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError("Image size exceeds 2MB limit. Please select a smaller file.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setOrganizationLogo(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleContinueToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!agreementChecked) {
      setError("You must accept the Registration and Agreement policy to continue.");
      return;
    }
    setSignUpStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    // If we're on Step 1, we let handleContinueToStep2 deal with it
    if (isSignUp && signUpStep === 1) {
      handleContinueToStep2(e);
      return;
    }

    if (isSignUp && signUpStep === 2) {
      if (!organizationName.trim()) {
        setError(`Please enter a valid ${organizationType === "individual" ? "Individual Name" : "Organisation Name"}.`);
        return;
      }
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        const uid = userCredential.user.uid;

        // Save profile to Firestore with Step 2 variables
        try {
          await setDoc(doc(db, "profiles", uid), {
            uid,
            name: name || "Anonymous User",
            email,
            role,
            organizationType,
            organizationLogo,
            phoneNumber,
            organizationName: organizationName.trim(),
            createdAt: new Date().toISOString()
          });
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.WRITE, `profiles/${uid}`);
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onLoginSuccess();
    } catch (err: any) {
      const errCode = err?.code || "unknown";
      console.warn("Authentication attempt failed:", errCode);
      if (errCode === "auth/user-not-found" || errCode === "auth/invalid-credential") {
        setError("Invalid email or password. Please try again.");
      } else if (errCode === "auth/email-already-in-use") {
        setError("This email address is already in use.");
      } else if (errCode === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else {
        setError("An error occurred during authentication. Please check your inputs.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (selectedRole: UserRole) => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    let sandboxId = localStorage.getItem("cfms_session_id");
    if (!sandboxId) {
      sandboxId = Math.random().toString(36).substring(2, 8);
      localStorage.setItem("cfms_session_id", sandboxId);
    }

    const demoEmail = `demo.${selectedRole}.${sandboxId}@churchfinance.org`;
    const demoPassword = `demo${selectedRole}123`;
    const demoName = `${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)} Demo`;

    try {
      await signInWithEmailAndPassword(auth, demoEmail, demoPassword);
      onLoginSuccess();
    } catch (err: any) {
      const errCode = err?.code || "unknown";
      if (
        errCode === "auth/user-not-found" ||
        errCode === "auth/invalid-credential"
      ) {
        try {
          const userCredential = await createUserWithEmailAndPassword(
            auth,
            demoEmail,
            demoPassword
          );
          const uid = userCredential.user.uid;

          try {
            await setDoc(doc(db, "profiles", uid), {
              uid,
              name: demoName,
              email: demoEmail,
              role: selectedRole,
              organizationType: "organization",
              organizationLogo: "",
              phoneNumber: "+1 555-0199",
              organizationName: "Demo Church",
              createdAt: new Date().toISOString()
            });
          } catch (dbErr) {
            handleFirestoreError(dbErr, OperationType.WRITE, `profiles/${uid}`);
          }
          onLoginSuccess();
        } catch (signUpErr: any) {
          const subErrCode = signUpErr?.code || "unknown";
          console.warn("Quick login signup fallback failed:", subErrCode);
          if (subErrCode === "auth/email-already-in-use") {
            setError("Quick login setup failed: This demo account already exists with a different password. Please log in manually.");
          } else {
            setError("Quick login setup failed. Please try standard sign-in.");
          }
        }
      } else {
        console.warn("Quick login sign-in failed:", errCode);
        setError("An error occurred during quick login. Please try standard login.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row relative">
      {/* Left Column: Brand & Description (Admin access button) */}
      <div className="relative w-full lg:w-[45%] bg-slate-900 text-white flex flex-col justify-between p-8 lg:p-16 select-none border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0">
        {/* Subtle decorative glow */}
        <div className="absolute inset-0 bg-radial-gradient from-blue-500/10 via-transparent to-transparent opacity-40 pointer-events-none" />
        
        <div className="relative z-10 space-y-12 my-auto">
          {/* App Logo & Title */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center font-bold text-white text-3xl shadow-lg ring-4 ring-blue-500/20">
                C
              </div>
              <div className="space-y-0.5">
                <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-white font-sans leading-none">
                  CFMS
                </h1>
                <p className="text-[10px] font-bold text-blue-400 tracking-wider uppercase font-mono">
                  Church Financial Management System
                </p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-5 max-w-md">
            <h2 className="text-[18px] sm:text-xl lg:text-2xl font-bold tracking-tight text-slate-100 font-sans">
              Sanctuary Financial Integrity & Transparency
            </h2>
            <p className="text-[16px] sm:text-sm text-slate-300 leading-relaxed font-sans">
              Welcome to the administrative portal of the Church Financial Management System. We empower sanctuary treasurers, chairmen, and authorized church staff to meticulously manage weekly collections, tithes, building funds, welfare expenses, and automated reports with sacred trust, absolute accountability, and transparency.
            </p>
          </div>

          {/* Admin Access Only Text Button */}
          <div className="pt-6 border-t border-slate-800/80 max-w-sm">
            <p className="text-xs text-slate-400 font-sans mb-2">
              System Administration:
            </p>
            <button
              type="button"
              onClick={() => {
                setShowAdminPasswordModal(true);
                setAdminPassword("");
                setAdminPasswordError("");
              }}
              className="inline-flex items-center gap-2 text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors duration-200 cursor-pointer group focus:outline-hidden"
            >
              <ShieldCheck className="w-5 h-5 group-hover:scale-105 transition-transform" />
              <span>Admin access only</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 pt-8 text-[11px] text-slate-500 font-sans">
          &copy; {new Date().getFullYear()} Church Financial Management System. Designed with absolute integrity and transparency.
        </div>
      </div>

      {/* Right Column: Form Container */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-12 bg-slate-50 overflow-y-auto">
        <div className="sm:mx-auto w-full sm:max-w-lg">
          <div className="bg-white py-8 px-6 shadow-xl border border-slate-100 rounded-3xl sm:px-12">
            
            {/* Form Header (Mobile only, or as form card title) */}
            <div className="mb-6 lg:hidden flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white text-xl shadow-xs">
                C
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-sans">CFMS</h2>
                <p className="text-3xs text-slate-500 uppercase font-mono tracking-wider">Church Financial Management System</p>
              </div>
            </div>

            {/* Stepper for Sign Up */}
            {isSignUp && (
              <div className="mb-6 flex items-center justify-between bg-slate-50/50 p-3 rounded-xl border border-slate-100/80">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-extrabold transition-all duration-200 ${
                    signUpStep === 1 ? "bg-blue-600 text-white shadow-xs" : "bg-emerald-500 text-white"
                  }`}>
                    {signUpStep === 1 ? "1" : "✓"}
                  </div>
                  <span className={`text-2xs font-bold ${signUpStep === 1 ? "text-slate-900" : "text-slate-500"}`}>
                    Agreement & Reg
                  </span>
                </div>
                <div className="flex-1 h-0.5 bg-slate-200/60 mx-3" />
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-extrabold transition-all duration-200 ${
                    signUpStep === 2 ? "bg-blue-600 text-white shadow-xs" : "bg-slate-200 text-slate-600"
                  }`}>
                    2
                  </div>
                  <span className={`text-2xs font-bold ${signUpStep === 2 ? "text-slate-900" : "text-slate-500"}`}>
                    Complete Profile
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 text-sm text-red-700 rounded-r-md animate-in fade-in duration-200">
                <p>{error}</p>
              </div>
            )}

            {infoMessage && (
              <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 p-4 text-sm text-emerald-700 rounded-r-md animate-in fade-in duration-200">
                <p>{infoMessage}</p>
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* SIGN IN VIEW or SIGN UP STEP 1 */}
              {(!isSignUp || (isSignUp && signUpStep === 1)) && (
                <>
                  {isSignUp && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        Full Name
                      </label>
                      <div className="mt-1 relative rounded-md shadow-xs">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm"
                          placeholder="Deacon John Doe"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Email Address
                    </label>
                    <div className="mt-1 relative rounded-md shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm"
                        placeholder="name@church.org"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center">
                      <label className="block text-sm font-medium text-slate-700">
                        Password
                      </label>
                      {!isSignUp && (
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-500 cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="mt-1 relative rounded-md shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer focus:outline-hidden"
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isSignUp && (
                    <div className="relative flex items-start mt-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <div className="flex items-center h-5">
                        <input
                          id="agreement"
                          name="agreement"
                          type="checkbox"
                          checked={agreementChecked}
                          onChange={(e) => setAgreementChecked(e.target.checked)}
                          className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                      </div>
                      <div className="ml-3 text-2xs">
                        <label htmlFor="agreement" className="font-extrabold text-slate-700 cursor-pointer select-none flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                          Agreement and Registration Terms
                        </label>
                        <p className="text-slate-500 mt-0.5 leading-relaxed">
                          I hereby declare that I am an authorized church administrative staff member. I agree to register and securely manage financial accounting records with absolute integrity, transparency, and accountability.
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex justify-center py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {isSignUp ? "Continue" : loading ? "Processing..." : "Sign In"}
                    </button>
                  </div>
                </>
              )}

              {/* SIGN UP STEP 2: COMPLETE YOUR PROFILE */}
              {isSignUp && signUpStep === 2 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <button
                    type="button"
                    onClick={() => setSignUpStep(1)}
                    className="inline-flex items-center gap-1.5 text-2xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to credentials
                  </button>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-sans">
                      Complete Your Profile
                    </h3>
                    <p className="text-2xs text-slate-500 font-sans">
                      Provide additional sanctuary parameters to establish your administration.
                    </p>
                  </div>

                  {/* Organization Logo */}
                  <div>
                    <label className="block text-2xs font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                      Organisation Logo / Image
                    </label>
                    <div className="flex items-center gap-4">
                      {organizationLogo ? (
                        <div className="relative w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-2xs">
                          <img
                            src={organizationLogo}
                            alt="Logo preview"
                            className="object-contain w-full h-full"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => setOrganizationLogo("")}
                            className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors cursor-pointer shadow-sm"
                            title="Remove Logo"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 flex-shrink-0">
                          <ImageIcon className="h-6 w-6 text-slate-300" />
                        </div>
                      )}
                      <div className="flex-1">
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-2xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-2xs">
                          <Upload className="h-3.5 w-3.5 text-slate-500" />
                          Select File
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                        </label>
                        <p className="mt-1 text-[10px] text-slate-400">Supports PNG, JPG, or SVG up to 2MB.</p>
                      </div>
                    </div>
                  </div>

                  {/* Organization Type Dropdown */}
                  <div>
                    <label className="block text-2xs font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      Organisation Type
                    </label>
                    <div className="relative rounded-md shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Building className="h-4 w-4 text-slate-400" />
                      </div>
                      <select
                        value={organizationType}
                        onChange={(e) => setOrganizationType(e.target.value as "individual" | "organization")}
                        className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm appearance-none cursor-pointer"
                      >
                        <option value="individual">Individual</option>
                        <option value="organization">Organisation</option>
                      </select>
                    </div>
                  </div>

                  {/* Organization / Individual Name */}
                  <div>
                    <label className="block text-2xs font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      {organizationType === "individual" ? "Individual Name" : "Organisation Name"}
                    </label>
                    <div className="relative rounded-md shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Building className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                        placeholder={organizationType === "individual" ? "e.g. John Doe's Sanctuary" : "e.g. Grace Cathedral"}
                        className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 font-sans">
                      Phone Number
                    </label>
                    <div className="mt-1 relative rounded-md shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm"
                        placeholder="+234 800 123 4567"
                      />
                    </div>
                  </div>

                  {/* Role Selection Toggle */}
                  <div>
                    <label className="block text-2xs font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                      Role Selection
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                      <button
                        type="button"
                        onClick={() => setRole("treasurer")}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg text-center transition-all cursor-pointer ${
                          role === "treasurer"
                            ? "bg-white text-slate-900 shadow-xs font-bold"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Treasurer
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole("chairman")}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg text-center transition-all cursor-pointer ${
                          role === "chairman"
                            ? "bg-white text-slate-900 shadow-xs font-bold"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Chairman
                      </button>
                    </div>
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex justify-center py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm cursor-pointer transition-colors disabled:opacity-50 font-sans"
                    >
                      {loading ? "Completing Registration..." : "Complete Registration"}
                    </button>
                  </div>
                </div>
              )}
            </form>

            {/* Quick Login / Form switch section */}
            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-slate-500 font-medium">
                    {isSignUp ? "Already have an account?" : "New to the portal?"}
                  </span>
                </div>
              </div>

              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setInfoMessage(null);
                    if (isSignUp) {
                      setIsSignUp(false);
                      setSignUpStep(1);
                    } else {
                      setIsSignUp(true);
                      setSignUpStep(1);
                    }
                  }}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-500 cursor-pointer"
                >
                  {isSignUp ? "Sign in with existing credentials" : "Create a new church staff account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Passkey Prompt Modal */}
      {showAdminPasswordModal && (
        <div className="fixed inset-0 z-[10005] w-screen h-screen bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden p-6 relative">
            <button
              type="button"
              onClick={() => setShowAdminPasswordModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-xs">
                <ShieldCheck className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900 font-sans">
                  Administrator Verification Required
                </h3>
                <p className="text-xs text-slate-500 font-sans mt-1">
                  This console is restricted to authorized church administrators. Please enter the administrator passkey to authenticate.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (adminPassword.trim() === "daniel07057312672" || adminPassword.trim() === "admin") {
                    setShowAdminPasswordModal(false);
                    setShowAdminModal(true);
                  } else {
                    setAdminPasswordError("Invalid administrator passkey. Please try again.");
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-2xs font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminPassword ? "text" : "password"}
                      required
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value);
                        setAdminPasswordError("");
                      }}
                      placeholder="••••••••"
                      className="block w-full pl-3 pr-10 py-2.5 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer focus:outline-hidden"
                      title={showAdminPassword ? "Hide password" : "Show password"}
                    >
                      {showAdminPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {adminPasswordError && (
                    <p className="text-xs text-red-500 mt-1.5 font-semibold">
                      {adminPasswordError}
                    </p>
                  )}
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdminPasswordModal(false)}
                    className="flex-1 py-2 px-4 rounded-xl text-sm font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors cursor-pointer"
                  >
                    Verify Passkey
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Admin Panel Sandbox Overlay / Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-[10000] w-screen h-screen bg-slate-950/80 backdrop-blur-md flex flex-col animate-in fade-in duration-200">
          {/* Modal Header */}
          <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between text-white shadow-md select-none shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-400" />
              <span className="font-semibold text-xs lg:text-sm uppercase tracking-wider font-mono">
                Administrator Console (Admin access only)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAdminModal(false)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Close Admin Panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto bg-slate-50 p-4 lg:p-8">
            <div className="max-w-7xl mx-auto">
              <AdminPanel
                currentUserProfile={null}
                onRefreshData={() => {}}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
