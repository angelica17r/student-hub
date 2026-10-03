"use client";

import React, { useState, useEffect } from "react";
import {
  Moon,
  Sun,
  User,
  MessageSquare,
  GraduationCap,
  Settings,
  ArrowRight,
  Upload,
  Copy,
  Check,
  LogOut,
  ChevronLeft,
  Users,
  Share2,
  BookOpen,
  CheckSquare,
  Award,
  Clock,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  PlusCircle,
  CheckCircle2,
  XCircle
} from "lucide-react";

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

interface Subject {
  id: string;
  name: string;
  attended: number;
  total: number;
  target: number;
}

interface CourseGrade {
  id: string;
  name: string;
  credits: number;
  cia: number;
  ese: number;
  maxCia: number;
  maxEse: number;
  isCapped: boolean;
  totalMarks: number;
  maxMarks: number;
  gradePoints: number;
  gradeLetter: string;
}

const calculateGradePoint = (
  ciaScore: number, 
  eseScore: number, 
  maxCia: number, 
  maxEse: number, 
  isCapped: boolean
) => {
  const totalMarks = ciaScore + eseScore;
  const maxMarks = maxCia + maxEse;
  const percentage = maxMarks > 0 ? (totalMarks / maxMarks) * 100 : 0;

  let gp = 0;
  let letter = "FF";

  if (percentage < 40) {
    gp = 0;
    letter = "FF";
  } else if (percentage >= 80) {
    gp = 10;
    letter = "AA";
  } else if (percentage >= 70) {
    gp = 9;
    letter = "AB";
  } else if (percentage >= 60) {
    gp = 8;
    letter = "BB";
  } else if (percentage >= 50) {
    gp = 6;
    letter = "CC";
  } else {
    gp = 4;
    letter = "DD";
  }

  if (isCapped && gp > 9) {
    gp = 9;
    letter = "AB (Capped)";
  }

  return { gp, letter, totalMarks, maxMarks };
};

