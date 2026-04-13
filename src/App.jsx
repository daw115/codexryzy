import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

const MODELS = [
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (Fast)' },
  { id: 'claude-sonnet-4-thinking', name: 'Claude Sonnet Thinking' },
  { id: 'claude-opus-4-thinking', name: 'Claude Opus Thinking' },
  { id: 'gpt-4.1', name: 'GPT-4.1' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
]

const DEFAULT_API_KEY = import.meta.env.VITE_API_KEY || ''
const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.quatarly.cloud/v0'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function getTitle(messages) {
  const first = messages.find(m => m.role === 'user')
  if (!first) return 'New Chat'
  const text = first.content.trim()
  return text.length > 45 ? text.slice(0, 45) + '...' : text
}

export default function App() {
  const [conversations, setConversations] = useState(() => {
    try { return JSON.parse(localStorage.getItem('chatgpt_convs') || '[]') }
    catch { return [] }
  })
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [model, setModel] = useState(() => localStorage.getItem('chatgpt_model') || MODELS[0].id)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('chatgpt_apikey') || DEFAULT_API_KEY)
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('chatgpt_baseurl') || DEFAULT_BASE_URL)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copiedId, setCopiedId] = useState(null)
  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('chatgpt_convs', JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    localStorage.setItem('chatgpt_model', model)
  }, [model])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadConversation = useCallback((id) => {
    const conv = conversations.find(c => c.id === id)
    if (conv) {
      setActiveId(id)
      setMessages(conv.messages)
      setInput('')
    }
  }, [conversations])

  const newChat = () => {
    setActiveId(null)
    setMessages([])
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const deleteConversation = (id, e) => {
    e.stopPropagation()
    setConversations(prev => prev.filter(c => c.id !== id))
    if (activeId === id) newChat()
  }

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return
    if (!apiKey) {
      setShowSettings(true)
      return
    }

    const userMsg = { role: 'user', content: input.trim(), id: generateId() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setIsStreaming(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const assistantMsgId = generateId()
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      id: assistantMsgId,
      streaming: true
    }])

    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: newMessages.map(({ role, content }) => ({ role, content })),
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error?.message || `HTTP error ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta?.content || ''
            if (delta) {
              fullContent += delta
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: fullContent } : m
              ))
            }
          } catch {}
        }
      }

      const finalMessages = [
        ...newMessages,
        { role: 'assistant', content: fullContent, id: assistantMsgId }
      ]
      setMessages(finalMessages)

      if (activeId) {
        setConversations(prev => prev.map(c =>
          c.id === activeId
            ? { ...c, messages: finalMessages, updatedAt: Date.now() }
            : c
        ))
      } else {
        const newConv = {
          id: generateId(),
          title: getTitle(finalMessages),
          messages: finalMessages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        setConversations(prev => [newConv, ...prev])
        setActiveId(newConv.id)
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: `**Error:** ${err.message}`, error: true }
            : m
        ))
      }
    } finally {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, streaming: false } : m
      ))
      setIsStreaming(false)
    }
  }

  const stopStreaming = () => {
    abortControllerRef.current?.abort()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleTextareaChange = (e) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  const copyMessage = async (content, id) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {}
  }

  const saveSettings = (key, url) => {
    localStorage.setItem('chatgpt_apikey', key)
    localStorage.setItem('chatgpt_baseurl', url)
    setApiKey(key)
    setBaseUrl(url)
    setShowSettings(false)
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={newChat}>
            <IconPlus />
            New chat
          </button>
        </div>

        <div className="conversations-list">
          {conversations.length === 0 ? (
            <p className="no-convs">No conversations yet</p>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`conv-item ${activeId === conv.id ? 'active' : ''}`}
                onClick={() => loadConversation(conv.id)}
              >
                <IconChat />
                <span className="conv-title">{conv.title}</span>
                <button
                  className="delete-btn"
                  onClick={(e) => deleteConversation(conv.id, e)}
                  title="Delete"
                >
                  <IconX size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            <IconSettings />
            Settings
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <div className="top-bar">
          <button className="toggle-sidebar" onClick={() => setSidebarOpen(p => !p)} title="Toggle sidebar">
            <IconMenu />
          </button>
          <select
            className="model-selector"
            value={model}
            onChange={e => setModel(e.target.value)}
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          {!apiKey && (
            <button className="api-key-warning" onClick={() => setShowSettings(true)}>
              Set API Key
            </button>
          )}
        </div>

        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-logo">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10a37f" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h1>How can I help you today?</h1>
              <div className="suggestions">
                {[
                  'Explain quantum computing in simple terms',
                  'Write a Python function to sort a list',
                  'What are the best practices for React?',
                  'Help me debug this code',
                ].map(s => (
                  <button key={s} className="suggestion" onClick={() => {
                    setInput(s)
                    textareaRef.current?.focus()
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map(msg => (
                <div key={msg.id} className={`message ${msg.role} ${msg.error ? 'error' : ''}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? 'U' : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    )}
                  </div>
                  <div className="message-content">
                    {msg.role === 'assistant' ? (
                      <div className="markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content || (msg.streaming ? ' ' : '')}
                        </ReactMarkdown>
                        {msg.streaming && <span className="cursor">▌</span>}
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                    {!msg.streaming && msg.content && (
                      <button
                        className="copy-btn"
                        onClick={() => copyMessage(msg.content, msg.id)}
                        title={copiedId === msg.id ? 'Copied!' : 'Copy'}
                      >
                        {copiedId === msg.id ? <IconCheck /> : <IconCopy />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="input-area">
          <div className="input-container">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Message ChatGPT..."
              rows={1}
              disabled={isStreaming}
              autoFocus
            />
            <button
              className={`send-btn ${isStreaming ? 'stop' : ''}`}
              onClick={isStreaming ? stopStreaming : sendMessage}
              disabled={!isStreaming && !input.trim()}
              title={isStreaming ? 'Stop' : 'Send'}
            >
              {isStreaming ? <IconStop /> : <IconSend />}
            </button>
          </div>
          <p className="disclaimer">AI can make mistakes. Check important information.</p>
        </div>
      </main>

      {showSettings && (
        <SettingsModal
          apiKey={apiKey}
          baseUrl={baseUrl}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

function SettingsModal({ apiKey, baseUrl, onSave, onClose }) {
  const [key, setKey] = useState(apiKey)
  const [url, setUrl] = useState(baseUrl)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button onClick={onClose}><IconX size={20} /></button>
        </div>
        <div className="modal-body">
          <label>
            Quatarly API Key
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="qua-..."
              autoFocus
            />
          </label>
          <label>
            Base URL
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://api.quatarly.cloud/v0"
            />
          </label>
          <p className="settings-note">
            Get your API key at <a href="https://api.quatarly.cloud/management" target="_blank" rel="noreferrer">api.quatarly.cloud/management</a>
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(key.trim(), url.trim())}>Save</button>
        </div>
      </div>
    </div>
  )
}

// Icons
const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)

const IconChat = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink: 0}}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

const IconX = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>
)

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
  </svg>
)

const IconMenu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)

const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 19V5M5 12l7-7 7 7"/>
  </svg>
)

const IconStop = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>
)

const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10a37f" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
