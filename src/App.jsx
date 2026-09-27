import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronDown, Circle, Copy, LogIn, Menu, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import {
  firebaseConfigured,
  getIdToken,
  getDeviceSessionId,
  isAllowedEmail,
  OWNER_UID,
  removeCollectionItem,
  registerDeviceSession,
  signInWithGoogle,
  signOutUser,
  saveCollectionItem,
  watchAuthState,
  watchCollection,
  watchDeviceSession,
} from './firebase.js'

function makeSchedule(tasks) {
  const starts = ['3:30 PM', '4:25 PM', '5:10 PM', '6:15 PM']
  return [...tasks].filter((task) => !task.done).sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority])).map((task, index) => ({
    ...task,
    start: starts[index % starts.length],
    reason: task.priority === 'High' ? 'High priority' : 'Fits the available time',
  }))
}

function App() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!firebaseConfigured)
  const [authBusy, setAuthBusy] = useState(false)
  const [verified, setVerified] = useState(false)
  const [tasks, setTasks] = useState([])
  const [remoteSubjects, setRemoteSubjects] = useState([])
  const [newTask, setNewTask] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [brief, setBrief] = useState('')
  const [briefBusy, setBriefBusy] = useState(false)
  const [bulletin, setBulletin] = useState(null)
  const [bulletinBusy, setBulletinBusy] = useState(false)
  const [chatMessage, setChatMessage] = useState('')
  const [chatReply, setChatReply] = useState('')
  const [chatBusy, setChatBusy] = useState(false)

  useEffect(() => watchAuthState((nextUser) => {
    setAuthReady(true)
    if (nextUser && (!nextUser.emailVerified || !isAllowedEmail(nextUser.email) || nextUser.uid !== OWNER_UID)) {
      signOutUser()
      setUser(null)
      setError('Use a verified @nyu.edu, @aischennai.org, or @proton.me account.')
      return
    }
    if (nextUser) {
      registerDeviceSession().catch(() => setNotice('Identity verified. Trusted three-device enforcement is not active until its server function is deployed.'))
      setVerified(true)
      window.setTimeout(() => setVerified(false), 1800)
    }
    setUser(nextUser)
    if (!nextUser) {
      setTasks([])
      setRemoteSubjects([])
    }
  }), [])

  const handleSignIn = async () => {
    setAuthBusy(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Sign-in was not completed.')
    } finally {
      setAuthBusy(false)
    }
  }

  useEffect(() => {
    if (!user || user.uid !== OWNER_UID) return undefined
    const stopTasks = watchCollection(user.uid, 'tasks', setTasks, () => setError('Tasks could not be loaded.'))
    const stopSubjects = watchCollection(user.uid, 'subjects', setRemoteSubjects, () => setError('Subjects could not be loaded.'))
    const stopSession = watchDeviceSession(user.uid, () => {
      setError('This device session was revoked because the three-device limit was reached.')
      signOutUser()
    })
    return () => { stopTasks(); stopSubjects(); stopSession() }
  }, [user])

  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(timer) } }, [notice])

  const todayLabel = useMemo(() => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()), [])
  const schedule = useMemo(() => makeSchedule(tasks), [tasks])
  const completed = tasks.filter((task) => task.done).length
  const allSubjects = remoteSubjects

  const updateTask = async (task) => {
    const next = { ...task, updatedAt: new Date().toISOString() }
    try {
      await saveCollectionItem(user.uid, 'tasks', task.id, next)
    } catch {
      setError('Task could not be saved. Check your connection and try again.')
    }
  }
  const addTask = async (event) => {
    event.preventDefault()
    const title = newTask.trim()
    if (!title) { setError('Enter a task before adding it.'); return }
    const task = { id: crypto.randomUUID(), title, duration: 30, priority: 'Medium', done: false, deadline: '' }
    if (!user) { setError('Sign in before saving tasks across devices.'); return }
    await updateTask(task)
    setNewTask('')
    setShowAdd(false)
    setNotice('Task added.')
  }
  const deleteTask = async (task) => {
    try { await removeCollectionItem(user.uid, 'tasks', task.id); setNotice('Task removed.') } catch { setError('Task could not be removed.') }
  }
  const exportDay = async () => {
    const text = `DAYMARK\n${todayLabel}\n\nTASKS\n${tasks.length ? tasks.map((item) => `${item.done ? '[x]' : '[ ]'} ${item.title}`).join('\n') : 'No tasks added.'}\n\nSCHEDULE\n${schedule.length ? schedule.map((item) => `${item.start} ${item.title} (${item.duration} min)`).join('\n') : 'No scheduled tasks.'}`
    try { await navigator.clipboard.writeText(text); setNotice('Day copied to clipboard.') } catch { setError('Clipboard access is unavailable in this browser.') }
  }
  const generateBrief = async () => {
    setBriefBusy(true)
    try {
      const token = await getIdToken()
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Daymark-Access': window.sessionStorage.getItem('daymark-access-token') || '', 'X-Daymark-Session': getDeviceSessionId(), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({ tasks, schedule }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Brief unavailable.')
      setBrief(result.text)
      setNotice('Brief ready.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Brief endpoint unavailable.')
    } finally { setBriefBusy(false) }
  }
  const requestHeaders = async () => {
    const token = await getIdToken()
    return { 'Content-Type': 'application/json', 'X-Daymark-Access': window.sessionStorage.getItem('daymark-access-token') || '', 'X-Daymark-Session': getDeviceSessionId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }
  const loadBulletin = async () => {
    setBulletinBusy(true)
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/bulletin`, { headers: await requestHeaders() })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Bulletin unavailable.')
      setBulletin(result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Bulletin endpoint unavailable.')
    } finally { setBulletinBusy(false) }
  }
  const sendChatMessage = async (event) => {
    event.preventDefault()
    if (!chatMessage.trim()) return
    setChatBusy(true)
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/chat`, { method: 'POST', headers: await requestHeaders(), body: JSON.stringify({ message: chatMessage }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Chat unavailable.')
      setChatReply(result.text)
      setChatMessage('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Chat endpoint unavailable.')
    } finally { setChatBusy(false) }
  }

  if (!authReady || (!user && firebaseConfigured)) {
    return <div className="welcome-shell"><div className="welcome-card"><div className="brand"><div className="brand-mark">d</div><span>daymark</span></div><p className="eyebrow">Private dashboard</p><h1>Welcome to your private dashboard.</h1><p className="hero-copy">Sign in with Google to verify that it’s you and open your private planning space.</p>{error && <div className="form-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}<button className="welcome-sign-in" onClick={handleSignIn} disabled={authBusy}>{authBusy ? 'Verifying account' : 'Sign in with Google'}<LogIn size={17} /></button><p className="welcome-note">Only the verified owner account can continue.</p></div></div>
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">d</div><span>daymark</span></div><div className="top-actions"><span className="status-label">{firebaseConfigured ? (user ? `Signed in: ${user.email}` : 'Sign-in required') : 'Local preview only'}</span><button className="icon-button" aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={18} /></button>{menuOpen && <div className="menu-popover">{firebaseConfigured ? <button onClick={async () => { if (user) await signOutUser(); else await signInWithGoogle(); setMenuOpen(false) }}>{user ? 'Sign out' : 'Sign in with Google'}</button> : <span>Configure Firebase to enable sync.</span>}</div>}</div></header>
    <main className="page">
      <section className="hero"><div><p className="eyebrow">{todayLabel} <span>/</span> Junior year</p><h1>Today, clearly.</h1><p className="hero-copy">A private workspace for the work you choose to keep in view.</p></div><div className="hero-controls"><button className="soft-button" onClick={exportDay}><Copy size={16} /> Copy day</button>{firebaseConfigured && <button className="soft-button dark" onClick={async () => { try { await signInWithGoogle(); setNotice('Signed in.')} catch (signInError) { setError(signInError instanceof Error ? signInError.message : 'Sign-in was not completed.') } }}><LogIn size={16} /> {user ? 'Account' : 'Sign in'}</button>}</div></section>
      {verified && <div className="verified-banner" role="status"><Check size={16} /> Identity verified.</div>}
      {error && <div className="form-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}
      <div className="notice" role="status"><CalendarDays size={15} /><span>{user ? 'Your data is connected to this account.' : 'Sign in to save tasks and subjects across devices.'}<button onClick={loadBulletin} disabled={bulletinBusy}>{bulletinBusy ? 'Loading bulletin' : 'Latest bulletin'}</button></span><RefreshCw size={14} /></div>
      <section className="brief-strip"><div><p className="eyebrow">Daily brief</p><p>{brief || 'Generate a short summary from the tasks you have added.'}</p></div><button className="soft-button" onClick={generateBrief} disabled={briefBusy}>{briefBusy ? 'Generating' : 'Generate brief'}</button></section>
      {bulletin && <section className="module bulletin-card"><div className="module-head"><div><p className="eyebrow">Morning bulletin</p><h3>{bulletin.title}</h3></div>{bulletin.link && <a href={bulletin.link} target="_blank" rel="noreferrer">Open source</a>}</div><p className="module-note">{bulletin.text || 'The latest bulletin has no readable text.'}</p></section>}
      <section className="module chat-card"><div className="module-head"><div><p className="eyebrow">Private assistant</p><h3>Ask Daymark</h3></div></div>{chatReply && <p className="chat-reply">{chatReply}</p>}<form className="add-form" onSubmit={sendChatMessage}><input value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} placeholder="Ask about planning your day" aria-label="Message Daymark" maxLength={2000} /><button className="soft-button dark" disabled={chatBusy}>{chatBusy ? 'Thinking' : 'Send'}</button></form></section>
      <div className="dashboard-grid"><div className="main-column"><section className="section-heading"><div><p className="eyebrow">Focus lane</p><h2>Tasks for today</h2></div><span className="muted">{completed} of {tasks.length} complete</span></section><section className="module"><div className="module-head"><div><p className="eyebrow">Rapid capture</p><h3>Your task list</h3></div><button className="round-button" aria-label="Add task" onClick={() => setShowAdd(!showAdd)}>{showAdd ? <X size={17} /> : <Plus size={17} />}</button></div>{showAdd && <form className="add-form" onSubmit={addTask}><input autoFocus value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Add a task" aria-label="Task title" /><button className="soft-button dark">Add</button></form>}<div className="task-list">{tasks.length ? tasks.map((task) => <div className={`task-row ${task.done ? 'is-done' : ''}`} key={task.id}><button className="check-button" onClick={() => updateTask({ ...task, done: !task.done })} aria-label={task.done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}>{task.done ? <Check size={15} /> : <Circle size={15} />}</button><div className="task-content"><strong>{task.title}</strong><span>{task.duration || 30} minutes</span></div><button className={`priority priority-${(task.priority || 'Medium').toLowerCase()}`} onClick={() => updateTask({ ...task, priority: task.priority === 'High' ? 'Low' : task.priority === 'Low' ? 'Medium' : 'High' })}>{task.priority || 'Medium'} <ChevronDown size={13} /></button><button className="row-icon" aria-label={`Delete ${task.title}`} onClick={() => deleteTask(task)}><Trash2 size={15} /></button></div>) : <p className="empty-state">No tasks yet. Add the next thing you need to do.</p>}</div></section><section className="module"><div className="module-head"><div><p className="eyebrow">Deterministic plan</p><h3>Available afternoon blocks</h3></div></div><div className="schedule-list">{schedule.length ? schedule.map((item) => <div className="schedule-row" key={item.id}><time>{item.start}</time><div className="schedule-bar"><strong>{item.title}</strong><span>{item.duration || 30} minutes / {item.reason}</span></div></div>) : <p className="empty-state">Add an incomplete task to create a plan.</p>}</div></section></div>
        <aside className="side-column"><section className="module"><div className="module-head"><div><p className="eyebrow">Junior year</p><h3>Subjects and blocks</h3></div></div><p className="module-note">School year starts August 4.</p><div className="subject-list">{allSubjects.map((subject) => <div className="subject-row" key={subject.id}><span className="subject-block">{subject.block}</span><div><strong>{subject.name}</strong><span>{[subject.teacher, subject.term].filter(Boolean).join(' / ')}</span></div></div>)}</div></section><section className="module"><div className="module-head"><div><p className="eyebrow">Deadlines and goals</p><h3>Your horizon</h3></div></div><p className="empty-state">No deadlines added yet. Add only dates that matter to you.</p></section><section className="module"><div className="module-head"><div><p className="eyebrow">Privacy</p><h3>Private by default</h3></div></div><p className="module-note">Your dashboard is intended for your account and is excluded from search indexing. Data access is restricted to your verified account.</p></section></aside></div>
      <footer><span>daymark / private life dashboard</span><span><a href="/privacy.html">Privacy</a> / <a href="/terms.html">Terms</a> / Rules-based planning works without an AI provider.</span></footer>
    </main>{notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
  </div>
}

export default App
