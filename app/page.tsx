"use client";

import React, { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, signInAnonymously, type User as FirebaseUser } from "firebase/auth";
import {
  addDoc, arrayUnion, collection, doc, getDoc, limit, onSnapshot, orderBy,
  query, runTransaction, serverTimestamp, setDoc, updateDoc, where, type Timestamp
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
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

interface StudyNote {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
}

interface StudyRoom {
  id: string;
  name: string;
  type: "group" | "subject";
  inviteCode?: string;
}

interface FriendProfile { uid: string; username: string; friendCode: string; }
interface FriendRequest { id: string; senderUid: string; receiverUid: string; senderName: string; senderCode: string; status: "pending" | "accepted"; }

interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderCode: string;
  createdAt: Timestamp | null;
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

  type NavigationSnapshot = {
    screen: "auth" | "profile-setup" | "home";
    homeTab: "hub" | "chat" | "academics" | "account";
    academicsSubTab: "dashboard" | "tasks" | "pomodoro" | "subjects" | "grades";
  };
  const navigationRef = useRef<NavigationSnapshot>({ screen, homeTab, academicsSubTab });
  navigationRef.current = { screen, homeTab, academicsSubTab };

  const navigate = (patch: Partial<NavigationSnapshot>) => {
    const next = { ...navigationRef.current, ...patch };
    navigationRef.current = next;
    if (typeof window !== "undefined") {
      window.history.pushState({ studySyncNavigation: next }, "", window.location.href);
    }
    setScreen(next.screen);
    setHomeTab(next.homeTab);
    setAcademicsSubTab(next.academicsSubTab);
  };

  // Make browser and hardware back buttons follow the app's own screen stack.
  useEffect(() => {
    if (!window.history.state?.studySyncNavigation) {
      window.history.replaceState({ studySyncNavigation: navigationRef.current }, "", window.location.href);
    }
    const handlePopState = (event: PopStateEvent) => {
      const previous = event.state?.studySyncNavigation as NavigationSnapshot | undefined;
      if (previous) {
        navigationRef.current = previous;
        setScreen(previous.screen);
        setHomeTab(previous.homeTab);
        setAcademicsSubTab(previous.academicsSubTab);
        return;
      }
      // If the browser reaches a non-app entry while a nested screen is open,
      // keep the user in the app and return them to the nearest parent view.
      const current = navigationRef.current;
      const fallback: NavigationSnapshot = current.screen === "profile-setup"
        ? { ...current, screen: "auth" }
        : current.screen === "home" && current.homeTab !== "hub"
          ? { ...current, homeTab: "hub" }
          : { ...current, screen: "auth", homeTab: "hub" };
      navigationRef.current = fallback;
      setScreen(fallback.screen);
      setHomeTab(fallback.homeTab);
      setAcademicsSubTab(fallback.academicsSubTab);
      window.history.pushState({ studySyncNavigation: fallback }, "", window.location.href);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteTagsInput, setNoteTagsInput] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [activeNoteTag, setActiveNoteTag] = useState("all");
  const [notesTodosView, setNotesTodosView] = useState<"todos" | "notes">("todos");
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firebaseError, setFirebaseError] = useState("");
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<StudyRoom | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [roomNameInput, setRoomNameInput] = useState("");
  const [roomNotice, setRoomNotice] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatHomeView, setChatHomeView] = useState<"rooms" | "friends">("rooms");
  const [friendCodeSearch, setFriendCodeSearch] = useState("");
  const [friendNotice, setFriendNotice] = useState("");
  const [friendProfiles, setFriendProfiles] = useState<FriendProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);

  // Generate 6-digit Friend Code & load LocalStorage on initial load
  useEffect(() => {
    setMounted(true);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setFriendCode(code);

    const savedTasks = localStorage.getItem("studysync_tasks");
    const savedSubjects = localStorage.getItem("studysync_subjects");
    const savedCourses = localStorage.getItem("studysync_courses");
    const savedUsers = localStorage.getItem("studysync_registered_users");
    const savedNotes = localStorage.getItem("studysync_notes");
    const savedRooms = localStorage.getItem("studysync_rooms");

    if (savedTasks) setTasks(JSON.parse(savedTasks));
    if (savedSubjects) setSubjects(JSON.parse(savedSubjects));
    if (savedCourses) setCourses(JSON.parse(savedCourses));
    if (savedUsers) setRegisteredUsers(JSON.parse(savedUsers));
    if (savedNotes) setNotes(JSON.parse(savedNotes));
    if (savedRooms) setRooms(JSON.parse(savedRooms));
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

  useEffect(() => {
    if (mounted) localStorage.setItem("studysync_notes", JSON.stringify(notes));
  }, [notes, mounted]);

  useEffect(() => {
    if (mounted) localStorage.setItem("studysync_rooms", JSON.stringify(rooms));
  }, [rooms, mounted]);

  // The prototype login remains local; Firebase anonymous auth supplies a safe
  // per-install sender identity for Firestore operations.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setFirebaseUser(user);
      else signInAnonymously(auth).catch((error) => setFirebaseError(error?.message || "Firebase sign-in failed. Enable Anonymous auth in Firebase."));
    });
    return unsubscribe;
  }, []);

  // Publish the current profile under a private-auth UID and reserve its 6-digit lookup code.
  useEffect(() => {
    if (!firebaseUser || !friendCode) return;
    let cancelled = false;
    const publishProfile = async () => {
      try {
        let code = friendCode;
        for (let attempt = 0; attempt < 10; attempt++) {
          const codeRef = doc(db, "friendCodes", code);
          const profileRef = doc(db, "studyProfiles", firebaseUser.uid);
          let available = false;
          await runTransaction(db, async (transaction) => {
            const codeSnapshot = await transaction.get(codeRef);
            if (codeSnapshot.exists() && codeSnapshot.data().uid !== firebaseUser.uid) return;
            transaction.set(codeRef, { uid: firebaseUser.uid, username: username.trim() || "Student", friendCode: code, updatedAt: serverTimestamp() });
            transaction.set(profileRef, { uid: firebaseUser.uid, username: username.trim() || "Student", friendCode: code, updatedAt: serverTimestamp() }, { merge: true });
            available = true;
          });
          if (available) break;
          code = String(Math.floor(100000 + Math.random() * 900000));
        }
        if (!cancelled && code !== friendCode) setFriendCode(code);
      } catch (error: any) { if (!cancelled) setFirebaseError(error?.message || "Could not publish your friend code."); }
    };
    void publishProfile();
    return () => { cancelled = true; };
  }, [firebaseUser?.uid, friendCode, username]);

  // Keep incoming/sent requests and the accepted friend list synced live.
  useEffect(() => {
    if (!firebaseUser) return;
    const incomingQuery = query(collection(db, "friendRequests"), where("receiverUid", "==", firebaseUser.uid), where("status", "==", "pending"));
    const outgoingQuery = query(collection(db, "friendRequests"), where("senderUid", "==", firebaseUser.uid), where("status", "==", "pending"));
    const unsubIncoming = onSnapshot(incomingQuery, (snapshot) => setIncomingRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FriendRequest))), (error) => setFirebaseError(error.message));
    const unsubOutgoing = onSnapshot(outgoingQuery, (snapshot) => setOutgoingRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FriendRequest))), (error) => setFirebaseError(error.message));
    const profileRef = doc(db, "studyProfiles", firebaseUser.uid);
    const unsubFriends = onSnapshot(profileRef, async (snapshot) => {
      const ids = (snapshot.data()?.friends || []) as string[];
      const profiles = await Promise.all(ids.map(async (uid) => {
        const friend = await getDoc(doc(db, "studyProfiles", uid));
        return friend.exists() ? { uid, username: friend.data().username || "Student", friendCode: friend.data().friendCode || "" } : null;
      }));
      setFriendProfiles(profiles.filter((friend): friend is FriendProfile => !!friend));
    }, (error) => setFirebaseError(error.message));
    return () => { unsubIncoming(); unsubOutgoing(); unsubFriends(); };
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (!activeRoom) { setChatMessages([]); return; }
    const messagesQuery = query(
      collection(db, "studyRooms", activeRoom.id, "messages"),
      orderBy("createdAt", "asc"), limit(100)
    );
    return onSnapshot(messagesQuery, (snapshot) => {
      setChatMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChatMessage)));
    }, (error) => setFirebaseError(error.message || "Could not load this chat."));
  }, [activeRoom?.id]);

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
    navigate({ homeTab: "hub", screen: "home" });
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
    navigate({ homeTab: "hub", screen: "home" });
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

  const addNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() && !noteBody.trim()) return;
    const tags = [...new Set(noteTagsInput.split(/[ ,]+/).map((tag) => tag.replace(/^#/, "").trim().toLowerCase()).filter(Boolean))];
    setNotes((current) => [{ id: crypto.randomUUID(), title: noteTitle.trim() || "Untitled note", body: noteBody.trim(), tags, createdAt: Date.now() }, ...current]);
    setNoteTitle(""); setNoteBody(""); setNoteTagsInput("");
  };
  const deleteNote = (id: string) => setNotes((current) => current.filter((note) => note.id !== id));
  const allNoteTags = [...new Set(notes.flatMap((note) => note.tags))].sort();
  const filteredNotes = notes.filter((note) =>
    (activeNoteTag === "all" || note.tags.includes(activeNoteTag)) &&
    `${note.title} ${note.body} ${note.tags.join(" ")}`.toLowerCase().includes(noteSearch.toLowerCase())
  );

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

  const makeInviteCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[byte % 36]).join("");
  const createStudyRoom = async (name: string, type: "group" | "subject" = "group", knownId?: string) => {
    if (!firebaseUser) { setRoomNotice("Connecting securely to chat… please try again in a moment."); return; }
    const cleanName = name.trim();
    if (!cleanName) return;
    setFirebaseError(""); setRoomNotice("");
    try {
      if (knownId) {
        const roomRef = doc(db, "studyRooms", knownId);
        await setDoc(roomRef, { name: cleanName, type, members: arrayUnion(firebaseUser.uid), updatedAt: serverTimestamp() }, { merge: true });
        const room = { id: knownId, name: cleanName, type } as StudyRoom;
        setRooms((current) => [room, ...current.filter((item) => item.id !== room.id)]);
        setActiveRoom(room);
        return;
      }
      let created: StudyRoom | null = null;
      for (let attempt = 0; attempt < 8 && !created; attempt++) {
        const code = makeInviteCode();
        const roomRef = doc(collection(db, "studyRooms"));
        const inviteRef = doc(db, "studyInviteCodes", code);
        try {
          await runTransaction(db, async (transaction) => {
            const existingCode = await transaction.get(inviteRef);
            if (existingCode.exists()) throw new Error("CODE_TAKEN");
            transaction.set(roomRef, { name: cleanName, type, members: [firebaseUser.uid], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            transaction.set(inviteRef, { roomId: roomRef.id, createdAt: serverTimestamp() });
          });
          created = { id: roomRef.id, name: cleanName, type, inviteCode: code };
        } catch (error: any) { if (error?.message !== "CODE_TAKEN") throw error; }
      }
      if (!created) throw new Error("Could not reserve a unique invite code. Please try again.");
      setRooms((current) => [created!, ...current.filter((item) => item.id !== created!.id)]);
      setActiveRoom(created);
    } catch (error: any) { setFirebaseError(error?.message || "Could not create the study room."); }
  };
  const joinStudyRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) { setRoomNotice("Connecting securely to chat… please try again in a moment."); return; }
    const code = inviteCodeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { setRoomNotice("Enter a 6-character invite code."); return; }
    try {
      const invite = await getDoc(doc(db, "studyInviteCodes", code));
      if (!invite.exists()) { setRoomNotice("That invite code was not found."); return; }
      const roomId = invite.data().roomId as string;
      const roomRef = doc(db, "studyRooms", roomId);
      const roomSnapshot = await getDoc(roomRef);
      if (!roomSnapshot.exists()) { setRoomNotice("This room is no longer available."); return; }
      await updateDoc(roomRef, { members: arrayUnion(firebaseUser.uid), updatedAt: serverTimestamp() });
      const data = roomSnapshot.data();
      const room: StudyRoom = { id: roomId, name: data.name || "Study room", type: data.type || "group", inviteCode: code };
      setRooms((current) => [room, ...current.filter((item) => item.id !== room.id)]);
      setActiveRoom(room); setInviteCodeInput(""); setRoomNotice("");
    } catch (error: any) { setFirebaseError(error?.message || "Could not join the room."); }
  };
  const sendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) { setFriendNotice("Connecting securely… please try again in a moment."); return; }
    const code = friendCodeSearch.trim();
    setFriendNotice(""); setFirebaseError("");
    if (!/^\d{6}$/.test(code)) { setFriendNotice("Enter your friend’s 6-digit code."); return; }
    try {
      const codeSnapshot = await getDoc(doc(db, "friendCodes", code));
      if (!codeSnapshot.exists()) { setFriendNotice("No student found with that code."); return; }
      const target = codeSnapshot.data();
      const targetUid = target.uid as string;
      if (targetUid === firebaseUser.uid) { setFriendNotice("That’s your own friend code."); return; }
      if (friendProfiles.some((friend) => friend.uid === targetUid)) { setFriendNotice("You’re already friends."); return; }
      const requestId = `${firebaseUser.uid}_${targetUid}`;
      const reverseId = `${targetUid}_${firebaseUser.uid}`;
      const [existing, reverse] = await Promise.all([getDoc(doc(db, "friendRequests", requestId)), getDoc(doc(db, "friendRequests", reverseId))]);
      if (reverse.exists() && reverse.data().status === "pending") { setFriendNotice("They already sent you a request. Accept it below."); return; }
      if (existing.exists()) { setFriendNotice(existing.data().status === "pending" ? "Friend request already pending." : "You’re already friends."); return; }
      await setDoc(doc(db, "friendRequests", requestId), { senderUid: firebaseUser.uid, receiverUid: targetUid, senderName: username.trim() || "Student", senderCode: friendCode, receiverName: target.username || "Student", receiverCode: target.friendCode || code, status: "pending", createdAt: serverTimestamp() });
      setFriendCodeSearch(""); setFriendNotice(`Friend request sent to ${target.username || "Student"}.`);
    } catch (error: any) { setFirebaseError(error?.message || "Could not send friend request."); }
  };
  const acceptFriendRequest = async (request: FriendRequest) => {
    if (!firebaseUser) return;
    try {
      await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, "friendRequests", request.id);
        const requestSnapshot = await transaction.get(requestRef);
        if (!requestSnapshot.exists() || requestSnapshot.data().status !== "pending") throw new Error("This request is no longer pending.");
        transaction.update(requestRef, { status: "accepted", acceptedAt: serverTimestamp() });
        transaction.set(doc(db, "studyProfiles", firebaseUser.uid), { friends: arrayUnion(request.senderUid), updatedAt: serverTimestamp() }, { merge: true });
        transaction.set(doc(db, "studyProfiles", request.senderUid), { friends: arrayUnion(firebaseUser.uid), updatedAt: serverTimestamp() }, { merge: true });
      });
    } catch (error: any) { setFirebaseError(error?.message || "Could not accept friend request."); }
  };
  const declineFriendRequest = async (request: FriendRequest) => {
    try { await updateDoc(doc(db, "friendRequests", request.id), { status: "declined", updatedAt: serverTimestamp() }); }
    catch (error: any) { setFirebaseError(error?.message || "Could not update friend request."); }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !firebaseUser || !messageDraft.trim() || isSendingMessage) return;
    const text = messageDraft.trim(); setIsSendingMessage(true); setMessageDraft("");
    try {
      await addDoc(collection(db, "studyRooms", activeRoom.id, "messages"), {
        text, senderId: firebaseUser.uid, senderName: username.trim() || "Student", senderCode: friendCode,
        createdAt: serverTimestamp()
      });
    } catch (error: any) { setMessageDraft(text); setFirebaseError(error?.message || "Message could not be sent."); }
    finally { setIsSendingMessage(false); }
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
    <div className={`study-sync-shell min-h-screen flex items-center justify-center font-sans transition-colors duration-300 p-3 sm:p-4 lg:p-8 ${darkMode ? "bg-[#101735] text-slate-100" : "bg-[#ead39d] text-slate-900"}`}>
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
        .pixel-room-scene {
          position: absolute;
          z-index: 0;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          background-image: linear-gradient(180deg, rgba(25,0,25,.20), rgba(25,0,25,.42)), url("/study-background.png");
          background-size: cover;
          background-position: center;
          image-rendering: auto;
        }
        .theme-day .pixel-room-scene {
          background-image: linear-gradient(180deg, rgba(251,228,216,.12), rgba(43,18,76,.32)), url("/study-background.png");
        }
        .study-sync-panel > :not(.pixel-room-scene):not(button) { position: relative; z-index: 1; }
        .study-sync-panel {
          position: relative;
          z-index: 1;
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
        /* Keep chat-tab accents within the plum, mauve and cream palette */
        .theme-night .chat-tab .text-indigo-500,
        .theme-night .chat-tab .text-indigo-400,
        .theme-night .chat-tab .text-indigo-300 { color: #fbe4d8 !important; }
        .theme-night .chat-tab .border-indigo-500\/30,
        .theme-night .chat-tab .border-indigo-500\/20 { border-color: rgba(223,182,210,.38) !important; }
        .theme-night .chat-tab .bg-indigo-600 { background: linear-gradient(135deg, #864f6c, #522b5b) !important; }
        .theme-night .chat-tab .shadow-indigo-600\/30 { --tw-shadow-color: rgba(134,79,108,.34) !important; }
        .theme-night .chat-tab button.bg-indigo-600 {
          background: linear-gradient(180deg, #fbe4d8, #dfb6d2) !important;
          color: #2b124c !important;
          border-color: rgba(251,228,216,.8) !important;
        }
        .theme-night .chat-tab button.bg-indigo-600:hover { background: linear-gradient(180deg, #fff1e7, #fbe4d8) !important; }

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
        @media (min-width: 1024px) {
          .study-sync-shell { align-items: stretch; }
          .study-sync-panel { width: 100%; max-width: 1280px; min-height: calc(100vh - 4rem); }
          .study-home {
            display: grid;
            grid-template-columns: minmax(220px, 270px) minmax(0, 1fr);
            grid-template-rows: auto minmax(0, 1fr);
            align-content: start;
            align-items: start;
            gap: 0 3rem;
            justify-content: stretch;
          }
          .study-home-header {
            grid-column: 1;
            grid-row: 1 / span 2;
            align-self: stretch;
            flex-direction: column;
            align-items: stretch;
            justify-content: flex-start;
            gap: 2rem;
            margin-top: 0 !important;
            padding: 1.5rem;
            border: 1px solid var(--line);
            border-radius: 1.5rem;
            background: rgba(25,0,25,.38);
          }
          .theme-day .study-home-header { background: rgba(255,244,236,.54); }
          .study-home-header > div:first-child { flex-wrap: wrap; }
          .study-home > div:not(.study-home-header) { grid-column: 2; grid-row: 1 / span 2; width: 100%; max-width: 980px; justify-self: center; align-self: center; }
          .study-home > div.space-y-4.my-auto { padding: 1.5rem; }
          .study-home > div.flex-1.flex.flex-col.pt-4 { align-self: stretch; max-height: calc(100vh - 8rem); }
          .study-home .study-nav-card { padding: 1.5rem; min-height: 112px; }
          .study-home .study-nav-card h3 { font-size: 1.15rem; }
          .study-home .study-nav-card p { font-size: .875rem; }
          .study-home .study-nav-card .p-3 { padding: 1rem; }
          .study-home .study-nav-card .p-3 svg { width: 1.75rem; height: 1.75rem; }
        }
        @media (min-width: 1280px) {
          .study-home { grid-template-columns: 290px minmax(0, 1fr); gap: 0 4rem; }
          .study-home-header { padding: 2rem; }
          .study-home > div.space-y-4.my-auto { padding: 2rem 3rem; }
        }
        @media (min-width: 1024px) {
          .study-auth-layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(340px, .9fr);
            grid-template-rows: 1fr auto;
            align-items: center;
            gap: 1rem 4rem;
            width: min(100%, 1040px);
            min-height: 620px;
            align-self: center;
            margin-inline: auto;
          }
          .study-auth-layout > div:first-child { grid-column: 1; grid-row: 1 / span 2; max-width: 440px; justify-self: center; }
          .study-auth-layout > form { grid-column: 2; grid-row: 1; width: 100%; align-self: end; }
          .study-auth-layout > div:last-child { grid-column: 2; grid-row: 2; width: 100%; align-self: start; }
          .study-profile-layout { width: min(100%, 760px); align-self: center; margin-inline: auto; }
        }
      `}</style>
      <div
        className={`study-sync-scene theme-${darkMode ? "night" : "day"} study-sync-panel w-full max-w-md min-h-[720px] lg:max-w-7xl lg:min-h-[calc(100vh-4rem)] rounded-3xl shadow-2xl border flex flex-col relative overflow-hidden transition-colors duration-300`}
      >
        {/* Full-scale study-room image fills the app background */}
        <div className="pixel-room-scene" aria-hidden="true" />

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
          <div className="study-auth-layout flex-1 p-6 flex flex-col justify-between">
            <div className="mt-12 space-y-2">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 border shadow-lg transition-colors duration-300 ${
                darkMode
                  ? "bg-gradient-to-br from-[#6d4b82] to-[#3a2948] border-[#a98bb8]/40 text-[#f5eafa] shadow-[#7d5b91]/30"
                  : "bg-gradient-to-br from-[#f5d9df] to-[#ead3df] border-[#d7b7c9] text-[#67465f] shadow-[#c99fb8]/30"
              }`}>
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
                onClick={() => { setAuthError(""); navigate({ screen: "profile-setup" }); }}
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
          <form onSubmit={handleRegisterProfile} className="study-profile-layout flex-1 p-6 flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => navigate({ screen: "auth" })}
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
          <div className="study-home flex-1 flex flex-col justify-between p-6 lg:p-10">
            
            {/* Header with Back button (>) if inside a tab */}
            <div className="study-home-header flex items-center justify-between mt-2">
              <div className="flex items-center space-x-3">
                {homeTab !== "hub" && (
                  <button 
                    onClick={() => navigate({ homeTab: "hub" })}
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
                onClick={() => navigate({ screen: "auth" })}
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
                  onClick={() => navigate({ homeTab: "chat" })}
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
                  onClick={() => navigate({ homeTab: "academics" })}
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
                  onClick={() => navigate({ homeTab: "account" })}
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

            {/* CHAT TAB: Firebase-powered study rooms and live messages */}
            {homeTab === "chat" && (
              <div className="chat-tab my-auto space-y-5">
                <div><h3 className="text-lg font-bold">Study Chats</h3><p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Create a room, share its 6-character code, and message in real time.</p></div>
                {!activeRoom ? <>
                  <div className="flex gap-2 rounded-xl border border-slate-800 bg-slate-950 p-1"><button onClick={() => setChatHomeView("rooms")} className={`flex-1 rounded-lg py-2 text-xs font-bold ${chatHomeView === "rooms" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Study Rooms</button><button onClick={() => setChatHomeView("friends")} className={`flex-1 rounded-lg py-2 text-xs font-bold ${chatHomeView === "friends" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Friends {incomingRequests.length ? `(${incomingRequests.length})` : ""}</button></div>
                  {chatHomeView === "rooms" ? <>
                  <form onSubmit={(e) => { e.preventDefault(); void createStudyRoom(roomNameInput || "Study group", "group"); setRoomNameInput(""); }} className="flex gap-2 rounded-2xl border border-indigo-500/25 bg-slate-950/50 p-3">
                    <input value={roomNameInput} onChange={(e) => setRoomNameInput(e.target.value)} placeholder="Study group name" className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                    <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Plus className="mr-1 inline h-4 w-4"/>Create</button>
                  </form>
                  <form onSubmit={joinStudyRoom} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                    <label className="block text-[10px] font-semibold text-slate-400">Enter a study room code to join</label>
                    <div className="flex gap-2"><input value={inviteCodeInput} onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase().slice(0, 6))} placeholder="6-character invite code" maxLength={6} className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs uppercase tracking-widest text-white" />
                    <button type="submit" className="rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-4 py-2 text-xs font-bold text-indigo-100">Join Room</button></div>
                  </form>
                  {roomNotice && <p className="text-xs text-amber-300">{roomNotice}</p>}
                  {firebaseError && <p className="rounded-lg bg-rose-950/50 p-2 text-xs text-rose-300">{firebaseError}</p>}
                  <div className="space-y-2">{rooms.map((room) => <div key={room.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3"><button onClick={() => setActiveRoom(room)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="rounded-lg bg-indigo-600/20 p-2 text-indigo-200"><MessageSquare className="h-4 w-4"/></span><span className="min-w-0"><span className="block truncate text-xs font-bold">{room.name}</span><span className="text-[10px] text-slate-400">{room.type === "subject" ? "Subject chat" : "Study group"}</span></span></button>{room.inviteCode && <button onClick={() => { navigator.clipboard.writeText(room.inviteCode!); setRoomNotice(`Invite code ${room.inviteCode} copied.`); }} className="rounded-lg border border-slate-700 px-2 py-1 font-mono text-[10px] tracking-wider text-indigo-200">{room.inviteCode}</button>}</div>)}{rooms.length === 0 && <div className={`rounded-2xl border-2 border-dashed py-8 text-center ${darkMode ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-400"}`}><MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-40"/><p className="text-xs">No study rooms yet. Create one or join with a code.</p></div>}</div>
                  </> : <div className="space-y-4">
                    <form onSubmit={sendFriendRequest} className="space-y-2 rounded-2xl border border-indigo-500/25 bg-slate-950/50 p-3"><label className="block text-xs font-semibold">Find a friend by their 6-digit code</label><div className="flex gap-2"><input value={friendCodeSearch} onChange={(e) => setFriendCodeSearch(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter friend code" maxLength={6} inputMode="numeric" className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs tracking-widest text-white"/><button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Send Request</button></div>{friendNotice && <p className="text-[10px] text-indigo-200">{friendNotice}</p>}</form>
                    {firebaseError && <p className="rounded-lg bg-rose-950/50 p-2 text-xs text-rose-300">{firebaseError}</p>}
                    <section className="space-y-2"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">Friend Requests {incomingRequests.length > 0 && <span className="text-indigo-300">({incomingRequests.length})</span>}</h4>{incomingRequests.map((request) => <div key={request.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3"><div><p className="text-xs font-bold">{request.senderName || "Student"}</p><p className="font-mono text-[10px] text-slate-400">#{request.senderCode}</p></div><div className="flex gap-1"><button onClick={() => void acceptFriendRequest(request)} className="rounded-lg bg-emerald-700 px-2 py-1.5 text-[10px] font-bold text-white">Accept</button><button onClick={() => void declineFriendRequest(request)} className="rounded-lg bg-slate-800 px-2 py-1.5 text-[10px] font-bold text-slate-300">Decline</button></div></div>)}{incomingRequests.length === 0 && <p className="text-[10px] text-slate-500">No incoming requests.</p>}</section>
                    <section className="space-y-2"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">Your Friends</h4>{friendProfiles.map((friend) => <div key={friend.uid} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3"><div><p className="text-xs font-bold">{friend.username}</p><p className="font-mono text-[10px] text-slate-400">#{friend.friendCode}</p></div><span className="rounded-full bg-emerald-900/40 px-2 py-1 text-[9px] text-emerald-300">Friends</span></div>)}{friendProfiles.length === 0 && <p className="text-[10px] text-slate-500">Your accepted friends will appear here.</p>}</section>
                    <section className="space-y-2"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">Sent · Pending</h4>{outgoingRequests.map((request) => <div key={request.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3"><div><p className="text-xs font-bold">{request.receiverName || "Student"}</p><p className="font-mono text-[10px] text-slate-400">#{request.receiverCode}</p></div><span className="rounded-full bg-amber-900/40 px-2 py-1 text-[9px] text-amber-300">Pending</span></div>)}{outgoingRequests.length === 0 && <p className="text-[10px] text-slate-500">No pending sent requests.</p>}</section>
                  </div>}
                </> : <section className="flex min-h-[390px] flex-col rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                  <div className="mb-3 flex items-center gap-2 border-b border-slate-800 pb-3"><button onClick={() => { setActiveRoom(null); setFirebaseError(""); }} className="rounded-lg p-1 text-slate-300 hover:bg-slate-800" aria-label="Back to chats"><ChevronLeft className="h-5 w-5"/></button><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold">{activeRoom.name}</h4><p className="text-[10px] text-slate-400">{activeRoom.type === "subject" ? "Subject room · live" : "Study room · live"}</p></div>{activeRoom.inviteCode && <button onClick={() => { navigator.clipboard.writeText(activeRoom.inviteCode!); setRoomNotice(`Invite code ${activeRoom.inviteCode} copied.`); }} className="rounded-lg border border-slate-700 px-2 py-1 font-mono text-[10px] text-indigo-200">{activeRoom.inviteCode}</button>}</div>
                  {roomNotice && <p className="mb-2 text-[10px] text-emerald-300">{roomNotice}</p>}{firebaseError && <p className="mb-2 rounded-lg bg-rose-950/50 p-2 text-xs text-rose-300">{firebaseError}</p>}
                  <div className="flex-1 space-y-2 overflow-y-auto py-1">{chatMessages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-xl px-3 py-2 ${message.senderId === firebaseUser?.uid ? "ml-auto bg-indigo-600 text-white" : "bg-slate-800 text-slate-100"}`}><p className="mb-1 text-[9px] font-bold opacity-75">{message.senderName || "Student"}</p><p className="whitespace-pre-wrap break-words text-xs">{message.text}</p>{message.createdAt && <p className="mt-1 text-right text-[8px] opacity-60">{message.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}</div>)}{chatMessages.length === 0 && <p className="py-12 text-center text-xs text-slate-500">Say hello to start the conversation.</p>}</div>
                  <form onSubmit={sendChatMessage} className="mt-3 flex gap-2 border-t border-slate-800 pt-3"><input value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} placeholder="Write a message…" maxLength={2000} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"/><button disabled={!messageDraft.trim() || isSendingMessage} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><ArrowRight className="h-4 w-4"/></button></form>
                </section>}
              </div>
            )}

            {/* ACADEMICS TAB: Full Functional Study App (Tasks, Attendance, SGPA, Pomodoro) */}
            {homeTab === "academics" && (
              <div className="flex-1 flex flex-col pt-4 space-y-4 overflow-y-auto">
                <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button onClick={() => navigate({ academicsSubTab: "dashboard" })} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${academicsSubTab === "dashboard" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Dashboard</button>
                  <button onClick={() => navigate({ academicsSubTab: "tasks" })} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${academicsSubTab === "tasks" ? "bg-emerald-600 text-white" : "text-slate-400"}`}>Notes & Todos</button>
                  <button onClick={() => navigate({ academicsSubTab: "pomodoro" })} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${academicsSubTab === "pomodoro" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Timer</button>
                  <button onClick={() => navigate({ academicsSubTab: "subjects" })} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${academicsSubTab === "subjects" ? "bg-teal-600 text-white" : "text-slate-400"}`}>Bunks</button>
                  <button onClick={() => navigate({ academicsSubTab: "grades" })} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${academicsSubTab === "grades" ? "bg-amber-600 text-white" : "text-slate-400"}`}>SGPA</button>
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
                          onClick={() => navigate({ academicsSubTab: "pomodoro" })}
                          className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl"
                        >
                          Open Focus Timer
                        </button>
                      </div>
                    </>
                  )}

                  {academicsSubTab === "tasks" && (
                    <div className="space-y-3">
                      <div className="flex gap-2 rounded-xl bg-slate-950 border border-slate-800 p-1">
                        <button onClick={() => setNotesTodosView("todos")} className={`flex-1 rounded-lg py-2 text-xs font-bold ${notesTodosView === "todos" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Todos</button>
                        <button onClick={() => setNotesTodosView("notes")} className={`flex-1 rounded-lg py-2 text-xs font-bold ${notesTodosView === "notes" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Notes</button>
                      </div>
                      {notesTodosView === "todos" ? <div className="space-y-3">
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
                      </div> : <div className="space-y-3">
                        <form onSubmit={addNote} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                          <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                          <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Write a note…" rows={3} className="w-full resize-y rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                          <div className="flex gap-2"><input value={noteTagsInput} onChange={(e) => setNoteTagsInput(e.target.value)} placeholder="Tags: exam, homework, important" className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" /><button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Plus className="mr-1 inline h-4 w-4"/>Save</button></div>
                        </form>
                        <div className="flex gap-2"><input value={noteSearch} onChange={(e) => setNoteSearch(e.target.value)} placeholder="Search notes or tags…" className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white" /><select value={activeNoteTag} onChange={(e) => setActiveNoteTag(e.target.value)} className="max-w-36 rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs text-white"><option value="all">All tags</option>{allNoteTags.map((tag) => <option key={tag} value={tag}>#{tag}</option>)}</select></div>
                        <div className="space-y-2">{filteredNotes.map((note) => <article key={note.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="text-xs font-bold text-slate-100">{note.title}</h4>{note.body && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{note.body}</p>}</div><button onClick={() => deleteNote(note.id)} aria-label="Delete note" className="text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4"/></button></div>{note.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{note.tags.map((tag) => <button key={tag} onClick={() => setActiveNoteTag(tag)} className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200">#{tag}</button>)}</div>}</article>)}{filteredNotes.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No notes match this filter yet.</p>}</div>
                      </div>}
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
                                <button onClick={() => createStudyRoom(`${sub.name} Chat`, "subject", `subject-${sub.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "study"}`)} className="flex items-center gap-1 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-200"><MessageSquare className="h-3 w-3"/>Subject Chat</button>
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