export default function App() {
  // Navigation & Screens State
  const [screen, setScreen] = useState<"auth" | "profile-setup" | "home">("auth");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [homeTab, setHomeTab] = useState<"hub" | "chat" | "academics" | "account">("hub");
  const [academicsSubTab, setAcademicsSubTab] = useState<"dashboard" | "tasks" | "pomodoro" | "subjects" | "grades">("dashboard");
  const [darkMode, setDarkMode] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Authentication & Profile State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [registeredUsers, setRegisteredUsers] = useState<{ [email: string]: { password: string; username: string; pfp: string | null; friendCode: string } }>({});
  
  const [friendCode, setFriendCode] = useState("");
  const [pfp, setPfp] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [copied, setCopied] = useState(false);

  // --- STUDY APP FUNCTIONALITY STATE ---
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courses, setCourses] = useState<CourseGrade[]>([]);

  // Generate 6-digit Friend Code & load LocalStorage on initial load
  useEffect(() => {
    setMounted(true);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setFriendCode(code);

    const savedTasks = localStorage.getItem("studysync_tasks");
    const savedSubjects = localStorage.getItem("studysync_subjects");
    const savedCourses = localStorage.getItem("studysync_courses");
    const savedUsers = localStorage.getItem("studysync_registered_users");

    if (savedTasks) setTasks(JSON.parse(savedTasks));
    if (savedSubjects) setSubjects(JSON.parse(savedSubjects));
    if (savedCourses) setCourses(JSON.parse(savedCourses));
    if (savedUsers) setRegisteredUsers(JSON.parse(savedUsers));
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem("studysync_tasks", JSON.stringify(tasks));
  }, [tasks, mounted]);

  useEffect(() => {
    if (mounted) localStorage.setItem("studysync_subjects", JSON.stringify(subjects));
  }, [subjects, mounted]);

  useEffect(() => {
    if (mounted) localStorage.setItem("studysync_courses", JSON.stringify(courses));
  }, [courses, mounted]);

  useEffect(() => {
    if (mounted) localStorage.setItem("studysync_registered_users", JSON.stringify(registeredUsers));
  }, [registeredUsers, mounted]);

  // Handle image upload preview
  const handlePfpUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPfp(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const copyFriendCode = () => {
    navigator.clipboard.writeText(friendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle Login validation
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    if (!email.trim() || !password.trim()) {
      setAuthError("Please fill in all fields.");
      return;
    }

    const userRecord = registeredUsers[email.trim().toLowerCase()];
    if (!userRecord) {
      setAuthError("No account found with this email. Please sign up first.");
      return;
    }

    if (userRecord.password !== password) {
      setAuthError("Incorrect password. Please try again.");
      return;
    }

    setUsername(userRecord.username);
    setPfp(userRecord.pfp);
    setFriendCode(userRecord.friendCode);
    setHomeTab("hub");
    setScreen("home");
  };

  // Handle Sign Up creation
  const handleRegisterProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !username.trim()) {
      setAuthError("Please fill in all fields.");
      return;
    }

    const updatedUsers = {
      ...registeredUsers,
      [email.trim().toLowerCase()]: {
        password,
        username,
        pfp,
        friendCode
      }
    };

    setRegisteredUsers(updatedUsers);
    setHomeTab("hub");
    setScreen("home");
  };

  // --- TASKS ACTIONS ---
  const [newTask, setNewTask] = useState("");
  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    const item: Task = { id: Date.now().toString(), text: newTask, completed: false };
    setTasks([item, ...tasks]);
    setNewTask("");
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const deleteTask = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTasks(tasks.filter((t) => t.id !== id));
  };

  // --- SUBJECTS ACTIONS ---
  const [newSubName, setNewSubName] = useState("");
  const [newSubAttended, setNewSubAttended] = useState<number | "">("");
  const [newSubTotal, setNewSubTotal] = useState<number | "">("");

  const addSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    const item: Subject = {
      id: Date.now().toString(),
      name: newSubName,
      attended: Number(newSubAttended) || 0,
      total: Number(newSubTotal) || 0,
      target: 75,
    };
    setSubjects([...subjects, item]);
    setNewSubName("");
    setNewSubAttended("");
    setNewSubTotal("");
  };

  const markAttendance = (id: string, attendedDelta: number, totalDelta: number) => {
    setSubjects(
      subjects.map((sub) => {
        if (sub.id === id) {
          return {
            ...sub,
            attended: Math.max(0, sub.attended + attendedDelta),
            total: Math.max(0, sub.total + totalDelta),
          };
        }
        return sub;
      })
    );
  };

  const deleteSubject = (id: string) => {
    setSubjects(subjects.filter((s) => s.id !== id));
  };

  // --- GRADES ACTIONS ---
  const [courseName, setCourseName] = useState("");
  const [courseCredits, setCourseCredits] = useState<number | "">(4);
  const [ciaScore, setCiaScore] = useState<number | "">("");
  const [eseScore, setEseScore] = useState<number | "">("");
  const [maxCia, setMaxCia] = useState<number | "">(40);
  const [maxEse, setMaxEse] = useState<number | "">(60);
  const [isCapped, setIsCapped] = useState(false);

  // Auto-adjust max CIA and ESE when credit changes (4 credits = 40/60, 2 credits = 20/30)
  const handleCreditChange = (val: number | "") => {
    setCourseCredits(val);
    if (val === 4) {
      setMaxCia(40);
      setMaxEse(60);
    } else if (val === 2) {
      setMaxCia(20);
      setMaxEse(30);
    }
  };

  const addCourseGrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim() || ciaScore === "" || eseScore === "") return;

    const credits = Number(courseCredits) || 4;
    const cia = Number(ciaScore);
    const ese = Number(eseScore);
    const mCia = Number(maxCia) || (credits === 2 ? 20 : 40);
    const mEse = Number(maxEse) || (credits === 2 ? 30 : 60);

    const { gp, letter, totalMarks, maxMarks } = calculateGradePoint(cia, ese, mCia, mEse, isCapped);

    const newCourse: CourseGrade = {
      id: Date.now().toString(),
      name: courseName,
      credits,
      cia,
      ese,
      maxCia: mCia,
      maxEse: mEse,
      isCapped,
      totalMarks,
      maxMarks,
      gradePoints: gp,
      gradeLetter: letter,
    };

    setCourses([...courses, newCourse]);
    setCourseName("");
    setCourseCredits(4);
    setMaxCia(40);
    setMaxEse(60);
    setCiaScore("");
    setEseScore("");
    setIsCapped(false);
  };

  const deleteCourse = (id: string) => {
    setCourses(courses.filter((c) => c.id !== id));
  };

  const totalCredits = courses.reduce((acc, c) => acc + c.credits, 0);
  const totalWeightedPoints = courses.reduce((acc, c) => acc + c.credits * c.gradePoints, 0);
  const sgpa = totalCredits > 0 ? (totalWeightedPoints / totalCredits).toFixed(2) : "0.00";

  // --- POMODORO TIMER ---
  const [timeLeft, setTimeLeft] = useState(1500);
  const [timerDuration, setTimerDuration] = useState(1500);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const totalAttendedAll = subjects.reduce((acc, s) => acc + s.attended, 0);
  const totalClassesAll = subjects.reduce((acc, s) => acc + s.total, 0);
  const overallPercentage = totalClassesAll > 0 ? ((totalAttendedAll / totalClassesAll) * 100).toFixed(1) : "0.0";

  if (!mounted) return null;

  return (
    <div className={`study-sync-shell min-h-screen flex items-center justify-center font-sans transition-colors duration-300 p-4 ${darkMode ? "bg-[#101735] text-slate-100" : "bg-[#ead39d] text-slate-900"}`}>
      <style>{`
        .study-sync-scene {
          --ink: #f2f0ff;
          --muted: #bab7d5;
          --panel: rgba(25, 27, 78, .96);
          --surface: rgba(13, 17, 54, .82);
          --surface-raised: rgba(37, 42, 105, .92);
          --line: rgba(165, 157, 255, .36);
          --input: rgba(9, 13, 43, .9);
          --accent: #a99cff;
          --pixel-shadow: #111338;
          position: relative;
          isolation: isolate;
          overflow: hidden;
          color: var(--ink);
          background: #111638;
        }
        .study-sync-scene::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 0;
          pointer-events: none;
          background-color: #101735;
          background-image:
            radial-gradient(circle, #f9f1c5 0 1px, transparent 1.8px),
            radial-gradient(circle, #c6c1ff 0 1px, transparent 1.8px),
            linear-gradient(180deg, transparent 0 68%, rgba(29, 39, 83, .25) 68% 100%),
            linear-gradient(180deg, #111735 0%, #20245a 66%, #34366f 100%);
          background-size: 79px 73px, 113px 97px, 100% 100%, 100% 100%;
          background-position: 8px 14px, 33px 20px, center, center;
        }
        .study-sync-scene::after {
          content: "";
          position: absolute;
          z-index: -1;
          top: 8%;
          right: 13%;
          width: 12px;
          height: 12px;
          background: #f7e8aa;
          box-shadow: 12px 0 #f7e8aa, 24px 0 #f7e8aa, 36px 0 #f7e8aa,
            0 12px #f7e8aa, 12px 12px #f7e8aa, 24px 12px #f7e8aa, 36px 12px #f7e8aa, 48px 12px #f7e8aa,
            0 24px #f7e8aa, 12px 24px #f7e8aa, 24px 24px #e8d78f, 36px 24px #f7e8aa, 48px 24px #f7e8aa,
            12px 36px #f7e8aa, 24px 36px #f7e8aa, 36px 36px #f7e8aa, 48px 36px #f7e8aa,
            24px 48px #f7e8aa, 36px 48px #f7e8aa;
          opacity: .92;
          pointer-events: none;
        }
        .study-sync-panel {
          color: var(--ink);
          background: var(--panel);
          border-color: var(--line);
          box-shadow: 0 0 0 4px rgba(9, 13, 36, .42), 0 18px 0 var(--pixel-shadow), 0 30px 60px rgba(0,0,0,.32);
          background: transparent;
          backdrop-filter: none;
        }
        .study-sync-scene button { border-radius: 7px; image-rendering: pixelated; transition: transform .16s ease, filter .16s ease, background-color .16s ease; }
        .study-sync-scene button:hover { filter: brightness(1.08); }
        .study-sync-scene button:active { transform: translateY(2px); }
        .study-sync-scene input { color: var(--ink); border-color: var(--line); }
        .study-sync-scene input::placeholder { color: var(--muted); opacity: .8; }
        .theme-night .bg-slate-950 { background-color: var(--surface) !important; }
        .theme-night .bg-slate-900 { background-color: rgba(17, 21, 61, .92) !important; }
        .theme-night .bg-slate-800 { background-color: var(--surface-raised) !important; }
        .theme-night .border-slate-800, .theme-night .border-slate-700 { border-color: var(--line) !important; }
        .theme-night .text-slate-100, .theme-night .text-slate-200 { color: var(--ink) !important; }
        .theme-night .text-slate-400, .theme-night .text-slate-500 { color: var(--muted) !important; }
        .theme-night input.bg-slate-950, .theme-night input.bg-slate-900 { background-color: var(--input) !important; }
        .theme-day {
          --ink: #49351f;
          --muted: #806d57;
          --panel: rgba(255, 248, 225, .96);
          --surface: rgba(255, 251, 235, .96);
          --surface-raised: #f3e5c5;
          --line: rgba(144, 105, 55, .30);
          --input: #fffdf5;
          --accent: #b86a37;
          --pixel-shadow: #bd9860;
          background: #f2c66d;
        }
        .theme-day::before {
          background-color: #f5ce79;
          background-image:
            linear-gradient(180deg, transparent 0 60%, rgba(255, 243, 194, .25) 60% 100%),
            linear-gradient(180deg, transparent 0 69%, #9cc078 69% 100%),
            linear-gradient(180deg, transparent 0 78%, #71945e 78% 100%),
            radial-gradient(circle, #fff9da 0 2px, transparent 2.8px),
            linear-gradient(180deg, #f4ce7b 0%, #f8df9a 64%, #abc87c 100%);
          background-size: 100% 100%, 100% 100%, 100% 100%, 91px 83px, 100% 100%;
          background-position: center;
        }
        .theme-day::after {
          background: #fff1a8;
          box-shadow: 12px 0 #fff1a8, 24px 0 #fff1a8, 36px 0 #fff1a8,
            0 12px #fff1a8, 12px 12px #fff1a8, 24px 12px #fff1a8, 36px 12px #fff1a8, 48px 12px #fff1a8,
            0 24px #fff1a8, 12px 24px #fff1a8, 24px 24px #ffe889, 36px 24px #fff1a8, 48px 24px #fff1a8,
            12px 36px #fff1a8, 24px 36px #fff1a8, 36px 36px #fff1a8, 48px 36px #fff1a8,
            24px 48px #fff1a8, 36px 48px #fff1a8;
        }
        .theme-day .study-sync-panel { background: transparent; border-color: #b58a51; box-shadow: 0 0 0 4px rgba(255, 248, 225, .8), 0 18px 0 var(--pixel-shadow), 0 30px 60px rgba(102, 71, 34, .2); }
        .theme-day .bg-slate-950, .theme-day .bg-slate-900, .theme-day .bg-slate-800 { background-color: var(--surface) !important; }
        .theme-day .bg-slate-50 { background-color: #fff9e9 !important; }
        .theme-day .bg-white { background-color: #fffdf5 !important; }
        .theme-day .border-slate-800, .theme-day .border-slate-700, .theme-day .border-slate-200, .theme-day .border-slate-300 { border-color: var(--line) !important; }
        .theme-day .text-white, .theme-day .text-slate-100, .theme-day .text-slate-200, .theme-day .text-slate-300, .theme-day .text-slate-400, .theme-day .text-slate-500, .theme-day .text-slate-600, .theme-day .text-slate-700, .theme-day .text-slate-800, .theme-day .text-slate-900 { color: var(--ink) !important; }
        .theme-day button.bg-indigo-600, .theme-day button.bg-indigo-600 *, .theme-day button.bg-emerald-600, .theme-day button.bg-emerald-600 *, .theme-day button.bg-teal-600, .theme-day button.bg-teal-600 *, .theme-day button.bg-amber-600, .theme-day button.bg-amber-600 *, .theme-day button.bg-rose-600, .theme-day button.bg-rose-600 * { color: #fff !important; }
        .theme-day input.bg-slate-950, .theme-day input.bg-slate-900 { background-color: var(--input) !important; }
        .theme-day .bg-indigo-950, .theme-day .bg-emerald-950, .theme-day .bg-rose-950, .theme-day .bg-amber-950 { background-color: #f4e6c8 !important; }
        .theme-day .text-indigo-300, .theme-day .text-indigo-400, .theme-day .text-indigo-500 { color: #7255a6 !important; }
        .theme-day .text-emerald-300, .theme-day .text-emerald-400 { color: #397b50 !important; }
        .theme-day .text-amber-300, .theme-day .text-amber-400 { color: #9a621f !important; }
        .theme-day .text-rose-300, .theme-day .text-rose-400 { color: #a84848 !important; }
        .theme-day .study-sync-panel .flex-1.overflow-y-auto { scrollbar-color: #c39b62 transparent; }
        @media (max-width: 480px) {
          .study-sync-shell { align-items: flex-start; padding: 12px !important; }
          .study-sync-panel { min-height: calc(100vh - 24px) !important; }
          .study-sync-scene::after { right: 9%; top: 5%; transform: scale(.8); transform-origin: top right; }
        }
        /* Reference-inspired color and surface pass: twilight plum + warm blush */
        .study-sync-scene button { border-radius: 999px; }
        .study-sync-scene.theme-night {
          --ink: #fbe4d8;
          --muted: #d1b7cf;
          --panel: rgba(43, 18, 76, .97);
          --surface: rgba(82, 43, 91, .82);
          --surface-raised: rgba(134, 79, 108, .62);
          --line: rgba(223, 182, 210, .24);
          --input: rgba(25, 0, 25, .72);
          --accent: #dfb6d2;
          --pixel-shadow: #190019;
          background: #190019;
        }
        .study-sync-scene.theme-night::before {
          background-color: #190019;
          background-image:
            radial-gradient(circle at 15% 18%, rgba(251,228,216,.95) 0 1px, transparent 2px),
            radial-gradient(circle at 78% 13%, rgba(223,182,210,.9) 0 1px, transparent 2px),
            radial-gradient(circle at 54% 31%, rgba(251,228,216,.72) 0 1px, transparent 2px),
            radial-gradient(circle at 88% 48%, rgba(223,182,210,.84) 0 1px, transparent 2px),
            radial-gradient(circle at 22% 65%, rgba(251,228,216,.82) 0 1px, transparent 2px),
            radial-gradient(circle at 69% 79%, rgba(223,182,210,.75) 0 1px, transparent 2px),
            radial-gradient(ellipse at 50% 100%, rgba(134,79,108,.85), transparent 48%),
            linear-gradient(160deg, #2b124c 0%, #351748 54%, #190019 100%);
          background-size: 100% 100%;
          background-position: center;
        }
        .study-sync-scene.theme-night::after {
          width: 12px; height: 12px; top: 8%; right: 13%;
          background: #fbe4d8;
          box-shadow: 12px 0 #fbe4d8, 24px 0 #fbe4d8, 36px 0 #fbe4d8,
            0 12px #fbe4d8, 12px 12px #fbe4d8, 24px 12px #dfb6d2, 36px 12px #fbe4d8, 48px 12px #fbe4d8,
            0 24px #fbe4d8, 12px 24px #fbe4d8, 24px 24px #dfb6d2, 36px 24px #fbe4d8, 48px 24px #fbe4d8,
            12px 36px #fbe4d8, 24px 36px #fbe4d8, 36px 36px #fbe4d8, 48px 36px #fbe4d8,
            24px 48px #fbe4d8, 36px 48px #fbe4d8;
          opacity: .72;
        }
        .theme-night .study-sync-panel {
          background: linear-gradient(160deg, rgba(43,18,76,.91), rgba(25,0,25,.92));
          border-color: rgba(223,182,210,.35);
          box-shadow: 0 0 0 4px rgba(25,0,25,.25), 0 18px 0 #190019, 0 30px 60px rgba(25,0,25,.42);
        }
        .theme-night .bg-slate-950, .theme-night .bg-slate-900, .theme-night .bg-slate-800 {
          background-color: rgba(82,43,91,.72) !important;
        }
        .theme-night .border-slate-800, .theme-night .border-slate-700 { border-color: rgba(223,182,210,.25) !important; }
        .theme-night .text-indigo-300, .theme-night .text-indigo-400 { color: #dfb6d2 !important; }
        .theme-night button.bg-indigo-600, .theme-night button.bg-emerald-600, .theme-night button.bg-teal-600, .theme-night button.bg-amber-600 {
          box-shadow: 0 4px 0 rgba(25,0,25,.38), 0 8px 18px rgba(25,0,25,.2);
        }
        .study-sync-scene.theme-day {
          --ink: #39283f;
          --muted: #755b72;
          --panel: rgba(255,244,236,.97);
          --surface: rgba(255,228,216,.90);
          --surface-raised: rgba(223,182,210,.42);
          --line: rgba(82,43,91,.2);
          --input: rgba(255,250,246,.96);
          --accent: #864f6c;
          --pixel-shadow: #d6acaa;
          background: #fbe4d8;
        }
        .study-sync-scene.theme-day::before {
          background-color: #fbe4d8;
          background-image:
            radial-gradient(circle at 16% 15%, rgba(255,255,255,.85) 0 1px, transparent 2px),
            radial-gradient(circle at 83% 19%, rgba(134,79,108,.32) 0 1px, transparent 2px),
            radial-gradient(circle at 60% 44%, rgba(255,255,255,.7) 0 1px, transparent 2px),
            radial-gradient(ellipse at 50% 100%, rgba(223,182,210,.7), transparent 48%),
            linear-gradient(155deg, #dfb6b2 0%, #fbe4d8 48%, #fff1e7 100%);
          background-size: 100% 100%;
          background-position: center;
        }
        .study-sync-scene.theme-day::after {
          background: #fff5ea;
          box-shadow: 12px 0 #fff5ea, 24px 0 #fff5ea, 36px 0 #fff5ea,
            0 12px #fff5ea, 12px 12px #fff5ea, 24px 12px #dfb6b2, 36px 12px #fff5ea, 48px 12px #fff5ea,
            0 24px #fff5ea, 12px 24px #fff5ea, 24px 24px #dfb6b2, 36px 24px #fff5ea, 48px 24px #fff5ea,
            12px 36px #fff5ea, 24px 36px #fff5ea, 36px 36px #fff5ea, 48px 36px #fff5ea,
            24px 48px #fff5ea, 36px 48px #fff5ea;
          opacity: .85;
        }
        .theme-day .study-sync-panel {
          background: linear-gradient(155deg, rgba(255,244,236,.94), rgba(251,228,216,.92));
          border-color: rgba(134,79,108,.38);
          box-shadow: 0 0 0 4px rgba(255,244,236,.48), 0 18px 0 #d6acaa, 0 30px 60px rgba(82,43,91,.16);
        }
        .theme-day .bg-slate-950, .theme-day .bg-slate-900, .theme-day .bg-slate-800 {
          background-color: rgba(255,228,216,.82) !important;
        }
        .theme-day .border-slate-800, .theme-day .border-slate-700, .theme-day .border-slate-200, .theme-day .border-slate-300 {
          border-color: rgba(82,43,91,.2) !important;
        }
        .theme-day .text-indigo-300, .theme-day .text-indigo-400, .theme-day .text-indigo-500 { color: #522b5b !important; }
        .theme-day button.bg-indigo-600, .theme-day button.bg-emerald-600, .theme-day button.bg-teal-600, .theme-day button.bg-amber-600 {
          background-color: #522b5b !important;
          box-shadow: 0 4px 0 rgba(82,43,91,.24), 0 8px 18px rgba(82,43,91,.12);
        }
        .theme-day button.bg-indigo-600:hover, .theme-day button.bg-emerald-600:hover, .theme-day button.bg-teal-600:hover, .theme-day button.bg-amber-600:hover { background-color: #68406d !important; }
        .theme-day .bg-indigo-600:not(button), .theme-day .bg-emerald-600:not(button), .theme-day .bg-teal-600:not(button), .theme-day .bg-amber-600:not(button) { background-color: #864f6c !important; }
        /* Make controls feel intentionally themed, not just recolored */
        .theme-night button:not([aria-label="Toggle Theme"]) {
          border-radius: 999px !important;
          background-color: #522b5b !important;
          color: #fbe4d8 !important;
          border: 1px solid rgba(223,182,210,.45) !important;
          box-shadow: 0 4px 0 rgba(25,0,25,.62), 0 7px 14px rgba(25,0,25,.24);
          font-weight: 700;
        }
        .theme-night button:not([aria-label="Toggle Theme"]):hover {
          background-color: #70436f !important;
          border-color: rgba(251,228,216,.7) !important;
          transform: translateY(-1px);
        }
        .theme-night button:not([aria-label="Toggle Theme"]):active {
          transform: translateY(3px);
          box-shadow: 0 1px 0 rgba(25,0,25,.62);
        }
        .theme-night button.bg-indigo-600:not([aria-label="Toggle Theme"]),
        .theme-night button.bg-emerald-600:not([aria-label="Toggle Theme"]),
        .theme-night button.bg-teal-600:not([aria-label="Toggle Theme"]),
        .theme-night button.bg-amber-600:not([aria-label="Toggle Theme"]) {
          background: linear-gradient(180deg, #fbe4d8, #dfb6d2) !important;
          border-color: rgba(251,228,216,.8) !important;
          color: #2b124c !important;
          box-shadow: 0 5px 0 #864f6c, 0 9px 18px rgba(25,0,25,.3);
        }
        .theme-night button.bg-indigo-600:not([aria-label="Toggle Theme"]):hover,
        .theme-night button.bg-emerald-600:not([aria-label="Toggle Theme"]):hover,
        .theme-night button.bg-teal-600:not([aria-label="Toggle Theme"]):hover,
        .theme-night button.bg-amber-600:not([aria-label="Toggle Theme"]):hover {
          background: linear-gradient(180deg, #fff1e7, #fbe4d8) !important;
        }
        .theme-day button:not([aria-label="Toggle Theme"]) {
          border-radius: 999px !important;
          background-color: #dfb6d2 !important;
          color: #39283f !important;
          border: 1px solid rgba(82,43,91,.22) !important;
          box-shadow: 0 4px 0 rgba(134,79,108,.35), 0 7px 14px rgba(82,43,91,.12);
          font-weight: 700;
        }
        .theme-day button:not([aria-label="Toggle Theme"]):hover {
          background-color: #d4a5c5 !important;
          border-color: rgba(82,43,91,.42) !important;
          transform: translateY(-1px);
        }
        .theme-day button:not([aria-label="Toggle Theme"]):active {
          transform: translateY(3px);
          box-shadow: 0 1px 0 rgba(134,79,108,.35);
        }
        .theme-day button.bg-indigo-600:not([aria-label="Toggle Theme"]),
        .theme-day button.bg-emerald-600:not([aria-label="Toggle Theme"]),
        .theme-day button.bg-teal-600:not([aria-label="Toggle Theme"]),
        .theme-day button.bg-amber-600:not([aria-label="Toggle Theme"]) {
          background: linear-gradient(180deg, #522b5b, #2b124c) !important;
          border-color: rgba(82,43,91,.64) !important;
          color: #fbe4d8 !important;
          box-shadow: 0 5px 0 #190019, 0 9px 18px rgba(82,43,91,.2);
        }
        .theme-day button.bg-indigo-600:not([aria-label="Toggle Theme"]):hover,
        .theme-day button.bg-emerald-600:not([aria-label="Toggle Theme"]):hover,
        .theme-day button.bg-teal-600:not([aria-label="Toggle Theme"]):hover,
        .theme-day button.bg-amber-600:not([aria-label="Toggle Theme"]):hover {
          background: linear-gradient(180deg, #68406d, #522b5b) !important;
        }
        .study-sync-scene button[aria-label="Toggle Theme"] {
          border-radius: 999px !important;
          border: 1px solid var(--line) !important;
          box-shadow: 0 3px 0 var(--pixel-shadow);
        }
        .study-sync-scene button.attendance-attended,
        .theme-day.study-sync-scene button.attendance-attended,
        .theme-night.study-sync-scene button.attendance-attended {
          background: #65752b !important;
          border: 1px solid #879544 !important;
          color: #f6f2da !important;
          box-shadow: 0 4px 0 #414b1b, 0 7px 12px rgba(0,0,0,.2) !important;
        }
        .study-sync-scene button.attendance-attended:hover { background: #788938 !important; }
        .study-sync-scene button.attendance-missed,
        .theme-day.study-sync-scene button.attendance-missed,
        .theme-night.study-sync-scene button.attendance-missed {
          background: #741f32 !important;
          border: 1px solid #a64252 !important;
          color: #ffe8e5 !important;
          box-shadow: 0 4px 0 #49121f, 0 7px 12px rgba(0,0,0,.2) !important;
        }
        .study-sync-scene button.attendance-missed:hover { background: #8c2a3f !important; }
        .study-sync-scene .study-nav-card {
          border-radius: 20px !important;
          border-width: 1px !important;
          background: linear-gradient(135deg, rgba(82,43,91,.88), rgba(43,18,76,.96)) !important;
          border-color: rgba(223,182,210,.34) !important;
          box-shadow: 0 6px 0 rgba(25,0,25,.52), 0 12px 24px rgba(25,0,25,.2);
          color: #fbe4d8 !important;
        }
        .theme-day .study-sync-scene .study-nav-card {
          background: linear-gradient(135deg, rgba(255,244,236,.98), rgba(223,182,210,.76)) !important;
          border-color: rgba(134,79,108,.3) !important;
          box-shadow: 0 6px 0 rgba(134,79,108,.2), 0 12px 22px rgba(82,43,91,.12);
          color: #39283f !important;
        }
        .study-sync-scene .study-nav-card:hover { transform: translateY(-2px) scale(1.01); }
        .study-sync-scene .study-nav-card .p-3 { border-radius: 14px !important; }
        .theme-night.study-sync-scene .study-nav-card .p-3 { background: #864f6c !important; box-shadow: inset 0 1px rgba(251,228,216,.25); }
        .theme-day.study-sync-scene .study-nav-card .p-3 { background: #522b5b !important; box-shadow: 0 3px 0 rgba(25,0,25,.18); }
        .theme-day.study-sync-scene .study-nav-card .p-3, .theme-day.study-sync-scene .study-nav-card .p-3 * { color: #fbe4d8 !important; }
        .study-sync-scene .timer-preset {
          border: 1px solid rgba(223,182,210,.38) !important;
          background: rgba(82,43,91,.76) !important;
          color: #fbe4d8 !important;
          box-shadow: 0 3px 0 rgba(25,0,25,.45) !important;
        }
        .theme-day.study-sync-scene .timer-preset {
          background: rgba(223,182,210,.55) !important;
          color: #39283f !important;
          border-color: rgba(82,43,91,.2) !important;
          box-shadow: 0 3px 0 rgba(134,79,108,.2) !important;
        }
        .study-sync-scene .timer-preset-active {
          background: #fbe4d8 !important;
          color: #2b124c !important;
          border-color: #dfb6d2 !important;
        }
        .theme-day.study-sync-scene .timer-preset-active {
          background: #522b5b !important;
          color: #fbe4d8 !important;
          border-color: #522b5b !important;
        }
        .study-sync-scene .timer-preset:disabled { opacity: .65; cursor: not-allowed; }
      `}</style>
      <div
        className={`study-sync-scene theme-${darkMode ? "night" : "day"} study-sync-panel w-full max-w-md min-h-[720px] rounded-3xl shadow-2xl border flex flex-col relative overflow-hidden transition-colors duration-300`}
      >
        {/* Global Dark/Light Mode Toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className={`absolute top-4 right-4 p-2.5 rounded-full z-30 transition-all ${
            darkMode 
              ? "bg-slate-800 text-amber-400 hover:bg-slate-700" 
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
          aria-label="Toggle Theme"
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* ================= SCREEN 1: SIGN UP & LOGIN SCREEN ================= */}
        {screen === "auth" && (
          <div className="flex-1 p-6 flex flex-col justify-between">
            <div className="mt-12 space-y-2">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-indigo-500/30">
                <GraduationCap className="w-7 h-7" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">Welcome</h1>
              <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                Sign in to your account or get started with a new profile.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-3 my-auto">
              {authError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
                  {authError}
                </div>
              )}
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                  darkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                  darkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              />

              <button
                type="submit"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-600/30 mt-2"
              >
                Log In
              </button>
            </form>

            <div className="space-y-3">
              <button
                onClick={() => { setAuthError(""); setScreen("profile-setup"); }}
                className={`w-full py-3.5 font-bold text-sm rounded-xl border transition-all ${
                  darkMode 
                    ? "border-slate-700 hover:bg-slate-800 text-slate-200" 
                    : "border-slate-300 hover:bg-slate-50 text-slate-700"
                }`}
              >
                Create Account (Sign Up)
              </button>
            </div>
          </div>
        )}

        {/* ================= SCREEN 2: PROFILE SETUP SCREEN (Sign Up) ================= */}
        {screen === "profile-setup" && (
          <form onSubmit={handleRegisterProfile} className="flex-1 p-6 flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => setScreen("auth")}
                className={`p-2 rounded-xl border ${darkMode ? "border-slate-800 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-100"}`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold">Profile Setup</h2>
                <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Set up your credentials</p>
              </div>
            </div>

            <div className="space-y-4 my-auto">
              <div className="flex flex-col items-center space-y-3">
                <div className="relative">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center overflow-hidden border-2 ${
                    darkMode ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-300"
                  }`}>
                    {pfp ? (
                      <img src={pfp} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <User className={`w-8 h-8 ${darkMode ? "text-slate-500" : "text-slate-400"}`} />
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full cursor-pointer shadow-md transition-all">
                    <Upload className="w-3.5 h-3.5" />
                    <input type="file" accept="image/*" onChange={handlePfpUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Email</label>
                <input
                  type="email"
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    darkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Password</label>
                <input
                  type="password"
                  placeholder="Choose password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    darkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Username</label>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    darkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                />
              </div>

              <div className={`p-3 rounded-xl border ${
                darkMode ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <span className={`text-[10px] font-medium uppercase tracking-wider block mb-1 ${
                  darkMode ? "text-slate-400" : "text-slate-500"
                }`}>
                  Your Friend Code
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black font-mono tracking-widest text-indigo-500">
                    {friendCode}
                  </span>
                  <button
                    type="button"
                    onClick={copyFriendCode}
                    className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                      darkMode ? "bg-slate-800 hover:bg-slate-700 text-slate-200" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2 mt-4"
            >
              <span>Complete Setup & Register</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ================= SCREEN 3: HOME SCREEN (3 MAIN BUBBLES/CARDS) ================= */}
        {screen === "home" && (
          <div className="flex-1 flex flex-col justify-between p-6">
            
            {/* Header with Back button (>) if inside a tab */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center space-x-3">
                {homeTab !== "hub" && (
                  <button 
                    onClick={() => setHomeTab("hub")}
                    className={`p-2 rounded-xl border mr-1 ${darkMode ? "border-slate-800 hover:bg-slate-800 text-slate-300" : "border-slate-200 hover:bg-slate-100 text-slate-700"}`}
                    aria-label="Back to Hub"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border ${
                  darkMode ? "bg-slate-800 border-slate-700" : "bg-slate-200 border-slate-300"
                }`}>
                  {pfp ? (
                    <img src={pfp} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className={`w-5 h-5 ${darkMode ? "text-slate-400" : "text-slate-600"}`} />
                  )}
                </div>
                <div>
                  <h2 className="font-bold text-base leading-tight">
                    {username || "Student"}
                  </h2>
                  <span className={`text-[11px] font-mono ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                    #{friendCode}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setScreen("auth")}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            {/* HUB VIEW: 3 Main Cards/Bubbles */}
            {homeTab === "hub" && (
              <div className="space-y-4 my-auto">
                <p className={`text-xs font-semibold uppercase tracking-wider ${
                  darkMode ? "text-slate-400" : "text-slate-500"
                }`}>
                  Central Navigation Hub
                </p>

                {/* Bubble 1: Chat */}
                <div 
                  onClick={() => setHomeTab("chat")}
                  className={`study-nav-card nav-chat group p-5 rounded-3xl border transition-all cursor-pointer hover:scale-[1.02] flex items-center justify-between ${
                    darkMode 
                      ? "bg-slate-950/60 border-indigo-500/20 hover:border-indigo-500/50 hover:bg-indigo-950/20" 
                      : "bg-indigo-50/50 border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50"
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-md shadow-indigo-600/30">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">Chat</h3>
                      <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                        Messages & invite friends
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Bubble 2: Academics */}
                <div 
                  onClick={() => setHomeTab("academics")}
                  className={`study-nav-card nav-academics group p-5 rounded-3xl border transition-all cursor-pointer hover:scale-[1.02] flex items-center justify-between ${
                    darkMode 
                      ? "bg-slate-950/60 border-emerald-500/20 hover:border-emerald-500/50 hover:bg-emerald-950/20" 
                      : "bg-emerald-50/50 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50"
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-md shadow-emerald-600/30">
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">Academics</h3>
                      <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                        Grades, attendance, timer & tasks
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Bubble 3: Account */}
                <div 
                  onClick={() => setHomeTab("account")}
                  className={`study-nav-card nav-account group p-5 rounded-3xl border transition-all cursor-pointer hover:scale-[1.02] flex items-center justify-between ${
                    darkMode 
                      ? "bg-slate-950/60 border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-950/20" 
                      : "bg-amber-50/50 border-amber-200 hover:border-amber-300 hover:bg-amber-50"
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-amber-600 text-white rounded-2xl shadow-md shadow-amber-600/30">
                      <Settings className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">Account</h3>
                      <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                        Profile settings & friend code
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            )}

            {/* CHAT TAB: Empty chat + Invite Friends feature */}
            {homeTab === "chat" && (
              <div className="my-auto space-y-6">
                <div>
                  <h3 className="text-lg font-bold">Chat & Messages</h3>
                  <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                    Your messages are currently empty. Invite friends using your code to start connecting!
                  </p>
                </div>

                {/* Invite Friends Card */}
                <div className={`p-5 rounded-2xl border space-y-4 ${
                  darkMode ? "bg-slate-950/50 border-indigo-500/30" : "bg-indigo-50/50 border-indigo-200"
                }`}>
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/30">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">Invite Friends</h4>
                      <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                        Share your unique friend code
                      </p>
                    </div>
                  </div>

                  <div className={`flex items-center justify-between p-3 rounded-xl border ${
                    darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-300"
                  }`}>
                    <span className="font-mono font-bold text-lg tracking-widest text-indigo-500">
                      {friendCode}
                    </span>
                    <button
                      onClick={copyFriendCode}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                      <span>{copied ? "Copied!" : "Share Code"}</span>
                    </button>
                  </div>
                </div>

                <div className={`text-center py-8 border-2 border-dashed rounded-2xl ${
                  darkMode ? "border-slate-800 text-slate-600" : "border-slate-200 text-slate-400"
                }`}>
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No active chats yet</p>
                </div>
              </div>
            )}

            {/* ACADEMICS TAB: Full Functional Study App (Tasks, Attendance, SGPA, Pomodoro) */}
            {homeTab === "academics" && (
              <div className="flex-1 flex flex-col pt-4 space-y-4 overflow-y-auto">
                <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button onClick={() => setAcademicsSubTab("dashboard")} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${academicsSubTab === "dashboard" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Dashboard</button>
                  <button onClick={() => setAcademicsSubTab("tasks")} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${academicsSubTab === "tasks" ? "bg-emerald-600 text-white" : "text-slate-400"}`}>Tasks</button>
                  <button onClick={() => setAcademicsSubTab("pomodoro")} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${academicsSubTab === "pomodoro" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Timer</button>
                  <button onClick={() => setAcademicsSubTab("subjects")} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${academicsSubTab === "subjects" ? "bg-teal-600 text-white" : "text-slate-400"}`}>Bunks</button>
                  <button onClick={() => setAcademicsSubTab("grades")} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${academicsSubTab === "grades" ? "bg-amber-600 text-white" : "text-slate-400"}`}>SGPA</button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                  {academicsSubTab === "dashboard" && (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-2xl">
                          <span className="text-[10px] text-slate-400">Attendance</span>
                          <p className={`text-xl font-extrabold mt-1 ${Number(overallPercentage) >= 75 ? "text-emerald-400" : "text-rose-400"}`}>{overallPercentage}%</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-2xl">
                          <span className="text-[10px] text-slate-400">Tasks</span>
                          <p className="text-xl font-extrabold text-indigo-400 mt-1">{tasks.filter((t) => !t.completed).length}</p>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-2xl">
                          <span className="text-[10px] text-slate-400">SGPA</span>
                          <p className="text-xl font-extrabold text-amber-400 mt-1">{sgpa}</p>
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-indigo-950/60 via-slate-950 to-slate-950 border border-indigo-500/20 p-4 rounded-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-indigo-300">Focus Timer</span>
                          <Clock className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div className="text-center py-1">
                          <span className="text-3xl font-black font-mono text-white">{formatTime(timeLeft)}</span>
                        </div>
                        <button 
                          onClick={() => setAcademicsSubTab("pomodoro")}
                          className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl"
                        >
                          Open Focus Timer
                        </button>
                      </div>
                    </>
                  )}

                  {academicsSubTab === "tasks" && (
                    <div className="space-y-3">
                      <form onSubmit={addTask} className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="Add task..."
                          value={newTask}
                          onChange={(e) => setNewTask(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-800 text-xs text-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                        />
                        <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1">
                          <Plus className="w-4 h-4" /> Add
                        </button>
                      </form>
                      <div className="space-y-2">
                        {tasks.map((task) => (
                          <div key={task.id} onClick={() => toggleTask(task.id)} className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
                            <div className="flex items-center space-x-3">
                              <input type="checkbox" checked={task.completed} readOnly className="rounded accent-emerald-500 h-4 w-4" />
                              <span className={`text-xs ${task.completed ? "line-through text-slate-500" : "text-slate-200"}`}>{task.text}</span>
                            </div>
                            <button onClick={(e) => deleteTask(task.id, e)} className="p-1 text-slate-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {academicsSubTab === "pomodoro" && (
                    <div className="flex flex-col items-center justify-center py-4 space-y-4">
                      <div className="w-full text-center space-y-2">
                        <p className={`text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Choose a focus session</p>
                        <div className="flex justify-center gap-2">
                          {[15, 25, 45].map((minutes) => {
                            const seconds = minutes * 60;
                            const selected = timerDuration === seconds;
                            return (
                              <button
                                key={minutes}
                                onClick={() => {
                                  setTimerDuration(seconds);
                                  if (!isRunning) setTimeLeft(seconds);
                                }}
                                className={`timer-preset px-4 py-2 text-xs font-bold ${selected ? "timer-preset-active" : ""}`}
                                aria-pressed={selected}
                                disabled={isRunning}
                                title={isRunning ? "Pause or reset to change session length" : `Set ${minutes} minute session`}
                              >
                                {minutes} min
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="w-44 h-44 rounded-full border-4 border-indigo-500/30 flex items-center justify-center bg-slate-950">
                        <span className="text-4xl font-black font-mono text-white">{formatTime(timeLeft)}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button 
                          onClick={() => setIsRunning(!isRunning)}
                          className={`p-3 text-white rounded-xl font-bold flex items-center space-x-2 ${isRunning ? "bg-amber-600" : "bg-indigo-600"}`}
                        >
                          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          <span className="text-xs">{isRunning ? "Pause" : "Start"}</span>
                        </button>
                        <button onClick={() => { setIsRunning(false); setTimeLeft(timerDuration); }} className="p-3 bg-slate-800 text-slate-400 rounded-xl border border-slate-700">
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {academicsSubTab === "subjects" && (
                    <div className="space-y-3">
                      <form onSubmit={addSubject} className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                        <input type="text" placeholder="Subject Name" value={newSubName} onChange={(e) => setNewSubName(e.target.value)} className="w-full bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs text-white" />
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" placeholder="Attended" value={newSubAttended} onChange={(e) => setNewSubAttended(e.target.value ? Number(e.target.value) : "")} className="bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs text-white" />
                          <input type="number" placeholder="Total" value={newSubTotal} onChange={(e) => setNewSubTotal(e.target.value ? Number(e.target.value) : "")} className="bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs text-white" />
                        </div>
                        <button type="submit" className="w-full py-2 bg-teal-600 text-white text-xs font-bold rounded-lg">Save Subject</button>
                      </form>
                      <div className="space-y-2">
                        {subjects.map((sub) => {
                          const pct = sub.total > 0 ? (sub.attended / sub.total) * 100 : 0;
                          return (
                            <div key={sub.id} className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                              <div className="flex justify-between items-center">
                                <div>
                                  <h4 className="font-bold text-xs text-slate-100">{sub.name}</h4>
                                  <p className="text-[10px] text-slate-400">{sub.attended}/{sub.total} attended</p>
                                </div>
                                <span className={`text-xs font-black px-2 py-0.5 rounded ${pct >= 75 ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"}`}>{pct.toFixed(1)}%</span>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => markAttendance(sub.id, 1, 1)} className="attendance-attended flex-1 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 rounded-lg text-[10px] font-semibold">+ Attended</button>
                                <button onClick={() => markAttendance(sub.id, 0, 1)} className="attendance-missed flex-1 py-1 bg-rose-950 hover:bg-rose-900 text-rose-300 rounded-lg text-[10px] font-semibold">+ Bunked</button>
                                <button onClick={() => deleteSubject(sub.id)} className="p-1 text-slate-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {academicsSubTab === "grades" && (
                    <div className="space-y-3">
                      <div className="bg-gradient-to-r from-amber-950/60 to-slate-950 border border-amber-500/30 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-amber-300 font-semibold uppercase">Calculated SGPA</span>
                          <p className="text-2xl font-black text-amber-400">{sgpa}</p>
                        </div>
                        <Award className="w-6 h-6 text-amber-400" />
                      </div>
                      
                      <form onSubmit={addCourseGrade} className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                        <input 
                          type="text" 
                          placeholder="Course Name" 
                          value={courseName} 
                          onChange={(e) => setCourseName(e.target.value)} 
                          className="w-full bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs text-white" 
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[9px] text-slate-400 block mb-0.5">Credits</label>
                            <input 
                              type="number" 
                              placeholder="Credits" 
                              value={courseCredits} 
                              onChange={(e) => handleCreditChange(e.target.value ? Number(e.target.value) : "")} 
                              className="w-full bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs text-white" 
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block mb-0.5">CIA (max {maxCia})</label>
                            <input 
                              type="number" 
                              placeholder="CIA" 
                              value={ciaScore} 
                              onChange={(e) => setCiaScore(e.target.value ? Number(e.target.value) : "")} 
                              className="w-full bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs text-white" 
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block mb-0.5">ESE (max {maxEse})</label>
                            <input 
                              type="number" 
                              placeholder="ESE" 
                              value={eseScore} 
                              onChange={(e) => setEseScore(e.target.value ? Number(e.target.value) : "")} 
                              className="w-full bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs text-white" 
                            />
                          </div>
                        </div>
                        <button type="submit" className="w-full py-2 bg-amber-600 text-white text-xs font-bold rounded-lg mt-1">Add Course</button>
                      </form>

                      <div className="space-y-2">
                        {courses.map((course) => (
                          <div key={course.id} className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex justify-between items-center">
                            <div>
                              <h4 className="font-bold text-xs text-slate-100">{course.name}</h4>
                              <p className="text-[10px] text-slate-400">{course.totalMarks}/{course.maxMarks} marks • {course.credits} Credits</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-amber-400">{course.gradeLetter}</span>
                              <button onClick={() => deleteCourse(course.id)} className="p-1 text-slate-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ACCOUNT TAB */}
            {homeTab === "account" && (
              <div className="my-auto space-y-4">
                <h3 className="text-lg font-bold">Account Settings</h3>
                <div className={`p-4 rounded-2xl border space-y-3 ${darkMode ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold">Username</span>
                    <span className="text-xs font-mono text-indigo-400">{username || "Student"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold">Friend Code</span>
                    <span className="text-xs font-mono text-indigo-400">#{friendCode}</span>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
