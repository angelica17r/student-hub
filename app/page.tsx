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
interface FriendRequest { receiverName: string; receiverCode: string; id: string; senderUid: string; receiverUid: string; senderName: string; senderCode: string; status: "pending" | "accepted"; }

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
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(null);
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

    if (savedTasks) setTasks(JSON.parse(savedTasks));
    if (savedSubjects) setSubjects(JSON.parse(savedSubjects));
    if (savedCourses) setCourses(JSON.parse(savedCourses));
    if (savedUsers) setRegisteredUsers(JSON.parse(savedUsers));
    if (savedNotes) setNotes(JSON.parse(savedNotes));
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

  // The prototype login remains local; Firebase anonymous auth supplies a safe
  // per-install sender identity for Firestore operations.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setFirebaseUser(user);
      else signInAnonymously(auth).catch((error) => setFirebaseError(error?.message || "Firebase sign-in failed. Enable Anonymous auth in Firebase."));
    });
    return unsubscribe;
  }, []);

  // Show only rooms that this signed-in user has actually created or joined.
  useEffect(() => {
    if (!firebaseUser) { setRooms([]); return; }
    const memberRoomsQuery = query(
      collection(db, "studyRooms"),
      where("members", "array-contains", firebaseUser.uid)
    );
    return onSnapshot(memberRoomsQuery, (snapshot) => {
      // Subject chats were app-generated from the Academics screen; keep them out
      // of the chat list so it only contains user-created/joined study rooms.
      setRooms(snapshot.docs
        .filter((roomDoc) => roomDoc.data().type !== "subject")
        .map((roomDoc) => {
          const data = roomDoc.data();
          return {
            id: roomDoc.id,
            name: data.name || "Study room",
            type: "group",
            inviteCode: typeof data.inviteCode === "string" ? data.inviteCode : undefined,
          } as StudyRoom;
        }));
    }, (error) => setFirebaseError(error.message || "Could not load your joined and created rooms."));
  }, [firebaseUser?.uid]);

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
            transaction.set(roomRef, { name: cleanName, type, inviteCode: code, members: [firebaseUser.uid], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
  const inviteFriendToRoom = async (room: StudyRoom, friend: FriendProfile) => {
    if (!firebaseUser) { setRoomNotice("Connecting securely to chat… please try again in a moment."); return; }
    try {
      await updateDoc(doc(db, "studyRooms", room.id), {
        members: arrayUnion(friend.uid),
        updatedAt: serverTimestamp(),
      });
      setRoomNotice(`${friend.username} was added to ${room.name}.`);
    } catch (error: any) {
      setFirebaseError(error?.message || "Could not add this friend. Check your Firestore permissions.");
    }
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
          --study-room-background: url("data:image/png;base64,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");
          position: absolute;
          z-index: 0;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          background-image: linear-gradient(180deg, rgba(25,0,25,.20), rgba(25,0,25,.42)), var(--study-room-background);
          background-size: cover;
          background-position: center;
          image-rendering: auto;
        }
        .theme-day .pixel-room-scene {
          background-image: linear-gradient(180deg, rgba(251,228,216,.12), rgba(43,18,76,.32)), var(--study-room-background);
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
                  <div className="space-y-2">{rooms.map((room) => <div key={room.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="flex items-center justify-between gap-2"><button onClick={() => setActiveRoom(room)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="rounded-lg bg-indigo-600/20 p-2 text-indigo-200"><MessageSquare className="h-4 w-4"/></span><span className="min-w-0"><span className="block truncate text-xs font-bold">{room.name}</span><span className="text-[10px] text-slate-400">Study group</span></span></button><div className="flex shrink-0 items-center gap-1">{room.inviteCode && <button onClick={() => { void navigator.clipboard.writeText(room.inviteCode!); setRoomNotice(`Room code ${room.inviteCode} copied.`); }} aria-label={`Copy room code ${room.inviteCode}`} className="rounded-lg border border-slate-700 px-2 py-1 font-mono text-[10px] tracking-wider text-indigo-200">Code {room.inviteCode}</button>}<button onClick={() => { setInviteRoomId(inviteRoomId === room.id ? null : room.id); setRoomNotice(""); }} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1.5 text-[10px] font-bold text-white"><Users className="h-3 w-3"/>Invite</button></div></div>{inviteRoomId === room.id && <div className="mt-3 space-y-2 border-t border-slate-800 pt-3"><p className="text-[10px] font-semibold text-slate-400">Add a friend to {room.name}</p>{friendProfiles.length ? friendProfiles.map((friend) => <div key={friend.uid} className="flex items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2"><span className="truncate text-xs">{friend.username} <span className="font-mono text-[10px] text-slate-500">#{friend.friendCode}</span></span><button onClick={() => void inviteFriendToRoom(room, friend)} className="shrink-0 rounded-md border border-indigo-400/30 px-2 py-1 text-[10px] font-bold text-indigo-200">Add to room</button></div>) : <p className="text-[10px] text-slate-500">Accept friend requests first, then you can add friends here.</p>}</div>}</div>)}{rooms.length === 0 && <div className={`rounded-2xl border-2 border-dashed py-8 text-center ${darkMode ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-400"}`}><MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-40"/><p className="text-xs">No study rooms yet. Create one or join with a code.</p></div>}</div>
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
